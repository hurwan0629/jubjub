"""TOD(TADA, 환경부 분리배출 기준 10클래스) -> tod_yolo, tod_coco (4클래스).

실행: python scripts/convert_tod.py      (먼저 python scripts/download.py tod)
원본: _raw/tod/extracted/  (train2017/, val2017/, annotations/instances_<분할>2017.json)

- 파일 이름이 paded_ 로 시작하는 이미지는 쓰지 않는다. 사진을 줄여 회색 여백을 붙인 것인데,
  박스 좌표는 줄이기 전 그대로라 물체와 맞지 않는다 (WORKLOG.md 참고).
- cap(뚜껑), label(라벨)은 병·캔에 붙은 부품이다. 본체 박스 안에 있으면 박스만 지운다.
  본체에서 떨어져 혼자 놓인 뚜껑은 재질(플라스틱/금속)을 알 수 없으므로 그 이미지를 통째로 뺀다.
- 분할: 원본 val2017(다른 카메라로 찍은 400장)을 test 로 쓰고, 원본 train2017 을 train/val 로 나눈다.
  같은 물건을 자리만 바꿔 연달아 찍었기 때문에, 번호가 이어지는 사진 20장을 한 묶음으로 보고
  묶음 단위로 나눈다 (10묶음 중 1묶음이 val).
- 한 물체에 박스가 두 번 그려진 경우는 common.write_dataset() 이 정리한다.
"""
import json

from common import RAW, write_dataset

SOURCE = RAW / "tod" / "extracted"

# 원본 클래스 -> 4클래스 번호 (0 general, 1 plastic, 2 can, 3 glass). data/ 의 AIHub 매핑과 같은 기준이다.
CLASS_MAP = {
    "paper": 0, "paperpack": 0, "papercup": 0,   # 종이류 -> general
    "vinyl": 0,                                  # 비닐 -> general
    "pet": 1, "plastic": 1,
    "can": 2,
    "bottle": 3,                                 # TOD 의 bottle 은 유리병
}
PARTS = {"cap", "label"}        # 본체에 붙은 부품
ATTACHED = 0.7                  # 부품 넓이의 70% 이상이 본체 박스 안에 있으면 "붙어 있다"고 본다
GROUP, VAL_EVERY = 20, 10       # 연속 20장이 한 묶음, 10묶음마다 1묶음을 val 로


def inside(part, body):
    """part 박스 넓이 중 body 박스 안에 들어간 비율 (박스는 x, y, w, h)."""
    px, py, pw, ph = part
    bx, by, bw, bh = body
    overlap_w = max(0.0, min(px + pw, bx + bw) - max(px, bx))
    overlap_h = max(0.0, min(py + ph, by + bh) - max(py, by))
    return overlap_w * overlap_h / (pw * ph) if pw * ph > 0 else 0.0


def main():
    records, excluded = [], []
    for folder in ("train2017", "val2017"):
        coco = json.loads((SOURCE / "annotations" / f"instances_{folder}.json").read_text(encoding="utf-8"))
        names = {c["id"]: c["name"] for c in coco["categories"]}
        boxes_by_image = {}
        for ann in coco["annotations"]:
            boxes_by_image.setdefault(ann["image_id"], []).append((names[ann["category_id"]], ann["bbox"]))

        for image in coco["images"]:
            file_name = image["file_name"]
            if file_name.startswith("paded_"):
                excluded.append((file_name, "여백을 붙인 이미지: 박스가 물체와 맞지 않음"))
                continue
            boxes = boxes_by_image.get(image["id"], [])
            bodies = [box for name, box in boxes if name in CLASS_MAP]
            loose = [name for name, box in boxes
                     if name in PARTS and max((inside(box, body) for body in bodies), default=0.0) < ATTACHED]
            if loose:
                excluded.append((file_name, "본체에서 떨어진 " + ", ".join(sorted(set(loose)))))
                continue

            if folder == "val2017":
                split = "test"
            else:
                date, number = file_name[:-4].split("_")           # 20201209_618.jpg -> 20201209, 618
                group = (int(number) - 1) // GROUP
                split = "val" if group % VAL_EVERY == VAL_EVERY - 1 else "train"
            records.append({
                "split": split,
                "source": SOURCE / folder / file_name,
                "name": "tod_" + file_name,
                "size": (image["width"], image["height"]),
                "boxes": [(CLASS_MAP[name], *box) for name, box in boxes if name in CLASS_MAP],
            })

    write_dataset(
        "tod", records, excluded,
        description="TOD (TADA, 10 classes) remapped to four detection classes",
        version="v1",
        source={"source": "TOD: Trash Object Detection Dataset v1.0 (Jo, Han, Jeong, 2021)",
                "url": "https://doi.org/10.5281/zenodo.4607158",
                "license": "MIT"},
    )


if __name__ == "__main__":
    main()
