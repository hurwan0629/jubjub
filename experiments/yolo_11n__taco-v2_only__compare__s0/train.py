"""Run the COCO-pretrained TACO-only arm of the YOLO11n comparison."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yolo11n_taco_compare import main


if __name__ == "__main__":
    main(Path(__file__).resolve().parent, "taco")
