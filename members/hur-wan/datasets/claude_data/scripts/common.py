"""claude_data 의 변환 스크립트들이 같이 쓰는 함수.

저장 형식은 저장소 루트의 data/ 와 같다.
  <이름>_yolo/images/<split>/*.jpg   이미지
  <이름>_yolo/labels/<split>/*.txt   YOLO 라벨 (클래스 cx cy w h, 0~1 로 정규화)
  <이름>_yolo/data.yaml, classes.txt
  <이름>_coco/annotations/<split>.json   COCO 라벨 (bbox = 픽셀 단위 [x, y, w, h])

변환 스크립트(convert_*.py)는 "어떤 이미지에 어떤 박스가 있는지"만 정리해서 write_dataset() 에 넘긴다.
write_dataset() 이 하는 일: 겹친 박스 정리 -> 이미지 복사 -> 박스를 이미지 안으로 자르기 -> YOLO·COCO 저장
-> reports/ 에 저장 목록(manifest)과 제외 목록(excluded) 기록.
"""
import csv
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent      # claude_data/
RAW = ROOT / "_raw"                                # 내려받은 원본
REPORTS = ROOT / "reports"
NAMES = ("general", "plastic", "can", "glass")     # data/ 와 같은 4클래스, 같은 순서
SPLITS = ("train", "val", "test")
MIN_SIDE = 2.0                                     # 이보다 작은 박스(픽셀)는 버린다
SAME_OBJECT = 0.85                                 # 두 박스의 IoU 가 이 값 이상이면 한 물체를 두 번 그린 것으로 본다


def iou(a, b):
    """두 박스(x, y, w, h)의 겹치는 넓이 / 합친 넓이. 1 이면 완전히 같은 박스."""
    width = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    height = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    shared = width * height
    return shared / (a[2] * a[3] + b[2] * b[3] - shared) if shared > 0 else 0.0


def merge_double_boxes(boxes):
    """한 물체에 두 번 그려진 박스(거의 같은 위치의 박스 두 개)를 하나로 줄인다.

    boxes: [(클래스 번호, x, y, w, h), ...]
    두 박스의 클래스가 서로 다르면 어느 쪽이 맞는지 알 수 없으므로 None 을 돌려준다.
    """
    kept = []
    for cls, *box in boxes:
        twins = [other_cls for other_cls, *other_box in kept if iou(box, other_box) >= SAME_OBJECT]
        if any(other_cls != cls for other_cls in twins):
            return None
        if not twins:
            kept.append((cls, *box))
    return kept


def save_image(src, dst):
    """이미지를 복사하고 (너비, 높이)를 돌려준다. EXIF 회전이 있으면 픽셀에 적용해서 저장한다."""
    with Image.open(src) as image:
        orientation = image.getexif().get(0x0112, 1)   # 0x0112 = EXIF 회전 태그, 1 = 회전 없음
        if orientation == 1:
            shutil.copy2(src, dst)
            return image.size
        upright = ImageOps.exif_transpose(image).convert("RGB")
        upright.save(dst, quality=95)
        return upright.size


def clip_box(x, y, w, h, width, height):
    """박스를 이미지 안으로 자른다. 너무 작아지면 None."""
    x0, y0 = max(0.0, x), max(0.0, y)
    x1, y1 = min(float(width), x + w), min(float(height), y + h)
    if x1 - x0 < MIN_SIDE or y1 - y0 < MIN_SIDE:
        return None
    return x0, y0, x1 - x0, y1 - y0


