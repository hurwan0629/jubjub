"""Compare the AIHub or TACO checkpoint against labeled images."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_gt_predictions import main


if __name__ == "__main__":
    main(Path(__file__).resolve().parent, ("aihub", "taco"))
