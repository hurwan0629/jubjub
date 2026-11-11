"""Log fixed-sample ground-truth and prediction comparisons to W&B."""

import argparse
import hashlib
from pathlib import Path
from random import Random

import wandb
import yaml
from PIL import Image, ImageDraw
from ultralytics import YOLO


ROOT = Path(__file__).resolve().parents[1]
GROUP = "yolo11n__taco-v2__pretraining_compare"
DATASETS = {
    "aihub": ROOT / "data/aihub_living_yolo/data.yaml",
    "taco": ROOT / "data/taco_yolo/data.yaml",
}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def ground_truth_image(image_path: Path, label_path: Path, names: dict | list) -> Image.Image:
    image = Image.open(image_path).convert("RGB")
    if not label_path.is_file():
        return image
    draw = ImageDraw.Draw(image)
    for line_number, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), 1):
        values = line.split()
        if len(values) != 5:
            raise ValueError(f"Invalid YOLO label: {label_path}:{line_number}")
        class_id = int(values[0])
        x, y, width, height = map(float, values[1:])
        left = (x - width / 2) * image.width
        top = (y - height / 2) * image.height
        right = (x + width / 2) * image.width
        bottom = (y + height / 2) * image.height
        draw.rectangle((left, top, right, bottom), outline="lime", width=3)
        label = names.get(class_id, names.get(str(class_id), str(class_id))) if isinstance(names, dict) else names[class_id]
        draw.text((left, max(0, top - 12)), str(label), fill="lime", stroke_width=2, stroke_fill="black")
    return image


def main(experiment_dir: Path, model_choices: tuple[str, ...]) -> None:
    parser = argparse.ArgumentParser(description="Compare GT and YOLO predictions in a four-column W&B Table.")
    if len(model_choices) > 1:
        parser.add_argument("--model", choices=model_choices, default="taco", help="Checkpoint stage")
    parser.add_argument("--dataset", choices=DATASETS, default="taco")
    parser.add_argument("--split", choices=("train", "val", "test"), help="Default: TACO test or AIHub val")
    parser.add_argument("--seed", type=int, default=0, help="Fixed image sampling seed")
    parser.add_argument("--count", type=int, default=8, help="Positive even number of images")
    parser.add_argument("--conf", type=float, default=0.25, help="Prediction confidence threshold")
    args = parser.parse_args()
    model_stage = args.model if len(model_choices) > 1 else model_choices[0]
    if args.count <= 0 or args.count % 2:
        parser.error("--count must be a positive even number")
    if not 0 <= args.conf <= 1:
        parser.error("--conf must be between 0 and 1")

    config = yaml.safe_load((experiment_dir / "config.yaml").read_text(encoding="utf-8"))
    weights = experiment_dir / ("aihub_run" if model_stage == "aihub" else "run") / "weights/best.pt"
    data_yaml = DATASETS[args.dataset]
    if not weights.is_file():
        parser.error(f"Checkpoint not found: {weights}")
    if not data_yaml.is_file():
        parser.error(f"Dataset YAML not found: {data_yaml}")
    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    split = args.split or ("test" if args.dataset == "taco" else "val")
    if split not in data:
        parser.error(f"{args.dataset} dataset has no {split} split")
    data_root = Path(data["path"])
    if not data_root.is_absolute():
        data_root = (data_yaml.parent / data_root).resolve()
    image_relative = Path(data[split])
    if image_relative.parts[0] != "images":
        parser.error(f"Expected images/<split> in {data_yaml}: {data[split]}")
    image_root = data_root / image_relative
    label_root = data_root / "labels" / Path(*image_relative.parts[1:])
    images = sorted(path for path in image_root.rglob("*") if path.suffix.lower() in IMAGE_SUFFIXES)
    if len(images) < args.count:
        parser.error(f"Requested {args.count} images, found {len(images)} in {image_root}")
    selected = Random(args.seed).sample(images, args.count)

    model = YOLO(str(weights))
    table = wandb.Table(columns=["GT 1", "Pred 1", "GT 2", "Pred 2"])
    for index in range(0, len(selected), 2):
        cells = []
        for image_path in selected[index:index + 2]:
            label_path = label_root / image_path.relative_to(image_root).with_suffix(".txt")
            gt = ground_truth_image(image_path, label_path, data["names"])
            result = model.predict(
                source=str(image_path), conf=args.conf, imgsz=config["imgsz"],
                device=config["device"], verbose=False,
            )[0]
            pred = Image.fromarray(result.plot()[..., ::-1])
            caption = str(image_path.relative_to(image_root))
            cells.extend((wandb.Image(gt, caption=caption), wandb.Image(pred, caption=caption)))
        table.add_data(*cells)

    with wandb.init(
        project="jupjup", group=GROUP, job_type="evaluation",
        name=f"{experiment_dir.name}__{model_stage}__{args.dataset}_{split}__visual",
        config={
            "model/stage": model_stage,
            "model/weights": str(weights),
            "model/weights_sha256": hashlib.sha256(weights.read_bytes()).hexdigest(),
            "data/id": args.dataset,
            "data/split": split,
            "eval/seed": args.seed,
            "eval/conf": args.conf,
            "eval/imgsz": config["imgsz"],
            "eval/image_ids": [str(path.relative_to(image_root)) for path in selected],
        },
    ) as run:
        run.log({"qualitative/gt_pred": table})
        print(f"W&B comparison: {run.url}")
