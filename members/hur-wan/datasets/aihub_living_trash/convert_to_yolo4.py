"""Build data/aihub_living_yolo and data/aihub_living_coco annotations from the AIHub living-waste
(indoor classifier) zips, remapped to four classes."""

import argparse
import io
import json
import os
import zipfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCE = next((HERE / "inside_classifier").glob("*/01-1.*"))
DATA = Path(__file__).resolve().parents[4] / "data"
TARGET = DATA / "aihub_living_yolo"
COCO = DATA / "aihub_living_coco/annotations"
SPLITS = {"Training": ("train", "TL", "TS"), "Validation": ("val", "VL", "VS")}
MAX_SIDE = 640

# Source class_name -> target class ID. None removes the annotation.
CLASS_MAP: dict[str, int | None] = {
    "c_1": 0,           # 종이
    "c_1_01": 0,        # 종이 + 이물질
    "c_2_01": 0,        # 종이팩
    "c_2_02": 0,        # 종이컵
    "c_2_02_01": 0,     # 종이컵 + 이물질
    "c_7": 0,           # 비닐
    "c_7_01": 0,        # 비닐 + 이물질
    "c_5_01": 1,        # 페트 + 다중포장재
    "c_5_01_01": 1,     # 페트 + 이물질 + 다중포장재
    "c_5_02": 1,        # 페트
    "c_5_02_01": 1,     # 페트 + 이물질
    "c_6": 1,           # 플라스틱
    "c_6_01": 1,        # 플라스틱 + 이물질
    "c_3": 2,           # 캔류
    "c_3_01": 2,        # 캔 + 이물질
    "c_4_01_01": 3,     # 재사용 유리 + 다중포장재
    "c_4_01_02": 3,     # 재사용 유리 (소주병 + 맥주병)
    "c_4_02_01_01": 3,  # 갈색 유리 + 다중포장재
    "c_4_02_01_02": 3,  # 갈색 유리
    "c_4_02_02_01": 3,  # 녹색 유리 + 다중포장재
    "c_4_02_02_02": 3,  # 녹색 유리
    "c_4_02_03_01": 3,  # 백색 유리 + 다중포장재
    "c_4_02_03_02": 3,  # 백색 유리
    "c_4_03": 3,        # 기타 유리
    "c_4_03_01": 3,     # 기타 유리 + 이물질
    "c_8_01": None,     # 흰색 스티로폼
    "c_8_02": None,     # 컬러 스티로폼
    "c_8_01_01": None,  # 스티로폼 + 이물질
    "c_9": None,        # 건전지
}
NAMES = ("general", "plastic", "can", "glass")


