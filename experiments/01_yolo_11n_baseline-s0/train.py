"""초기 노트북의 YOLO11n 학습 설정으로 기준 실험을 다시 실행한다.

사용법 (이 폴더에서):
    python train.py --dataset 원본_60클래스/data.yaml

기존 train/은 유지하고 새 결과를 rerun/에 저장한다.
"""

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
    # 기존 노트북 결과인 train/을 보호하기 위해 별도 출력 폴더만 허용한다.
    output = args.output_dir.resolve()
    if output.exists():
        parser.error(f"Output already exists: {output}")
    # 당시 Ultralytics가 남긴 args.yaml에서 실제 학습 설정을 다시 읽는다.
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
