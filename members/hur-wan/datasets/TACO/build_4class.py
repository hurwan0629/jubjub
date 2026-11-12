"""TACO 원본(data/annotations.json + data/batch_*/)에서 4클래스 데이터셋을 만든다.

실행: python build_4class.py
결과: <repo>/data/taco_yolo  (images, labels: train/val/test + data.yaml, classes.txt)
      <repo>/data/taco_coco/annotations/{train,val,test}.json
클래스 매핑은 remap_to_4class.py 의 CLASS_MAP 을 그대로 쓴다.
"""
import json
import random
import shutil
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

from remap_to_4class import CLASS_MAP, NAMES

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "data"
DATA = HERE.parents[3] / "data"
YOLO = DATA / "taco_yolo"
COCO = DATA / "taco_coco" / "annotations"

SPLIT = {"train": 0.8, "val": 0.1, "test": 0.1}
SEED = 0


def save_image(src, dst):
    """EXIF 회전이 있으면 픽셀에 적용해서 저장, 없으면 그대로 복사. (width, height) 반환."""
    with Image.open(src) as image:
        orientation = image.getexif().get(0x0112, 1)     # 0x0112 = EXIF 회전 태그, 1 = 회전 없음
        if orientation == 1:
            shutil.copy2(src, dst)
            return image.size
        upright = ImageOps.exif_transpose(image).convert("RGB")
        upright.save(dst, quality=95)
        return upright.size


def main():
    if YOLO.exists() or COCO.parent.exists():
        raise SystemExit("data/taco_yolo 또는 data/taco_coco 가 이미 있습니다. 옮기거나 지우고 실행하세요.")

    coco_src = json.loads((SOURCE / "annotations.json").read_text(encoding="utf-8"))
    boxes_by_image = {}
    for ann in coco_src["annotations"]:
        boxes_by_image.setdefault(ann["image_id"], []).append(ann)

    images = sorted(coco_src["images"], key=lambda im: im["id"])
    random.Random(SEED).shuffle(images)
    n_train = int(len(images) * SPLIT["train"])
    n_val = int(len(images) * SPLIT["val"])
    splits = {
        "train": images[:n_train],
        "val": images[n_train:n_train + n_val],
        "test": images[n_train + n_val:],
    }

    COCO.mkdir(parents=True)
    excluded = Counter()
    for split, split_images in splits.items():
        (YOLO / "images" / split).mkdir(parents=True)
        (YOLO / "labels" / split).mkdir(parents=True)
        coco_images, coco_anns, kept = [], [], Counter()

        for image_id, info in enumerate(split_images, 1):
            # batch_1/000000.jpg -> batch_1_000000.jpg
            name = info["file_name"].replace("/", "_")
            name = Path(name).stem + ".jpg"
            width, height = save_image(SOURCE / info["file_name"], YOLO / "images" / split / name)
            if (width, height) != (info["width"], info["height"]):
                raise ValueError(f"size mismatch: {info['file_name']}")
            coco_images.append({"id": image_id, "file_name": name, "width": width, "height": height})

            lines = []
            for ann in boxes_by_image.get(info["id"], []):
                cls = CLASS_MAP[ann["category_id"]]
                if cls is None:
                    excluded[ann["category_id"]] += 1
                    continue
                x, y, w, h = ann["bbox"]                     # COCO 픽셀 좌표 (왼쪽 위 x, y, 너비, 높이)
                x, y = max(0.0, x), max(0.0, y)
                w, h = min(w, width - x), min(h, height - y)  # 이미지 밖으로 나간 부분 자르기
                if w <= 0 or h <= 0:
                    continue
                lines.append(f"{cls} {(x + w / 2) / width:.6f} {(y + h / 2) / height:.6f} "
                             f"{w / width:.6f} {h / height:.6f}")
                coco_anns.append({"id": len(coco_anns) + 1, "image_id": image_id, "category_id": cls,
                                  "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0})
                kept[NAMES[cls]] += 1
            (YOLO / "labels" / split / f"{Path(name).stem}.txt").write_text(
                "\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

        coco = {
            "info": {"description": "TACO 60 classes remapped to four detection classes",
                     "version": "v3", "split": split},
            "licenses": [],
            "images": coco_images,
            "annotations": coco_anns,
            "categories": [{"id": i, "name": n, "supercategory": "waste"} for i, n in enumerate(NAMES)],
        }
        (COCO / f"{split}.json").write_text(json.dumps(coco, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{split}: {len(coco_images)} images, {len(coco_anns)} boxes {dict(kept)}")

    (YOLO / "data.yaml").write_text(
        f'path: "{YOLO.as_posix()}"\ntrain: images/train\nval: images/val\ntest: images/test\n'
        f"nc: {len(NAMES)}\nnames:\n" + "".join(f'  {i}: "{n}"\n' for i, n in enumerate(NAMES)),
        encoding="utf-8",
    )
    (YOLO / "classes.txt").write_text("\n".join(NAMES) + "\n", encoding="utf-8")
    names = {c["id"]: c["name"] for c in coco_src["categories"]}
    print("excluded:", {names[k]: v for k, v in sorted(excluded.items())})


if __name__ == "__main__":
    main()
