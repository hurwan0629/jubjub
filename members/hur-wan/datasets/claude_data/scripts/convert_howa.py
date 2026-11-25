"""HOWA(재질 기준 4클래스) -> howa_yolo, howa_coco (4클래스).

실행: python scripts/convert_howa.py      (먼저 python scripts/download.py howa)
원본: _raw/howa/extracted/dataset/<train|val|test>/image_rgb_<번호>.png 와 같은 이름의 .json (labelme 형식)

- 사진 한 장에 물체가 하나다. 라벨은 물체 윤곽을 따라 찍은 점(다각형)이라서,
  점들의 가장 왼쪽·위·오른쪽·아래 값으로 박스를 만든다.
- 원본의 train/val/test 폴더는 쓰지 않는다. 고정된 카메라 앞에서 물건만 바꿔 놓으며 찍은 사진을
  무작위로 나눈 것이라, 같은 배경과 같은 물건이 세 분할에 모두 들어 있다 (WORKLOG.md 참고).
  대신 촬영 장소(장면) 단위로 나눈다. 파일 번호가 촬영 순서라서 번호 범위가 곧 장면이다 (SCENES).
- 라벨 없는 물체가 하나 더 찍힌 사진은 통째로 뺀다 (UNLABELED). 사진을 직접 보고 찾은 구간이다.
"""
import json
from collections import Counter

from common import RAW, write_dataset

SOURCE = RAW / "howa" / "extracted" / "dataset"

# 원본 클래스 -> 4클래스 번호 (0 general, 1 plastic, 2 can, 3 glass). 크롭을 보고 확인한 내용을 옆에 적었다.
CLASS_MAP = {
    "carton": 0,     # 종이팩, 종이 상자 -> general
    "plastic": 1,    # 병, 용기, 컵. 비닐·봉지는 없다
    "metal": 2,      # 음료 캔, 통조림 캔
    "glass": 3,      # 병, 유리 용기, 유리컵
}

# (첫 번호, 끝 번호, 장면, 분할). 장면 하나를 통째로 val 로, 다른 하나를 통째로 test 로 쓴다.
SCENES = [
    (0, 1198, "흙바닥", "val"),
    (1202, 3281, "아스팔트와 담", "train"),
    (3283, 4642, "자갈 더미", "train"),
    (4647, 6702, "붉은 흙과 콘크리트 턱", "train"),
    (7000, 7407, "구덩이", "train"),
    (7409, 9140, "붉은 흙과 콘크리트 보", "train"),
    (10001, 10697, "풀밭", "test"),
    (10703, 11802, "아스팔트", "train"),
    (11806, 12043, "아스팔트와 나무 그림자", "train"),
]

# (첫 번호, 끝 번호, 제외하는 이유). 앞 물체를 치우지 않고 다음 사진을 찍은 구간이다.
UNLABELED = [
    (1681, 1686, "라벨 없는 물체가 하나 더 있음 (흰 컵)"),
    (3412, 3433, "라벨 없는 물체가 하나 더 있음 (캔)"),
]


def scene_of(number):
    """파일 번호가 속한 (장면, 분할)."""
    for first, last, scene, split in SCENES:
        if first <= number <= last:
            return scene, split
    raise ValueError(f"SCENES 에 없는 번호입니다: {number}")


def unlabeled_reason(number):
    """라벨 없는 물체가 있는 구간이면 제외 이유, 아니면 None."""
    for first, last, reason in UNLABELED:
        if first <= number <= last:
            return reason
    return None


def main():
    records, excluded, per_scene = [], [], Counter()
    for path in sorted(SOURCE.glob("*/*.json")):
        label = json.loads(path.read_text(encoding="utf-8"))
        image_name = path.stem + ".png"
        number = int(path.stem.split("_")[-1])                 # image_rgb_10019 -> 10019

        reason = unlabeled_reason(number)
        if reason:
            excluded.append((image_name, reason))
            continue

        boxes = []
        for shape in label["shapes"]:
            xs = [x for x, y in shape["points"]]
            ys = [y for x, y in shape["points"]]
            boxes.append((CLASS_MAP[shape["label"]], min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)))

        scene, split = scene_of(number)
        per_scene[f"{split:5} {scene}"] += 1
        records.append({
            "split": split,
            "source": path.with_suffix(".png"),
            "name": "howa_" + image_name,
            "size": (label["imageWidth"], label["imageHeight"]),
            "boxes": boxes,
        })

    write_dataset(
        "howa", records, excluded,
        description="HOWA household waste dataset (4 material classes) remapped to four detection classes",
        version="v1",
        source={"source": "HOWA dataset v1 (Paez-Ubieta, Castano-Amoros, Puente, Gil, 2023)",
                "url": "https://iuii.ua.es/datasets/howa/index.html",
                "license": "non-profit research or educational purposes only"},
    )
    for scene, count in per_scene.items():
        print(f"  {scene}: {count}장")


if __name__ == "__main__":
    main()
