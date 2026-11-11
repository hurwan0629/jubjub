"""Train and evaluate either arm of the YOLO11n TACO pretraining comparison."""

import argparse
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
GROUP = "yolo11n__taco-v2__pretraining_compare"
METRIC_NAMES = {
    "metrics/precision(B)": "val/precision",
    "metrics/recall(B)": "val/recall",
    "metrics/mAP50(B)": "val/map50",
    "metrics/mAP50-95(B)": "val/map50_95",
    "lr/pg0": "train/lr_pg0",
    "lr/pg1": "train/lr_pg1",
    "lr/pg2": "train/lr_pg2",
}


def main(experiment_dir: Path, stage: str) -> None:
    # 1. 설정을 읽고 학습 단계에 맞는 가중치, 데이터, 출력 경로를 정한다.
    config_path = experiment_dir / "config.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    original_weights = (experiment_dir / config.pop("weights")).resolve()
    taco_data = (experiment_dir / config.pop("data")).resolve()
    aihub_data_path = config.pop("aihub_data", None)
    if stage not in {"aihub", "taco"} or (stage == "aihub" and not aihub_data_path):
        raise ValueError(f"Invalid stage for this experiment: {stage}")
    aihub_data = (experiment_dir / aihub_data_path).resolve() if aihub_data_path else None
    weights = experiment_dir / "aihub_run" / "weights" / "best.pt" if stage == "taco" and aihub_data else original_weights
    data = aihub_data if stage == "aihub" else taco_data
    run_name = "aihub_run" if stage == "aihub" else "run"
    run_dir = experiment_dir / run_name
    eval_name = "aihub_eval" if stage == "aihub" else "eval"
    eval_dir = experiment_dir / eval_name
    parent_id = experiment_dir / "aihub_wandb_run_id.txt"

    # 2. 필요한 파일과 데이터셋 구성이 비교 실험의 기준에 맞는지 확인한다.
    if stage == "taco" and aihub_data and not parent_id.is_file():
        raise FileNotFoundError("Finish the AIHub stage before starting TACO training")
    if not original_weights.is_file() or not weights.is_file() or not data.is_file():
        raise FileNotFoundError(f"Check weights and data paths: {original_weights}, {weights}, {data}")
    if run_dir.exists() or eval_dir.exists():
        raise FileExistsError(f"Existing output: {run_dir if run_dir.exists() else eval_dir}")

    dataset = yaml.safe_load(data.read_text(encoding="utf-8"))
    if [dataset["names"][i] for i in range(4)] != CLASSES or len(dataset["names"]) != 4:
        raise ValueError(f"Expected four classes in this order: {CLASSES}")
    data_root = Path(dataset["path"]).resolve()
    splits = (("train", 1200), ("val", 150), ("test", 150)) if stage == "taco" else (("train", None), ("val", None))
    if data_root != data.parent or any(dataset.get(split) != f"images/{split}" for split, _ in splits):
        raise ValueError(f"Unexpected {stage} data.yaml paths")

    # 3. 이미지와 라벨의 짝을 검증하고 데이터 목록을 manifest로 남긴다.
    manifest = experiment_dir / f"{stage}_data_manifest.tsv"
    with manifest.open("w", encoding="utf-8", newline="") as file:
        for split, expected_count in splits:
            stems = {}
            for kind in ("images", "labels"):
                directory = data_root / kind / split
                if not directory.is_dir():
                    raise FileNotFoundError(directory)
                paths = sorted(path for path in directory.iterdir() if path.is_file() and path.suffix.lower() in ({".jpg", ".jpeg", ".png"} if kind == "images" else {".txt"}))
                stems[kind] = {path.stem for path in paths}
                for path in paths:
                    fingerprint = hashlib.sha256(path.read_bytes()).hexdigest() if stage == "taco" else path.stat().st_size
                    print(split, kind, path.name, fingerprint, sep="\t", file=file)
            if not stems["images"] or (expected_count and len(stems["images"]) != expected_count) or stems["images"] != stems["labels"]:
                raise ValueError(f"Image/label mismatch in {stage} {split}")

    # 4. 학습 인자와 재현에 필요한 정보를 W&B 설정으로 묶는다.
    train_args = {**config, "data": str(data), "project": str(experiment_dir), "name": run_name, "exist_ok": False}
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unknown"

    # W&B 저장용
    run_config = {
        "comparison/arm": "aihub_then_taco" if aihub_data else "taco_only",
        "comparison/stage": stage,
        "model/id": "yolo11n",
        "model/architecture": "YOLO11n",
        "model/init_weights": {
            "source": "this experiment AIHub best.pt" if weights != original_weights else "Ultralytics COCO yolo11n.pt",
            "version": "aihub_run" if weights != original_weights else "official-coco",
            "sha256": hashlib.sha256(weights.read_bytes()).hexdigest(),
        },
        "model/parent_run_id": parent_id.read_text(encoding="utf-8").strip() if weights != original_weights else None,
        "data/id": "aihub_living" if stage == "aihub" else "taco_yolo",
        "data/version": "v1" if stage == "aihub" else "v2",
        "data/split_id": "aihub-living-train-val-v1" if stage == "aihub" else "taco-v2-train1200-val150-test150",
        "data/classes": CLASSES,
        "data/manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest(),
        "train/args": train_args,
        "train/seed": config["seed"],
        "code/commit": commit,
        "env/versions": {"python": platform.python_version(), "ultralytics": ultralytics.__version__, "torch": torch.__version__, "cuda": torch.version.cuda},
        "eval/protocol_id": "taco-v2-test-150-img640-conf001-iou07" if stage == "taco" else "aihub-living-val-v1",
        "eval/args": {"split": "test" if stage == "taco" else "val", "imgsz": config["imgsz"], "conf": 0.001, "nms_iou": 0.7, "match_iou": "0.50:0.95", "max_det": 300},
    }

    with wandb.init(
          project="jubjub",
          name=f"{experiment_dir.name}__{stage}",
          group=(GROUP if stage == "taco" else f"{GROUP}__pretrain"),
          config=run_config,
          job_type="train"
        ) as run:
        # 5. 학습을 실행하며 에포크별 결과를 W&B에 기록한다.
        model = YOLO(str(weights))
        results_file = run_dir / "results.csv"
        logged_epochs = 0

        # 저장 코드
        def log_epochs(_trainer) -> None:
            nonlocal logged_epochs
            if results_file.is_file():
                with results_file.open(newline="", encoding="utf-8") as file:
                    for row in list(csv.DictReader(file))[logged_epochs:]:
                        values = {
                            key.strip(): float(value)
                            for key, value
                            in row.items()
                            if key not in {"epoch", "time"} and value
                        }
                        values.update({
                            alias: values[source]
                            for source, alias
                            in METRIC_NAMES.items()
                            if source in values
                        })
                        run.log({"epoch": int(row["epoch"]), **values})
                        logged_epochs += 1

        model.add_callback("on_fit_epoch_end", log_epochs)
        try:
            model.train(**train_args)
        finally:
            log_epochs(None)

        # 6. 자동 선택된 optimizer 등 실제 적용된 학습 설정을 저장한다.
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

        # 7. 최적 가중치를 AIHub val 또는 TACO test에서 평가하고 지표를 기록한다.
        evaluation = YOLO(str(best)).val(
            data=str(data), split="val" if stage == "aihub" else "test",
            imgsz=config["imgsz"], device=config["device"], conf=0.001, iou=0.7,
            max_det=300, project=str(experiment_dir), name=eval_name,
            exist_ok=False, plots=True,
        )
        scores = {
            "split": "val" if stage == "aihub" else "test",
            "precision": float(evaluation.box.mp), "recall": float(evaluation.box.mr),
            "map50": float(evaluation.box.map50), "map50_95": float(evaluation.box.map),
        }
        metrics_file = eval_dir / "metrics.yaml"
        metrics_file.write_text(yaml.safe_dump(scores, sort_keys=False), encoding="utf-8")
        run.summary.update({f"eval/{key}": value for key, value in scores.items() if key != "split"})
        per_class = wandb.Table(columns=["class", "ap50_95", "objects"])
        for class_id, ap in zip(evaluation.box.ap_class_index, evaluation.box.ap):
            class_id = int(class_id)
            per_class.add_data(CLASSES[class_id], float(ap), int(evaluation.nt_per_class[class_id]))
        run.log({"eval/per_class_ap": per_class})
        confusion = eval_dir / "confusion_matrix.png"
        if confusion.is_file():
            run.log({"eval/confusion_matrix_image": wandb.Image(str(confusion))})

        # 8. 모델과 데이터 출처를 W&B 아티팩트로 보관한다.
        run.summary["model/weights_mb"] = best.stat().st_size / 1_000_000
        model_artifact = wandb.Artifact(f"model-{run.id}", type="model")
        for path in (best, config_path, args_file, effective_file, results_file, metrics_file, confusion):
            if path.is_file():
                model_artifact.add_file(str(path))
        run.log_artifact(model_artifact, aliases=["best"])

        data_artifact = wandb.Artifact(
            f"data-{'aihub_living-v1' if stage == 'aihub' else 'taco_yolo-v2-1200-150-150'}", type="dataset"
        )

        for path in (data, manifest, data.parent / "classes.txt"):
            if path.is_file():
                data_artifact.add_file(str(path))
        run.log_artifact(data_artifact)
        if stage == "aihub":
            parent_id.write_text(run.id, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", choices=("aihub", "taco"), required=True)
    main(HERE, parser.parse_args().stage)
