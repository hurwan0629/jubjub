"""Run one stage of the YOLO11n -> AIHub -> TACO experiment."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from yolo11n_taco_compare import main


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("aihub", "taco"), required=True)
    main(Path(__file__).resolve().parent, parser.parse_args().stage)
