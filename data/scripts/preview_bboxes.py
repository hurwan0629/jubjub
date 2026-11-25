"""데이터셋마다 무작위 이미지 N장(기본 40장)에 라벨 박스를 그려 한 장으로 모은다.

박스가 물체에 맞는지, 클래스가 맞는지, 라벨 없는 쓰레기가 있는지 눈으로 보기 위한 것이다.
학습에 실제로 쓰이는 YOLO 라벨(<이름>_yolo/labels/<split>/*.txt)을 그린다.

만드는 것: reports/previews/<이름>_seed<시드>.jpg
  이 파일은 데이터셋 이미지 자체를 담고 있어서 git 에 올리지 않는다 (.gitignore).

실행: data/ 에서
  python scripts/preview_bboxes.py                      # 전체 데이터셋, 40장, 시드 0
  python scripts/preview_bboxes.py taco howa --n 20 --seed 1

큰 흐름 (데이터셋마다)
  1) list_images : 모든 분할의 이미지 경로를 모은다
  2) 무작위로 N장 고른다 (시드가 같으면 항상 같은 N장)
  3) make_tile   : 한 장씩 YOLO 라벨을 읽어 박스를 그리고 400×400 칸으로 만든다
  4) 칸들을 8열 격자로 붙이고, 맨 위에 클래스 색 범례를 붙여 jpg 로 저장
"""
import argparse
import random

from PIL import Image, ImageDraw, ImageFont

from _common import CLASSES, COLORS, DATA, DATASETS, REPORTS, SPLITS

TILE = 400          # 칸 하나의 크기(px). 이미지는 이 안에 들어가게 줄인다
COLS = 8            # 한 줄에 칸 8개 → 40장이면 5줄
IMAGE_EXT = {".jpg", ".jpeg", ".png"}   # 이미지로 인정할 확장자


# ── 1. 이미지 목록 ────────────────────────────────────────────────────────────────
def list_images(prefix):
    """[(split, 이미지 경로)] 전체 분할."""
    items = []
    for split in SPLITS:
        folder = DATA / f"{prefix}_yolo" / "images" / split     # 예: data/taco_yolo/images/train
        if folder.exists():
            # sorted: 폴더를 읽는 순서는 운영체제마다 다를 수 있어서 정렬로 고정한다.
            # 순서가 고정돼야 같은 시드에서 같은 이미지가 뽑힌다.
            items += [(split, p) for p in sorted(folder.iterdir()) if p.suffix.lower() in IMAGE_EXT]
    return items


# ── 2. YOLO 라벨 읽기 ─────────────────────────────────────────────────────────────
def read_yolo(label_path):
    """[(class_id, cx, cy, w, h)] 0~1 정규화 좌표. 파일이 없으면 None."""
    # 없음(None)과 빈 파일([])을 구분한다. 그림에서 다르게 표시하기 위해
    if not label_path.exists():
        return None
    boxes = []
    # YOLO 라벨 한 줄 = "클래스 중심x 중심y 너비 높이" (좌표는 이미지 크기 대비 0~1)
    for line in label_path.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) == 5:                   # 칸 수가 다른 줄은 그리지 않고 건너뜀 (형식 검사는 하지 않음)
            boxes.append((int(parts[0]), *map(float, parts[1:])))
    return boxes


