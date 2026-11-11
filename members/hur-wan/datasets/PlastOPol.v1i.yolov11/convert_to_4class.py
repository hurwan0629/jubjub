"""PlastOPol(Roboflow, 클래스 1개 'Trash') -> data/plastopol_yolo, data/plastopol_coco (4클래스).

저장소 루트에서 실행:  python members/hur-wan/datasets/PlastOPol.v1i.yolov11/convert_to_4class.py
결과 폴더가 이미 있으면 멈춘다. 다시 만들려면 data/plastopol_yolo, data/plastopol_coco 를 지우고 실행한다.

처리 순서
1. 박스 위치: Roboflow 라벨 '0 x1 y1 x2 y2 x3 y3 x4 y4'(정규화된 4점 폴리곤)의 min/max 로 bbox 를 만든다.
   박스 위치와 개수는 원본 그대로이고, CLIP 은 박스를 새로 찾지 않는다.
2. 클래스: 박스 영역(+10% 여백)을 잘라 CLIP 으로 문장들과 비교한다.
   클래스마다 가장 잘 맞는 문장 점수를 대표로 쓰고, 클래스끼리 softmax 해서 확률을 낸다.
3. 해당 없음(none): 나무, 돌, 신발 등 4클래스 밖 물체. none 확률이 NONE_MIN_PROB 이상일 때만 박스를 뺀다.
   그보다 낮으면 4클래스 중 가장 높은 클래스로 남긴다.
4. 박스가 0개가 된 이미지도 지우지 않고 빈 라벨로 남긴다 (review_empty_images.txt 에 목록).
   박스별 확률과 원본 좌표는 clip_scores.csv 에 남겨, 잘못 빠진 박스를 검수 때 되살릴 수 있게 한다.
"""

import csv
import json
import shutil
import sys
from collections import Counter
from pathlib import Path

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

# ---------------------------------------------------------------- 경로, 설정
SOURCE = Path(__file__).resolve().parent
DATA = Path(__file__).resolve().parents[4] / "data"
YOLO = DATA / "plastopol_yolo"
COCO = DATA / "plastopol_coco" / "annotations"
SPLITS = {
  "train": "train", 
  "valid": "val", 
  "test": "test"
}  # Roboflow 폴더 이름 -> 저장소 split 이름

NAMES = ("general", "plastic", "can", "glass")  # data/ 의 다른 데이터셋과 같은 4클래스
NONE = len(NAMES)                               # 해당 없음의 내부 번호(4). 라벨 파일에는 쓰지 않는다.
LABELS = (*NAMES, "none")

MODEL_ID = "openai/clip-vit-large-patch14"
PAD = 0.10            # 크롭할 때 박스 둘레에 붙이는 여백 비율
NONE_MIN_PROB = 0.70  # none 확률이 이 값 이상일 때만 박스를 뺀다

# 클래스별 비교 문장. 기준은 TACO remap_to_4class.py 의 CLASS_MAP 과 같다.
PROMPTS: dict[int, list[str]] = {
  0: [
      "a crumpled piece of paper", 
      "a cardboard box", 
      "a paper cup", 
      "a paper food tray", 
      "a cigarette butt",
      "a crisp packet", 
      "a piece of aluminium foil", 
      "a metal bottle cap", 
      "a plastic film wrapper", 
      "a piece of rope", 
      "a used tissue",
      "a plastic bag",
  ],
  1: [
    "a plastic bottle", 
    "a clear plastic water bottle", 
    "a plastic jar or tub", 
    "a disposable plastic cup", 
    "a plastic food container", 
    "a plastic straw", 
    "a plastic bottle cap"
  ],
  2: [
    "an aluminum drink can", 
    "a crushed soda can", 
    "a metal food tin can"
  ],
  3: [
    "a glass bottle", 
    "a glass jar", 
    "a drinking glass"
  ],
  # 4클래스 밖 물체 + TACO 에서 제외한 것(신발, 고철, 깨진 유리, 음식물, 건전지)
  NONE: [
    "a piece of styrofoam",
    "a wooden stick or tree branch", 
    "a stone or rock", "dry leaves and grass", 
    "bare soil or sand",
    "a shoe or sandal", 
    "a piece of scrap metal", 
    "broken glass shards", 
    "food waste", 
    "a battery",
    "a piece of cloth or fabric", 
    "a rubber tire"
  ],
}


