"""Fine-tune the four-class AIHub YOLO11n checkpoint on TACO YOLO data."""

import csv
import hashlib
import platform
import subprocess
from pathlib import Path

import torch
import ultralytics
import wandb
import yaml
from ultralytics import YOLO


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CLASSES = ["general", "plastic", "can", "glass"]
METRIC_NAMES = {
    "metrics/precision(B)": "val/precision",
    "metrics/recall(B)": "val/recall",
    "metrics/mAP50(B)": "val/map50",
    "metrics/mAP50-95(B)": "val/map50_95",
    "lr/pg0": "train/lr_pg0",
    "lr/pg1": "train/lr_pg1",
    "lr/pg2": "train/lr_pg2",
}


def main() -> None:
    config_path = HERE / "config.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    weights = (HERE / config.pop("weights")).resolve()
    data = (HERE / config.pop("data")).resolve()
    run_dir = HERE / "run"
    if not weights.is_file() or not data.is_file():
        raise FileNotFoundError(f"Check weights and data paths: {weights}, {data}")
    if run_dir.exists():
        raise FileExistsError(f"Run output already exists: {run_dir}")

    dataset = yaml.safe_load(data.read_text(encoding="utf-8"))
    if [dataset["names"][i] for i in range(4)] != CLASSES or len(dataset["names"]) != 4:
        raise ValueError(f"Expected four classes in this order: {CLASSES}")
    data_root = Path(dataset["path"])
    if data_root.resolve() != data.parent:
        raise ValueError(f"data.yaml points to {data_root}, expected {data.parent}")

    manifest = HERE / "data_manifest.tsv"
    with manifest.open("w", encoding="utf-8", newline="") as file:
        for split in ("train", "val"):
            for kind in ("images", "labels"):
                directory = data_root / kind / split
                if not directory.is_dir():
                    raise FileNotFoundError(directory)
                for path in sorted(directory.iterdir()):
                    if path.is_file() and path.suffix.lower() in ({".jpg", ".jpeg", ".png"} if kind == "images" else {".txt"}):
                        print(split, kind, path.name, path.stat().st_size, sep="\t", file=file)

    train_args = {**config, "data": str(data), "project": str(HERE), "name": "run", "exist_ok": False}
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"
    run_config = {
        "model/id": "yolo11n",
        "model/architecture": "YOLO11n",
        "model/init_weights": {
            "source": "AIHub living s0 best.pt",
            "version": "s0",
            "sha256": hashlib.sha256(weights.read_bytes()).hexdigest(),
        },
        "model/parent_experiment": "yolo_11n__aihub_living-v1__trash_feature_training__s0",
        "model/parent_run_id": "c8bx21zq",
        "data/id": "taco_yolo",
        "data/version": "v2",
        "data/split_id": "TACO YOLO train/val",
        "data/classes": CLASSES,
        "data/manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "train/args": train_args,
        "train/seed": config["seed"],
        "code/commit": commit,
        "env/versions": {"python": platform.python_version(), "ultralytics": ultralytics.__version__, "torch": torch.__version__, "cuda": torch.version.cuda},
        "eval/protocol_id": "taco-yolo-val-v2",
        "eval/args": {"split": "val", "imgsz": config["imgsz"], "conf": 0.001, "nms_iou": 0.7, "match_iou": "0.50:0.95", "max_det": 300},
    }

    with wandb.init(project="jupjup", name=HERE.name, group=HERE.name.rsplit("__s", 1)[0], config=run_config, job_type="train") as run:
        model = YOLO(str(weights))
        results_file = run_dir / "results.csv"
        try:
            model.train(**train_args)
        finally:
            if results_file.is_file():
                with results_file.open(newline="", encoding="utf-8") as file:
                    for row in csv.DictReader(file):
                        values = {key.strip(): float(value) for key, value in row.items() if key not in {"epoch", "time"} and value}
                        values.update({alias: values[source] for source, alias in METRIC_NAMES.items() if source in values})
                        run.log({"epoch": int(row["epoch"]), **values})

        args_file = run_dir / "args.yaml"
        best = run_dir / "weights" / "best.pt"
        effective_args = yaml.safe_load(args_file.read_text(encoding="utf-8"))
        effective_args["optimizer"] = type(model.trainer.optimizer).__name__
        effective_args["lr0"] = float(model.trainer.args.lr0)
        effective_args["batch"] = int(model.trainer.batch_size)
        effective_file = run_dir / "effective_args.yaml"
        effective_file.write_text(yaml.safe_dump(effective_args, allow_unicode=True, sort_keys=False), encoding="utf-8")
        run.config.update({"train/args": effective_args}, allow_val_change=True)
        run.summary["train/optimizer"] = effective_args["optimizer"]
        run.summary["train/lr0"] = effective_args["lr0"]

        evaluation = YOLO(str(best)).val(
            data=str(data), split="val", imgsz=config["imgsz"], conf=0.001, iou=0.7,
            max_det=300, project=str(HERE), name="eval", exist_ok=False, plots=True,
        )
        run.summary.update({
            "eval/precision": float(evaluation.box.mp),
            "eval/recall": float(evaluation.box.mr),
            "eval/map50": float(evaluation.box.map50),
            "eval/map50_95": float(evaluation.box.map),
            "model/weights_mb": best.stat().st_size / 1_000_000,
        })
        per_class = wandb.Table(columns=["class", "ap50_95", "objects"])
        for class_id, ap in zip(evaluation.box.ap_class_index, evaluation.box.ap):
            class_id = int(class_id)
            per_class.add_data(CLASSES[class_id], float(ap), int(evaluation.nt_per_class[class_id]))
        run.log({"eval/per_class_ap": per_class})

        confusion = HERE / "eval" / "confusion_matrix.png"
        if confusion.is_file():
            run.log({"eval/confusion_matrix_image": wandb.Image(str(confusion))})
        model_artifact = wandb.Artifact(f"model-{run.id}", type="model")
        for path in (best, config_path, args_file, effective_file, results_file, confusion):
            if path.is_file():
                model_artifact.add_file(str(path))
        run.log_artifact(model_artifact, aliases=["best"])

        data_artifact = wandb.Artifact("data-taco_yolo-v2", type="dataset")
        for path in (data, manifest, data.parent / "classes.txt", data.parent / "export_info.txt"):
            data_artifact.add_file(str(path))
        run.log_artifact(data_artifact)


if __name__ == "__main__":
    main()
