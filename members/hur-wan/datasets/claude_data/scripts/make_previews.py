"""변환된 라벨을 사진 위에 그려 previews/ 에 저장한다. 라벨이 물체와 맞는지 눈으로 확인하는 용도.

실행: python scripts/make_previews.py            (데이터셋·분할마다 12장씩)
      python scripts/make_previews.py 24 3       (24장씩, 시드 3 으로 다른 사진을 뽑음)

YOLO 라벨(<이름>_yolo/labels)을 읽어서 그린다. 색은 data/figures 의 그림과 같다.
"""
import random
import sys

from PIL import Image, ImageDraw

from common import NAMES, ROOT, SPLITS

OUT = ROOT / "previews"
COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]     # general, plastic, can, glass
TILE, COLUMNS = 640, 4


def draw(image_path, label_path):
    """사진 한 장을 TILE 크기로 줄이고 박스와 클래스 이름을 그린다."""
    image = Image.open(image_path).convert("RGB")
    image.thumbnail((TILE, TILE))
    width, height = image.size
    pen = ImageDraw.Draw(image)
    for line in label_path.read_text(encoding="utf-8").splitlines():
        cls, cx, cy, w, h = line.split()
        cx, cy, w, h = float(cx) * width, float(cy) * height, float(w) * width, float(h) * height
        box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
        color, name = COLORS[int(cls)], NAMES[int(cls)]
        pen.rectangle([box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1], outline="black", width=4)   # 테두리
        pen.rectangle(box, outline=color, width=2)
        pen.rectangle([box[0], box[1] - 12, box[0] + pen.textlength(name) + 4, box[1]], fill=color)
        pen.text((box[0] + 2, box[1] - 12), name, fill="white")
    pen.rectangle([0, 0, pen.textlength(image_path.name) + 6, 12], fill="black")
    pen.text((3, 0), image_path.name, fill="white")
    return image


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    OUT.mkdir(exist_ok=True)
    for yolo in sorted(ROOT.glob("*_yolo")):
        for split in SPLITS:
            image_dir = yolo / "images" / split
            if not image_dir.is_dir():
                continue
            picks = random.Random(seed).sample(sorted(image_dir.iterdir()), count)
            tiles = [draw(path, yolo / "labels" / split / (path.stem + ".txt")) for path in picks]
            # 한 줄의 높이는 그 줄에서 가장 큰 사진에 맞춘다 (가로로 긴 사진 아래에 빈칸이 남지 않게).
            rows = [tiles[i:i + COLUMNS] for i in range(0, len(tiles), COLUMNS)]
            heights = [max(tile.height for tile in row) for row in rows]
            sheet = Image.new("RGB", (TILE * COLUMNS, sum(heights)), "#202020")
            for r, row in enumerate(rows):
                for c, tile in enumerate(row):
                    sheet.paste(tile, (c * TILE, sum(heights[:r])))
            name = f"{yolo.name[:-5]}_{split}_seed{seed}.jpg"
            sheet.save(OUT / name, quality=88)
            print("저장:", OUT / name)


if __name__ == "__main__":
    main()