def write_dataset(prefix, records, excluded, description, version, source):
    """정리된 기록을 <prefix>_yolo, <prefix>_coco 로 저장한다.

    records:  [{"split": "train", "source": 원본 이미지 경로, "name": 저장할 파일 이름,
                "size": (너비, 높이), "boxes": [(클래스 번호, x, y, w, h), ...]}, ...]   박스는 픽셀 단위
    excluded: [(원본 파일, 제외한 이유), ...]
    source:   {"name": 원본 이름, "url": 주소, "license": 라이선스}  -> COCO info 에 그대로 남긴다
    """
    yolo = ROOT / f"{prefix}_yolo"
    coco = ROOT / f"{prefix}_coco" / "annotations"
    if yolo.exists() or coco.parent.exists():
        raise SystemExit(f"{yolo.name} 또는 {coco.parent.name} 이 이미 있습니다. 지우고 다시 실행하세요.")
    REPORTS.mkdir(exist_ok=True)
    coco.mkdir(parents=True)

    # 한 물체에 박스가 두 번 그려진 경우를 먼저 정리한다 (모든 데이터셋에 같은 규칙).
    checked, excluded, merged_boxes = [], list(excluded), 0
    for r in records:
        boxes = merge_double_boxes(r["boxes"])
        if boxes is None:
            excluded.append((Path(r["source"]).name, "한 물체에 서로 다른 클래스의 박스가 두 개"))
            continue
        merged_boxes += len(r["boxes"]) - len(boxes)
        checked.append({**r, "boxes": boxes})
    records = checked

    manifest = []                      # 저장한 이미지 목록 (reports/<prefix>_manifest.csv)
    dropped_boxes = 0
    for split in SPLITS:
        rows = sorted((r for r in records if r["split"] == split), key=lambda r: r["name"])
        if not rows:
            continue
        (yolo / "images" / split).mkdir(parents=True)
        (yolo / "labels" / split).mkdir(parents=True)
        coco_images, coco_anns, kept = [], [], Counter()

        for image_id, r in enumerate(rows, 1):
            width, height = save_image(r["source"], yolo / "images" / split / r["name"])
            if (width, height) != tuple(r["size"]):
                raise ValueError(f"라벨에 적힌 크기와 실제 이미지 크기가 다릅니다: {r['source']}")
            coco_images.append({"id": image_id, "file_name": r["name"], "width": width, "height": height})

            lines = []
            for cls, x, y, w, h in r["boxes"]:
                box = clip_box(x, y, w, h, width, height)
                if box is None:
                    dropped_boxes += 1
                    continue
                x, y, w, h = box
                lines.append(f"{cls} {(x + w / 2) / width:.6f} {(y + h / 2) / height:.6f} "
                             f"{w / width:.6f} {h / height:.6f}")
                coco_anns.append({"id": len(coco_anns) + 1, "image_id": image_id, "category_id": cls,
                                  "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0})
                kept[NAMES[cls]] += 1
            label = yolo / "labels" / split / (Path(r["name"]).stem + ".txt")
            label.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

            digest = hashlib.sha256((yolo / "images" / split / r["name"]).read_bytes()).hexdigest()
            manifest.append([split, r["name"], Path(r["source"]).name, width, height, len(lines), digest])

        data = {
            "info": {"description": description, "version": version, "split": split, **source},
            "licenses": [],
            "images": coco_images,
            "annotations": coco_anns,
            "categories": [{"id": i, "name": n, "supercategory": "waste"} for i, n in enumerate(NAMES)],
        }
        (coco / f"{split}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{prefix} {split}: 이미지 {len(coco_images)}장, 박스 {len(coco_anns)}개 {dict(kept)}")

    (yolo / "data.yaml").write_text(
        f"# {description}\n# 이 폴더를 다른 곳으로 옮기면 아래 path 를 새 위치로 바꿔 주세요.\n"
        f'path: "{yolo.as_posix()}"\ntrain: images/train\nval: images/val\ntest: images/test\n'
        f"nc: {len(NAMES)}\nnames:\n" + "".join(f'  {i}: "{n}"\n' for i, n in enumerate(NAMES)),
        encoding="utf-8",
    )
    (yolo / "classes.txt").write_text("\n".join(NAMES) + "\n", encoding="utf-8")

    with open(REPORTS / f"{prefix}_manifest.csv", "w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["split", "file_name", "source_file", "width", "height", "boxes", "sha256"])
        writer.writerows(manifest)
    with open(REPORTS / f"{prefix}_excluded.csv", "w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["source_file", "reason"])
        writer.writerows(sorted(excluded))
    reasons = Counter(reason for _, reason in excluded)
    print(f"{prefix}: 저장 {len(manifest)}장, 제외 {len(excluded)}장 {dict(reasons)}")
    print(f"{prefix}: 두 번 그려져 하나로 줄인 박스 {merged_boxes}개, 너무 작아 버린 박스 {dropped_boxes}개")
