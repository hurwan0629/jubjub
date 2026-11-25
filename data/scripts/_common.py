"""data/scripts 의 스크립트들이 같이 쓰는 설정과 함수.

- 데이터셋 목록, 클래스 이름(한글), 색
- COCO 어노테이션 읽기
- 한글 글꼴 설정
- 데이터셋 하나의 숫자 집계 (make_tables.py, make_dist_plots.py 가 같이 씀)

다른 스크립트에서는 `from _common import DATASETS, dataset_stats ...` 처럼 가져다 쓴다.
"""
import json
import math
from collections import Counter
from pathlib import Path

# matplotlib 은 기본으로 화면 창에 그림을 띄우려고 한다.
# 파일로만 저장할 것이므로 "Agg" (화면 없는 백엔드) 로 바꾼다.
# 이 설정은 pyplot 을 import 하기 "전에" 해야 해서 import 사이에 끼어 있다.
import matplotlib
matplotlib.use("Agg")                            # 창 없이 파일로만 저장 (pyplot 보다 먼저)
import matplotlib.pyplot as plt                  # noqa: E402  (import 순서 경고 무시)
from matplotlib import font_manager             # noqa: E402


# ── 1. 경로 ────────────────────────────────────────────────────────────────────
# __file__ = data/scripts/_common.py  →  parent = scripts/  →  parent.parent = data/
# 어느 폴더에서 실행해도 data/ 위치를 정확히 찾기 위해 파일 위치를 기준으로 잡는다.
DATA = Path(__file__).resolve().parent.parent      # data/
REPORTS = DATA / "reports"                         # 결과물(표, 그림, 미리보기)을 두는 곳


# ── 2. 데이터셋 목록 ────────────────────────────────────────────────────────────
# (폴더 이름 앞부분, 표시 이름). 폴더는 data/<prefix>_yolo, data/<prefix>_coco
# 새 데이터셋을 추가하면 여기에 한 줄만 넣으면 표, 그림, 미리보기에 모두 들어간다.
DATASETS = [
    ("aihub_living", "AIHub 생활폐기물"),
    ("taco", "TACO"),
    ("drinking_waste", "Drinking Waste"),
    ("plastopol", "PlastOPol"),
    ("click", "CLICK"),
    ("tod", "TOD"),
    ("howa", "HOWA"),
]
SPLITS = ["train", "val", "test"]                  # 폴더·JSON 파일 이름에 쓰이는 분할 이름
SPLIT_KO = {"train": "학습", "val": "검증", "test": "시험"}   # 표·그림에 보여줄 한글 이름


# ── 3. 클래스 ──────────────────────────────────────────────────────────────────
# 리스트의 순서가 곧 클래스 id 다. CLASSES[2] == "can" 이고 라벨 파일의 2 가 can.
# data_schema.yaml, 각 data.yaml 의 names 와 순서가 같아야 한다.
CLASSES = ["general", "plastic", "can", "glass"]      # 번호 순서 = 클래스 id
CLASS_KO = {"general": "일반", "plastic": "플라스틱", "can": "캔", "glass": "유리"}
COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]  # 기존 figures 와 같은 tab10 색 (파랑, 주황, 초록, 빨강)


# ── 4. 한글 글꼴 설정 ──────────────────────────────────────────────────────────
def setup_korean_font():
    """설치된 한글 글꼴 중 처음 찾은 것을 쓴다. Windows 는 맑은 고딕."""
    # 운영체제마다 한글 글꼴 이름이 달라서 후보를 순서대로 둔다.
    # Noto Sans CJK 는 리눅스에서 JP 이름으로만 잡히는 경우가 있는데, 한글 글자도 들어 있다.
    candidates = ["Malgun Gothic", "AppleGothic", "NanumGothic", "Noto Sans CJK KR", "Noto Sans KR",
                  "Noto Sans CJK JP"]
    # matplotlib 이 알고 있는 글꼴 이름 전체
    installed = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in installed:
            # rcParams = matplotlib 전역 설정. 이후 그리는 모든 그림의 글꼴이 바뀐다.
            plt.rcParams["font.family"] = name
            break
    else:
        # for 문이 break 없이 끝났을 때만 실행된다 = 후보를 하나도 못 찾음
        print("경고: 한글 글꼴을 찾지 못해 글자가 깨질 수 있습니다.")
    plt.rcParams["axes.unicode_minus"] = False   # 한글 글꼴에서 마이너스 기호 깨짐 방지


# ── 5. COCO 어노테이션 읽기 ─────────────────────────────────────────────────────
def load_coco(prefix):
    """{split: {"images": [...], "annotations": [...]}}. 없는 분할은 빠진다."""
    out = {}
    for split in SPLITS:
        # 예: data/taco_coco/annotations/train.json
        path = DATA / f"{prefix}_coco" / "annotations" / f"{split}.json"
        if path.exists():                          # AIHub 처럼 test 가 없는 데이터셋도 있다
            d = json.loads(path.read_text(encoding="utf-8"))
            # categories, info 는 쓰지 않으므로 images 와 annotations 만 남긴다
            out[split] = {"images": d["images"], "annotations": d["annotations"]}
    return out