# ---------------------------------------------------------------- 박스 읽기, 크롭
def read_boxes(label_path: Path) -> list[tuple[float, float, float, float]]:
    """Roboflow 폴리곤 라벨 -> 정규화 (x_min, y_min, x_max, y_max) 목록."""
    boxes = []
    for line_no, line in enumerate(label_path.read_text(encoding="utf-8").splitlines(), start=1):
        fields = line.split()
        if not fields:
            continue
        if fields[0] != "0" or len(fields) < 7 or len(fields) % 2 == 0:
            raise ValueError(f"예상과 다른 라벨: {label_path}:{line_no}")
        xs = [min(max(float(v), 0.0), 1.0) for v in fields[1::2]]
        ys = [min(max(float(v), 0.0), 1.0) for v in fields[2::2]]
        if max(xs) <= min(xs) or max(ys) <= min(ys):
            raise ValueError(f"크기가 0인 박스: {label_path}:{line_no}")
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def crop_with_padding(image: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    """정규화 박스 둘레에 PAD 만큼 여백을 붙여 잘라낸다 (이미지 밖으로 나가지 않게)."""
    x0, y0, x1, y1 = box
    width, height = image.size
    pad_x, pad_y = (x1 - x0) * PAD, (y1 - y0) * PAD
    return image.crop((
        max(0, (x0 - pad_x) * width), max(0, (y0 - pad_y) * height),
        min(width, (x1 + pad_x) * width), min(height, (y1 + pad_y) * height),
    ))


# ---------------------------------------------------------------- CLIP 분류
class ClipClassifier:
    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(MODEL_ID).to(self.device).eval()
        self.processor = CLIPProcessor.from_pretrained(MODEL_ID)

        texts, owners = [], []  # owners[i] = texts[i] 가 속한 클래스 번호
        for class_id, phrases in PROMPTS.items():
            for phrase in phrases:
                texts.append(f"a photo of {phrase} on the ground.")
                owners.append(class_id)
        self.owners = torch.tensor(owners, device=self.device)
        with torch.no_grad():
            inputs = self.processor(text=texts, return_tensors="pt", padding=True).to(self.device)
            features = self.model.get_text_features(**inputs).pooler_output  # transformers 5: 투영된 임베딩
            self.text_features = features / features.norm(dim=-1, keepdim=True)

    def class_probs(self, crops: list[Image.Image]) -> torch.Tensor:
        """크롭 N장 -> [N, 5] 클래스 확률 (general, plastic, can, glass, none)."""
        with torch.no_grad():
            inputs = self.processor(images=crops, return_tensors="pt").to(self.device)
            features = self.model.get_image_features(**inputs).pooler_output
            features = features / features.norm(dim=-1, keepdim=True)
            logits = self.model.logit_scale.exp() * features @ self.text_features.T  # [N, 문장 수]
            # 클래스마다 가장 잘 맞는 문장의 점수를 대표로 (문장 수가 많은 클래스가 유리해지지 않게)
            per_class = [logits[:, self.owners == k].max(dim=1).values for k in range(len(LABELS))]
            return torch.stack(per_class, dim=1).softmax(dim=-1).cpu()


def decide(probs: torch.Tensor) -> int:
    """확률 [5] -> 최종 클래스. none 은 NONE_MIN_PROB 이상일 때만 고른다."""
    if int(probs.argmax()) == NONE and probs[NONE] >= NONE_MIN_PROB:
        return NONE
    return int(probs[:NONE].argmax())


# ---------------------------------------------------------------- 변환
def convert_split(classifier: ClipClassifier, src_split: str, split: str,
                  score_rows: list, empty_images: list) -> Counter:
    src_images, src_labels = SOURCE / src_split / "images", SOURCE / src_split / "labels"
    (YOLO / "images" / split).mkdir(parents=True)
    (YOLO / "labels" / split).mkdir(parents=True)

    images, annotations, counts = [], [], Counter()
    names = sorted(p.name for p in src_images.iterdir() if p.is_file())
    for image_id, name in enumerate(names, start=1):
        boxes = read_boxes(src_labels / f"{Path(name).stem}.txt")
        with Image.open(src_images / name) as image:
            image = image.convert("RGB")
            width, height = image.size
            probs = classifier.class_probs([crop_with_padding(image, b) for b in boxes]) if boxes else []

        shutil.copy2(src_images / name, YOLO / "images" / split / name)
        images.append({"id": image_id, "file_name": name, "width": width, "height": height})

        yolo_lines = []
        for box_index, (box, p) in enumerate(zip(boxes, probs), start=1):
            class_id = decide(p)
            counts[class_id] += 1
            kept = class_id != NONE
            x0, y0, x1, y1 = box
            score_rows.append([split, name, box_index, LABELS[class_id], round(float(p[class_id]), 4),
                               *(round(float(v), 4) for v in p), int(kept),
                               f"{x0:.6f}", f"{y0:.6f}", f"{x1:.6f}", f"{y1:.6f}"])
            if not kept:
                continue
            w, h = x1 - x0, y1 - y0
            yolo_lines.append(f"{class_id} {x0 + w / 2:.6f} {y0 + h / 2:.6f} {w:.6f} {h:.6f}")
            bbox = [x0 * width, y0 * height, w * width, h * height]  # COCO: 픽셀 x, y, w, h
            annotations.append({"id": len(annotations) + 1, "image_id": image_id, "category_id": class_id,
                                "bbox": bbox, "area": bbox[2] * bbox[3], "iscrowd": 0})

        if not yolo_lines:
            empty_images.append(f"{split}/{name}")
        (YOLO / "labels" / split / f"{Path(name).stem}.txt").write_text(
            "".join(line + "\n" for line in yolo_lines), encoding="utf-8")
        if image_id % 200 == 0:
            print(f"  {split}: {image_id}/{len(names)}", flush=True)

    coco = {
        "info": {"description": "PlastOPol single 'Trash' class reclassified into four detection classes "
                                "with CLIP zero-shot", "version": "v1", "split": split},
        "licenses": [],
        "images": images,
        "annotations": annotations,
        "categories": [{"id": i, "name": n, "supercategory": "waste"} for i, n in enumerate(NAMES)],
    }
    (COCO / f"{split}.json").write_text(json.dumps(coco, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{split}: {len(images)} images, {len(annotations)} kept boxes, "
          f"{ {LABELS[k]: v for k, v in sorted(counts.items())} }", flush=True)
    return counts


def write_dataset_files(counts: dict[str, Counter], score_rows: list, empty_images: list) -> None:
    (YOLO / "data.yaml").write_text(
        "# PlastOPol(Roboflow v1) 의 단일 Trash 클래스를 CLIP zero-shot 으로 4클래스에 나눈 초벌 라벨 (검수 전)\n"
        f'path: "{YOLO.as_posix()}"\n'
        "train: images/train\nval: images/val\ntest: images/test\n"
        f"nc: {len(NAMES)}\nnames:\n" + "".join(f'  {i}: "{n}"\n' for i, n in enumerate(NAMES)),
        encoding="utf-8")
    (YOLO / "classes.txt").write_text("".join(n + "\n" for n in NAMES), encoding="utf-8")
    (YOLO / "review_empty_images.txt").write_text("".join(n + "\n" for n in empty_images), encoding="utf-8")

    with open(YOLO / "clip_scores.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["split", "image", "box_index", "pred", "pred_prob", *(f"p_{n}" for n in LABELS),
                         "kept", "x_min", "y_min", "x_max", "y_max"])
        writer.writerows(score_rows)

    excluded = sum(1 for r in score_rows if r[3] == "none")
    low = sum(1 for r in score_rows if r[3] != "none" and r[4] < 0.5)
    info = [
        "PlastOPol -> 4클래스 변환 결과 (초벌, 검수 전)",
        "스크립트: members/hur-wan/datasets/PlastOPol.v1i.yolov11/convert_to_4class.py",
        "원본 라벨: Roboflow YOLOv11 폴리곤(4점), 클래스 1개 'Trash' -> min/max 로 bbox 변환",
        "split: train->train, valid->val, test->test, 이미지는 원본 그대로 복사",
        f"클래스 분류: {MODEL_ID} zero-shot, bbox 주변 {int(PAD * 100)}% 여백 크롭, "
        "클래스마다 가장 잘 맞는 문장 점수를 대표로 쓰고 클래스끼리 softmax",
        f"none(해당 없음): 확률 {NONE_MIN_PROB} 이상일 때만 라벨에서 제외, 좌표는 clip_scores.csv(kept=0)에 남김",
        "문장: " + json.dumps({LABELS[k]: v for k, v in PROMPTS.items()}, ensure_ascii=False),
        *(f"{s}: " + ", ".join(f"{LABELS[k]} {c[k]}" for k in range(len(LABELS))) for s, c in counts.items()),
        f"원본 박스 {len(score_rows)}개 중 none 으로 제외 {excluded}개, 남은 박스 중 pred_prob < 0.5 {low}개",
        f"박스가 0개가 된 이미지 {len(empty_images)}장 -> review_empty_images.txt (빈 라벨로 남겨 둠)",
    ]
    (YOLO / "export_info.txt").write_text("\n".join(info) + "\n", encoding="utf-8")
    print("\n".join(info[-5:]))


def main() -> None:
    for target in (YOLO, COCO.parent):
        if target.exists():
            sys.exit(f"{target} 가 이미 있습니다. 지우고 다시 실행하세요.")
    COCO.mkdir(parents=True)

    classifier = ClipClassifier()
    counts, score_rows, empty_images = {}, [], []
    for src_split, split in SPLITS.items():
        counts[split] = convert_split(classifier, src_split, split, score_rows, empty_images)
    write_dataset_files(counts, score_rows, empty_images)


if __name__ == "__main__":
    main()