def convert_pair(split: str, label_zip: Path, image_zip: Path, overwrite: bool) -> dict:
    images_dir = TARGET / "images" / split
    labels_dir = TARGET / "labels" / split
    kept: Counter[int] = Counter()
    excluded: Counter[str] = Counter()
    records: list[tuple[str, int, int, list[tuple[int, float, float, float, float]]]] = []
    clipped = dropped = written = 0
    with zipfile.ZipFile(label_zip) as lz, zipfile.ZipFile(image_zip) as iz:
        image_entries = {name.rsplit("/", 1)[-1]: name for name in iz.namelist() if not name.endswith("/")}
        for entry in lz.namelist():
            if not entry.endswith(".json"):
                continue
            where = f"{label_zip.name}:{entry}"
            record = json.loads(lz.read(entry).decode("utf-8-sig"))
            image_name = record["Image"]
            if image_name not in image_entries:
                raise ValueError(f"missing image {image_name} for {where}")
            stem = Path(image_name).stem
            width, height = map(int, record["Info"]["RESOLUTION"].split("/"))

            boxes: list[tuple[int, float, float, float, float]] = []
            for obj in record["objects"]:
                if obj["annotation_type"] != "box":
                    raise ValueError(f"non-box annotation at {where}")
                if obj["class_name"] not in CLASS_MAP:
                    raise ValueError(f"unknown class {obj['class_name']} at {where}")
                target_id = CLASS_MAP[obj["class_name"]]
                if target_id is None:
                    excluded[obj["class_name"]] += 1
                    continue
                coord = obj["annotation"]["coord"]
                x0, y0 = coord["x"], coord["y"]
                x1, y1 = x0 + coord["width"], y0 + coord["height"]
                cx0, cy0, cx1, cy1 = max(0.0, x0), max(0.0, y0), min(width, x1), min(height, y1)
                if (cx0, cy0, cx1, cy1) != (x0, y0, x1, y1):
                    clipped += 1
                if cx1 - cx0 < 1 or cy1 - cy0 < 1:
                    dropped += 1
                    continue
                kept[target_id] += 1
                boxes.append((
                    target_id,
                    (cx0 + cx1) / 2 / width, (cy0 + cy1) / 2 / height,
                    (cx1 - cx0) / width, (cy1 - cy0) / height,
                ))

            image_path = images_dir / f"{stem}.jpg"
            label_path = labels_dir / f"{stem}.txt"
            if label_path.exists() and not overwrite:
                with Image.open(image_path) as saved:
                    records.append((stem, *saved.size, boxes))
                continue
            with Image.open(io.BytesIO(iz.read(image_entries[image_name]))) as image:
                if image.size != (width, height):
                    raise ValueError(f"image size {image.size} != RESOLUTION {width}x{height} at {where}")
                image = image.convert("RGB")
                image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
                image.save(image_path, quality=90)
                records.append((stem, *image.size, boxes))
            label_path.write_text(
                "".join(f"{c} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n" for c, x, y, w, h in boxes), encoding="utf-8"
            )
            written += 1
    return {
        "split": split, "zip": label_zip.name, "records": records, "kept": kept, "excluded": excluded,
        "clipped": clipped, "dropped": dropped, "written": written,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="process only these sets, e.g. B2 B9")
    parser.add_argument("--overwrite", action="store_true", help="rewrite images/labels that already exist")
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 1))
    args = parser.parse_args()

    if set(CLASS_MAP.values()) != {0, 1, 2, 3, None}:
        raise ValueError("CLASS_MAP must map to the four target classes or None")

    jobs: list[tuple[str, Path, Path]] = []
    for folder, (split, label_prefix, image_prefix) in SPLITS.items():
        for label_zip in sorted((SOURCE / folder).glob(f"02.*/{label_prefix}_*.zip")):
            set_name = label_zip.stem.rsplit("_", 1)[-1]
            if args.only and set_name not in args.only:
                continue
            image_dir = next((SOURCE / folder).glob("01.*"))
            image_zip = image_dir / label_zip.name.replace(f"{label_prefix}_", f"{image_prefix}_", 1)
            if not image_zip.exists():
                raise FileNotFoundError(f"no source image zip for {label_zip.name}")
            jobs.append((split, label_zip, image_zip))
    if not jobs:
        raise ValueError("no zips matched")

    for split, _, _ in SPLITS.values():
        (TARGET / "images" / split).mkdir(parents=True, exist_ok=True)
        (TARGET / "labels" / split).mkdir(parents=True, exist_ok=True)

    COCO.mkdir(parents=True, exist_ok=True)

    kept: dict[str, Counter[int]] = {"train": Counter(), "val": Counter()}
    records: dict[str, list] = {"train": [], "val": []}
    excluded: Counter[str] = Counter()
    seen: dict[str, str] = {}
    clipped = dropped = written = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(convert_pair, *job, args.overwrite) for job in jobs]
        for future in futures:
            result = future.result()
            for stem, *_ in result["records"]:
                if stem in seen:
                    raise ValueError(f"duplicate image name {stem} in {seen[stem]} and {result['zip']}")
                seen[stem] = result["zip"]
            records[result["split"]].extend(result["records"])
            kept[result["split"]].update(result["kept"])
            excluded.update(result["excluded"])
            clipped += result["clipped"]
            dropped += result["dropped"]
            written += result["written"]
            print(f"{result['zip']}: {len(result['records'])} images, {result['written']} written", flush=True)

    (TARGET / "data.yaml").write_text(
        f"path: {TARGET.as_posix()}\ntrain: images/train\nval: images/val\nnames:\n"
        + "".join(f"  {class_id}: {name}\n" for class_id, name in enumerate(NAMES)),
        encoding="utf-8",
    )
    for split in ("train", "val"):
        images: list[dict] = []
        annotations: list[dict] = []
        for image_id, (stem, width, height, boxes) in enumerate(sorted(records[split]), start=1):
            images.append({"id": image_id, "file_name": f"{stem}.jpg", "width": width, "height": height})
            for class_id, cx, cy, w, h in boxes:
                box_w, box_h = w * width, h * height
                annotations.append({
                    "id": len(annotations) + 1,
                    "image_id": image_id,
                    "category_id": class_id,
                    "bbox": [(cx - w / 2) * width, (cy - h / 2) * height, box_w, box_h],
                    "area": box_w * box_h,
                    "iscrowd": 0,
                })
        coco = {
            "info": {"description": "AIHub living waste (indoor classifier) remapped to four detection classes",
                     "version": "v1", "split": split},
            "licenses": [],
            "images": images,
            "annotations": annotations,
            "categories": [
                {"id": class_id, "name": name, "supercategory": "waste"} for class_id, name in enumerate(NAMES)
            ],
        }
        (COCO / f"{split}.json").write_text(json.dumps(coco, ensure_ascii=False), encoding="utf-8")
        (TARGET / "labels" / f"{split}.cache").unlink(missing_ok=True)
        counts = {NAMES[class_id]: count for class_id, count in sorted(kept[split].items())}
        print(f"{split}: {len(images)} images, {len(annotations)} boxes {counts}")
    print(f"Written this run: {written}, clipped boxes: {clipped}, dropped degenerate boxes: {dropped}")
    print(f"Excluded source counts: {dict(sorted(excluded.items()))}")


if __name__ == "__main__":
    main()
