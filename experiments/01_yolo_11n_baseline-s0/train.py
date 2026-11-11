"""Rerun the notebook's YOLO11n baseline with an explicit dataset path."""

import argparse
from pathlib import Path

import yaml
from ultralytics import YOLO


HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="Original 60-class TACO data.yaml, if reproducing the baseline")
    parser.add_argument("--weights", type=Path, default=HERE / "yolo11n.pt")
    parser.add_argument("--output-dir", type=Path, default=HERE / "rerun")
    parser.add_argument("--device", default="0")
    args = parser.parse_args()
    if not args.dataset.is_file() or not args.weights.is_file():
        parser.error(f"Check dataset and weights: {args.dataset}, {args.weights}")
    output = args.output_dir.resolve()
    if output.exists():
        parser.error(f"Output already exists: {output}")
    saved = yaml.safe_load((HERE / "train/args.yaml").read_text(encoding="utf-8"))
    train_args = {key: saved[key] for key in (
        "epochs", "patience", "batch", "imgsz", "workers", "seed", "deterministic", "optimizer", "amp"
    )}
    YOLO(str(args.weights)).train(
        data=str(args.dataset.resolve()), device=args.device,
        project=str(output.parent), name=output.name, exist_ok=False, **train_args,
    )


if __name__ == "__main__":
    main()