# ── 3. 칸 하나 만들기: 이미지 + 박스 + 파일 이름 ──────────────────────────────────
def make_tile(split, image_path, font):
    # 이미지 경로에서 라벨 경로를 만든다 (Ultralytics 가 라벨을 찾는 규칙과 같은 결과)
    #   taco_yolo/images/train/a.jpg → 세 단계 위 taco_yolo/ → taco_yolo/labels/train/a.txt
    label_path = image_path.parent.parent.parent / "labels" / split / (image_path.stem + ".txt")
    boxes = read_yolo(label_path)

    # 이미지를 열고 칸 크기에 맞게 줄인다
    image = Image.open(image_path).convert("RGB")       # PNG 투명도 등을 RGB 로 통일
    image.thumbnail((TILE, TILE - 24))                 # 아래 24px 는 파일 이름 자리. 비율 유지, image 자체가 바뀜
    w, h = image.size                                  # 줄인 뒤 크기 (박스 좌표 계산에 씀)
    draw = ImageDraw.Draw(image)                       # image 에 그리는 붓
    line = max(2, w // 150)                            # 박스 선 굵기. 이미지가 크면 조금 굵게

    # 박스마다: 사각형 + 왼쪽 위에 클래스 이름 딱지
    for c, cx, cy, bw, bh in boxes or []:              # boxes 가 None 이면 빈 리스트로 보고 건너뜀
        # 0~1 중심 좌표 → 줄인 이미지의 픽셀 좌표 (왼쪽 위 x0,y0 / 오른쪽 아래 x1,y1)
        x0, y0 = (cx - bw / 2) * w, (cy - bh / 2) * h
        x1, y1 = (cx + bw / 2) * w, (cy + bh / 2) * h
        color = COLORS[c] if 0 <= c < len(COLORS) else "#ff00ff"   # 범위 밖 클래스는 자홍색
        name = CLASSES[c] if 0 <= c < len(CLASSES) else f"?{c}"    # 범위 밖이면 "?5" 처럼 표시
        draw.rectangle([x0, y0, x1, y1], outline=color, width=line)   # 박스 테두리
        # 클래스 이름 딱지: 글자 폭(tw)만큼 색칠한 사각형을 박스 바로 위에 깔고 흰 글씨
        # max(0, ...) 은 박스가 이미지 맨 위에 붙어 있을 때 딱지가 화면 밖으로 나가지 않게
        tw = draw.textlength(name, font=font)
        draw.rectangle([x0, max(0, y0 - 16), x0 + tw + 6, max(16, y0)], fill=color)
        draw.text((x0 + 3, max(0, y0 - 16)), name, fill="white", font=font)

    # 400×400 흰 칸 가운데에 이미지를 붙인다
    tile = Image.new("RGB", (TILE, TILE), "white")
    tile.paste(image, ((TILE - w) // 2, (TILE - 24 - h) // 2))

    # 칸 아래쪽에 "분할/파일이름" 표시. 라벨 문제가 있으면 뒤에 표시를 붙이고 빨간 글씨
    caption = f"{split}/{image_path.name}"
    if boxes is None:                                   # 기본 글꼴이라 한글 대신 영어로 표시
        caption += "  [NO LABEL FILE]"
    elif not boxes:
        caption += "  [0 boxes]"
    d = ImageDraw.Draw(tile)                            # 이번에는 tile 에 그리는 붓
    d.text((4, TILE - 21), caption[:60], fill="black" if boxes else "red", font=font)   # 60자 넘으면 자름
    return tile


# ── 4. 맨 위 범례 띠 ─────────────────────────────────────────────────────────────
def legend(font, width):
    bar = Image.new("RGB", (width, 34), "white")        # 시트 폭만큼, 높이 34px
    d = ImageDraw.Draw(bar)
    x = 10
    for name, color in zip(CLASSES, COLORS):
        d.rectangle([x, 9, x + 18, 25], fill=color)     # 색 견본 사각형
        d.text((x + 24, 9), name, fill="black", font=font)
        x += 130                                        # 다음 항목은 오른쪽으로 130px
    return bar


def main():
    # ── 명령줄 옵션 ──────────────────────────────────────────────────────────────
    names = [p for p, _ in DATASETS]
    parser = argparse.ArgumentParser()
    # 데이터셋 이름을 0개 이상 받는다 (nargs="*"). 안 주면 전체
    parser.add_argument("datasets", nargs="*", default=names, help=f"기본: 전체 ({', '.join(names)})")
    parser.add_argument("--n", type=int, default=40, help="데이터셋마다 뽑을 이미지 수")
    parser.add_argument("--seed", type=int, default=0, help="같은 시드면 같은 이미지가 뽑힌다")
    args = parser.parse_args()

    # ── 글꼴과 저장 폴더 ─────────────────────────────────────────────────────────
    # 내장 기본 글꼴 (한글 없음). Pillow 10.1 부터 size 를 줄 수 있다
    try:
        font = ImageFont.load_default(size=14)
    except TypeError:                                   # Pillow 10.1 미만
        font = ImageFont.load_default()
    out_dir = REPORTS / "previews"
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 데이터셋마다 한 장씩 ─────────────────────────────────────────────────────
    for prefix in args.datasets:
        items = list_images(prefix)
        # random.Random(시드): 이 시드 전용 난수 생성기. 전역 random 상태와 섞이지 않는다
        picked = random.Random(args.seed).sample(items, min(args.n, len(items)))
        rows = (len(picked) + COLS - 1) // COLS          # 줄 수 (올림)
        # 전체 시트: 맨 위 34px 범례 + 칸 격자
        sheet = Image.new("RGB", (COLS * TILE, rows * TILE + 34), "white")
        sheet.paste(legend(font, COLS * TILE), (0, 0))
        for i, (split, path) in enumerate(picked):
            # i 번째 칸의 위치: 열 = i % 8, 줄 = i // 8
            sheet.paste(make_tile(split, path, font), ((i % COLS) * TILE, 34 + (i // COLS) * TILE))
        out = out_dir / f"{prefix}_seed{args.seed}.jpg"
        sheet.save(out, quality=85)                     # jpg 화질 85 (용량과 화질의 타협)
        print(f"저장: {out}  ({len(picked)}장 / 전체 {len(items):,}장)")


if __name__ == "__main__":
    main()