def class_label(name):
    """'plastic' -> '플라스틱 (plastic)'"""
    return f"{CLASS_KO[name]} ({name})"


# ── 6. 박스 크기 ───────────────────────────────────────────────────────────────
# 박스 크기 구간. 학습 때처럼 이미지 긴 변을 640 으로 줄였다고 보고,
# 박스 넓이의 제곱근(정사각형으로 봤을 때 한 변)을 픽셀로 잰다.
# (아래 값, 위 값, 표에 쓸 이름). 아래 값 이상, 위 값 미만.
SIZE_BINS = [(0, 8, "<8"), (8, 16, "8-16"), (16, 32, "16-32"), (32, 96, "32-96"), (96, math.inf, "≥96")]
TRAIN_SIZE = 640                                   # YOLO 학습 입력 크기 (imgsz)


def box_side(ann, image):
    """이미지 긴 변을 TRAIN_SIZE 로 줄였을 때, 박스를 같은 넓이의 정사각형으로 본 한 변의 길이(px).

    이미지를 실제로 줄이지는 않고 계산만 한다.
    예: 3264×2448 사진의 100×64 박스 → √(100×64)=80px × (640/3264) ≈ 15.7px
    """
    # 긴 변을 640 에 맞추는 축소 비율 (YOLO 도 비율을 유지하며 긴 변을 맞춘다)
    scale = TRAIN_SIZE / max(image["width"], image["height"])
    # COCO bbox = [왼쪽 위 x, 왼쪽 위 y, 너비, 높이] (원본 픽셀). 너비·높이만 쓴다.
    w, h = ann["bbox"][2], ann["bbox"][3]
    # 넓이의 제곱근 = 정사각형 한 변. max(..., 0) 은 음수 값이 잘못 들어 있을 때를 대비한 것
    return math.sqrt(max(w, 0) * max(h, 0)) * scale


# ── 7. 데이터셋 하나의 숫자 집계 ────────────────────────────────────────────────
def dataset_stats(prefix):
    """데이터셋 하나의 숫자를 모은다. 표와 그림 스크립트가 같이 쓴다.

    반환값
      splits[split] = {
        "images": 이미지 수, "boxes": 박스 수, "empty": 박스 없는 이미지 수,
        "class_boxes": [general, plastic, can, glass 박스 수],
        "class_images": [클래스가 하나라도 있는 이미지 수 ...],
        "size_bins": {클래스 id: [구간별 박스 수]},
        "resolutions": Counter((w, h)),
      }
    """
    splits = {}
    for split, d in load_coco(prefix).items():
        # 이미지 id → 이미지 정보. 박스에서 image_id 로 원본 크기를 바로 찾기 위해
        images = {im["id"]: im for im in d["images"]}

        # 숫자를 담을 통을 준비한다 (클래스 4개 기준)
        class_boxes = [0] * len(CLASSES)                 # 클래스별 박스 수
        class_images = [set() for _ in CLASSES]          # 클래스별 "그 클래스가 있는 이미지 id" (set 이라 중복 없음)
        size_bins = {c: [0] * len(SIZE_BINS) for c in range(len(CLASSES))}   # 클래스별 × 크기 구간별 박스 수
        has_box = set()                                  # 박스가 하나라도 있는 이미지 id

        # 박스(annotation)를 한 번 훑으면서 위의 통에 모두 센다
        for a in d["annotations"]:
            c = a["category_id"]                          # 0~3
            class_boxes[c] += 1
            class_images[c].add(a["image_id"])
            has_box.add(a["image_id"])
            # 이 박스가 몇 px 짜리인지 계산해서 맞는 크기 구간에 +1
            side = box_side(a, images[a["image_id"]])
            for i, (lo, hi, _) in enumerate(SIZE_BINS):
                if lo <= side < hi:
                    size_bins[c][i] += 1
                    break

        # 분할 하나의 결과
        splits[split] = {
            "images": len(images),
            "boxes": len(d["annotations"]),
            # 전체 이미지 - 박스가 있는 이미지 = 박스가 없는 이미지
            "empty": len(images) - len(has_box & images.keys()),
            "class_boxes": class_boxes,
            "class_images": [len(s) for s in class_images],   # set 을 개수로 바꿈
            "size_bins": size_bins,
            # (가로, 세로) 별 이미지 수. 예: {(640, 481): 112368, ...}
            "resolutions": Counter((im["width"], im["height"]) for im in images.values()),
        }
    return splits


def total(splits, key):
    """분할을 합친 값. 숫자면 더하고, 리스트면 칸별로 더한다.

    예: total(s, "images") → train+val+test 이미지 수
        total(s, "class_boxes") → [general 합, plastic 합, can 합, glass 합]
    """
    values = [s[key] for s in splits.values()]
    if isinstance(values[0], list):
        # zip(*values) 는 분할별 리스트를 같은 칸끼리 묶는다: [(train_g, val_g, test_g), (train_p, ...), ...]
        return [sum(col) for col in zip(*values)]
    return sum(values)
