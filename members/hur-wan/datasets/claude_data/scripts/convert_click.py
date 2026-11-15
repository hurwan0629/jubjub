"""CLICK Trash Dataset(13클래스) -> click_yolo, click_coco (4클래스).

실행: python scripts/convert_click.py      (먼저 python scripts/download.py click)
원본: _raw/click/extracted/  (images/<split>/, "multi class/annotations/instances_<split>.json")

- 분할(train/val/test)은 원본이 정한 그대로 쓴다.
- 4클래스 중 어디인지 원본 클래스 이름만으로 정할 수 없는 물체가 있으면 그 이미지를 통째로 뺀다.
  박스만 지우면 라벨 없는 쓰레기가 사진에 남아 "배경"으로 학습되기 때문이다.
- 쓰레기가 없는 사진 4장은 빈 라벨 파일로 남긴다 (배경 예시).
- 한 물체에 박스가 두 번 그려진 경우는 common.write_dataset() 이 정리한다.
"""
import json
import re

from common import RAW, write_dataset

SOURCE = RAW / "click" / "extracted"

# 원본 클래스 -> 4클래스 번호 (0 general, 1 plastic, 2 can, 3 glass). 기준은 data/ 의 TACO 매핑과 같다.
CLASS_MAP = {
    "Plastic Bottle": 1,
    "Metal Can": 2,
    "Crumbled Paper": 0,     # 종이류 -> general
    "Paper Cup": 0,
    "Paper Pack": 0,         # 종이팩, 종이 포장
    "Cardboard": 0,
    "Match Box": 0,
    "Plastic Bag": 0,        # 비닐류 -> general
    "Plastic Packet": 0,     # 과자 봉지 등
    "Silver Foil": 0,        # 은박지
    "Bottle Cap": None,      # 재질을 알 수 없음 (플라스틱이면 plastic, 금속이면 can)
    "Others": None,          # 종류를 알 수 없음
    "Slippers": None,        # 4클래스 밖
}


def main():
    records, excluded = [], []
    for split in ("train", "val", "test"):
        path = SOURCE / "multi class" / "annotations" / f"instances_{split}.json"
        coco = json.loads(path.read_text(encoding="utf-8"))
        names = {c["id"]: c["name"] for c in coco["categories"]}
        boxes_by_image = {}
        for ann in coco["annotations"]:
            boxes_by_image.setdefault(ann["image_id"], []).append(ann)

        for image in coco["images"]:
            anns = boxes_by_image.get(image["id"], [])
            unmapped = sorted({names[a["category_id"]] for a in anns if CLASS_MAP[names[a["category_id"]]] is None})
            if unmapped:
                excluded.append((image["file_name"], "매핑할 수 없는 클래스: " + ", ".join(unmapped)))
                continue
            number = int(re.fullmatch(r"trash \((\d+)\)\.jpg", image["file_name"]).group(1))
            records.append({
                "split": split,
                "source": SOURCE / "images" / split / image["file_name"],
                "name": f"click_{number:04d}.jpg",        # "trash (10).jpg" -> "click_0010.jpg"
                "size": (image["width"], image["height"]),
                "boxes": [(CLASS_MAP[names[a["category_id"]]], *a["bbox"]) for a in anns],
            })

    write_dataset(
        "click", records, excluded,
        description="CLICK Trash Dataset (13 classes) remapped to four detection classes",
        version="v1",
        source={"source": "CLICK Trash Dataset v1.0 (Manjit Baishya, 2026)",
                "url": "https://huggingface.co/datasets/manjt/click_trash_dataset",
                "license": "MIT"},
    )


if __name__ == "__main__":
    main()
