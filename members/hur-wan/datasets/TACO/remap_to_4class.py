"""Rebuild data/taco_yolo labels and data/taco_coco annotations from TACO's 60-class labels."""

import json
import math
import tempfile
from collections import Counter
from pathlib import Path

from PIL import Image


SOURCE = Path(__file__).resolve().parent / "data/taco_yolo"
DATA = Path(__file__).resolve().parents[4] / "data"
TARGET = DATA / "taco_yolo"
COCO = DATA / "taco_coco/annotations"

# Source class ID -> target class ID. None removes the annotation.
CLASS_MAP: dict[int, int | None] = {
    0: 0,   # Aluminium foil
    1: None,  # Battery
    2: 0,   # Aluminium blister pack
    3: 0,   # Carded blister pack
    4: 1,   # Other plastic bottle
    5: 1,   # Clear plastic bottle
    6: 3,   # Glass bottle
    7: 1,   # Plastic bottle cap
    8: 0,   # Metal bottle cap
    9: None,  # Broken glass
    10: 2,  # Food Can
    11: None,  # Aerosol
    12: 2,  # Drink can
    13: 0,  # Toilet tube
    14: 0,  # Other carton
    15: 0,  # Egg carton
    16: 0,  # Drink carton
    17: 0,  # Corrugated carton
    18: 0,  # Meal carton
    19: 0,  # Pizza box
    20: 0,  # Paper cup
    21: 1,  # Disposable plastic cup
    22: 1,  # Foam cup
    23: 3,  # Glass cup
    24: 1,  # Other plastic cup
    25: None,  # Food waste
    26: 3,  # Glass jar
    27: 1,  # Plastic lid
    28: 0,  # Metal lid
    29: 1,  # Other plastic
    30: 0,  # Magazine paper
    31: 0,  # Tissues
    32: 0,  # Wrapping paper
    33: 0,  # Normal paper
    34: 0,  # Paper bag
    35: 0,  # Plastified paper bag
    36: 1,  # Plastic film
    37: 1,  # Six pack rings
    38: 1,  # Garbage bag
    39: 1,  # Other plastic wrapper
    40: 1,  # Single-use carrier bag
    41: 1,  # Polypropylene bag
    42: 0,  # Crisp packet
    43: 1,  # Spread tub
    44: 1,  # Tupperware
    45: 1,  # Disposable food container
    46: 1,  # Foam food container
    47: 1,  # Other plastic container
    48: 0,  # Plastic glooves
    49: 1,  # Plastic utensils
    50: 0,  # Pop tab
    51: 0,  # Rope & strings
    52: None,  # Scrap metal
    53: None,  # Shoe
    54: 0,  # Squeezable tube
    55: 1,  # Plastic straw
    56: 0,  # Paper straw
    57: 1,  # Styrofoam piece
    58: None,  # Unlabeled litter
    59: 0,  # Cigarette
}
NAMES = ("general", "plastic", "can", "glass")


def main() -> None:
    if set(CLASS_MAP) != set(range(60)) or set(CLASS_MAP.values()) != {0, 1, 2, 3, None}:
        raise ValueError("CLASS_MAP must define every original class and only four target classes")
    source_names = [
        line.split(":", 1)[0].strip()
        for line in (SOURCE / "data.yaml").read_text(encoding="utf-8").splitlines()
        if line.startswith("  ") and line.strip().split(":", 1)[0].isdigit()
    ]
    if [int(name) for name in source_names] != list(range(60)):
        raise ValueError("source data.yaml does not list class IDs 0..59 in order")

    kept: Counter[int] = Counter()
    excluded: Counter[int] = Counter()
    with tempfile.TemporaryDirectory(dir=DATA, prefix="taco-remap-") as temp:
        stage = Path(temp)
        for split in ("train", "val"):
            source_images = SOURCE / "images" / split
            target_images = TARGET / "images" / split
            source_labels = SOURCE / "labels" / split
            target_labels = TARGET / "labels" / split
            image_names = {path.name for path in source_images.iterdir() if path.is_file()}
            target_names = {path.name for path in target_images.iterdir() if path.is_file()}
            if image_names != target_names:
                raise ValueError(f"{split} image filenames differ between source and target")
            label_names = {path.name for path in source_labels.glob("*.txt")}
            if label_names != {Path(name).stem + ".txt" for name in image_names}:
                raise ValueError(f"{split} source labels do not match images")
            if label_names != {path.name for path in target_labels.glob("*.txt")}:
                raise ValueError(f"{split} target labels do not match source labels")

            (stage / split).mkdir()
            images: list[dict[str, int | str]] = []
            annotations: list[dict[str, int | float | list[float]]] = []
            for image_id, name in enumerate(sorted(image_names), start=1):
                source_image = source_images / name
                target_image = target_images / name
                if source_image.stat().st_size != target_image.stat().st_size:
                    raise ValueError(f"image sizes differ: {name}")
                with Image.open(target_image) as image:
                    width, height = image.size
                images.append({"id": image_id, "file_name": name, "width": width, "height": height})

                remapped: list[str] = []
                label_name = Path(name).stem + ".txt"
                for line_number, line in enumerate(
                    (source_labels / label_name).read_text(encoding="utf-8").splitlines(), start=1
                ):
                    fields = line.split()
                    if len(fields) != 5:
                        raise ValueError(f"invalid label at {split}/{label_name}:{line_number}")
                    original_id = int(fields[0])
                    if original_id not in CLASS_MAP:
                        raise ValueError(f"unknown class {original_id} at {split}/{label_name}:{line_number}")
                    cx, cy, w, h = map(float, fields[1:])
                    if not all(map(math.isfinite, (cx, cy, w, h))) or not (
                        0 <= cx <= 1 and 0 <= cy <= 1 and 0 < w <= 1 and 0 < h <= 1
                    ):
                        raise ValueError(f"invalid box at {split}/{label_name}:{line_number}")
                    target_id = CLASS_MAP[original_id]
                    if target_id is None:
                        excluded[original_id] += 1
                        continue
                    kept[target_id] += 1
                    remapped.append(f"{target_id} {' '.join(fields[1:])}")
                    x, y, box_w, box_h = (cx - w / 2) * width, (cy - h / 2) * height, w * width, h * height
                    annotations.append(
                        {
                            "id": len(annotations) + 1,
                            "image_id": image_id,
                            "category_id": target_id,
                            "bbox": [x, y, box_w, box_h],
                            "area": box_w * box_h,
                            "iscrowd": 0,
                        }
                    )
                (stage / split / label_name).write_text(
                    "\n".join(remapped) + ("\n" if remapped else ""), encoding="utf-8"
                )

            coco = {
                "info": {"description": "TACO 60 classes remapped to four detection classes", "version": "v2", "split": split},
                "licenses": [],
                "images": images,
                "annotations": annotations,
                "categories": [
                    {"id": class_id, "name": name, "supercategory": "waste"}
                    for class_id, name in enumerate(NAMES)
                ],
            }
            (stage / f"{split}.json").write_text(
                json.dumps(coco, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(f"{split}: {len(images)} images, {len(annotations)} kept boxes")

        for split in ("train", "val"):
            for staged_label in (stage / split).glob("*.txt"):
                staged_label.replace(TARGET / "labels" / split / staged_label.name)
            (stage / f"{split}.json").replace(COCO / f"{split}.json")
            (TARGET / "labels" / f"{split}.cache").unlink(missing_ok=True)

    print(f"Target counts: {dict(sorted(kept.items()))}")
    print(f"Excluded source counts: {dict(sorted(excluded.items()))}")


if __name__ == "__main__":
    main()
