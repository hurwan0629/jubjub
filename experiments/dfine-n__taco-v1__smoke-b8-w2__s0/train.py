"""D-FINE smoke 실험을 원래 설정(5 epochs, batch 8)으로 다시 실행한다.

사용법 (이 폴더에서):
    python train.py

기존 가중치는 유지하고 새 결과를 run/에 저장한다.
"""

import argparse
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
DFINE_ROOT = HERE.parents[1] / "members/hur-wan/models/D-FINE"
CONFIG = DFINE_ROOT / "configs/dfine/custom/dfine_hgnetv2_n_custom.yml"
COCO_WEIGHTS = "https://github.com/Peterande/storage/releases/download/dfinev1.0/dfine_n_coco.pth"
# 폴더명과 달리 원래 실행 기록의 데이터 로더 worker 수는 4다.
EPOCHS, BATCH, WORKERS = 5, 8, 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--output-dir", type=Path, default=HERE / "run")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--tuning", default=COCO_WEIGHTS)
    args = parser.parse_args()
    config = args.config.resolve()
    output = args.output_dir.resolve()
    if not config.is_file():
        parser.error(f"Config not found: {config}")
    # 폴더 루트에 있는 기존 체크포인트와 새 학습 결과를 덮어쓰지 않는다.
    if output.exists():
        parser.error(f"Output already exists: {output}")
    # D-FINE의 학습 진입점을 호출하고 -u로 이 실험의 설정만 덮어쓴다.
    command = [
        sys.executable, str(DFINE_ROOT / "train.py"), "-c", str(config),
        "--use-amp", "--seed", str(args.seed), "-t", args.tuning,
        "--output-dir", str(output), "-u", f"exp_name={HERE.name}",
        f"epochs={EPOCHS}", f"train_dataloader.total_batch_size={BATCH}",
        f"val_dataloader.total_batch_size={BATCH}",
        f"train_dataloader.num_workers={WORKERS}",
        f"val_dataloader.num_workers={WORKERS}",
    ]
    subprocess.run(command, cwd=DFINE_ROOT, check=True)


if __name__ == "__main__":
    main()
