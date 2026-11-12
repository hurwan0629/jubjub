"""raw/ 이미지를 Grounding DINO로 탐지해서 YOLO 데이터셋(dataset/)을 만든다.

실행: python label.py
결과: dataset/images/{train,val,test}, dataset/labels/{train,val,test}, data.yaml,
      detections.csv (박스별 점수), review_empty_images.txt (박스 0개 이미지)
"""
import csv
import random
import shutil
from pathlib import Path

import torch
from PIL import Image
from torchvision.ops import box_convert, nms
from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE / "dataset"

MODEL_ID = "IDEA-Research/grounding-dino-base"
NAMES = ("general", "plastic", "can", "glass")
BOX_THRESHOLD = 0.30   # 이보다 확신 낮은 박스는 버림
MAX_AREA = 0.80        # 이미지 대부분을 덮는 박스(장면 전체를 잡은 경우)는 버림
NMS_IOU = 0.50         # 같은 물체에 겹친 박스는 점수 높은 것 하나만 남김
SPLIT = {"train": 0.8, "val": 0.1, "test": 0.1}

# 탐지 문구 -> 클래스 번호 (0 general, 1 plastic, 2 can, 3 glass)
PHRASES = {
    "plastic bottle": 1,
    "plastic bag": 1,
    "plastic cup": 1,
    "plastic container": 1,
    "styrofoam": 1,
    "paper cup": 0,
    "cardboard": 0,
    "paper": 0,
    "cigarette butt": 0,
    "snack wrapper": 0,
    "aluminum can": 2,
    "tin can": 2,
    "glass bottle": 3,
    "glass jar": 3,
}


class Detector:
    def __init__(self):
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID).cuda().eval()
        self.text = " . ".join(PHRASES) + " ."

        # 각 문구가 텍스트 토큰 중 몇 번째~몇 번째인지 기록 ([CLS]가 0번)
        tokenizer = self.processor.tokenizer
        self.spans = []
        pos = 1
        for phrase in PHRASES:
            n = len(tokenizer(phrase, add_special_tokens=False).input_ids)
            self.spans.append((pos, pos + n))
            pos += n + 1                     # +1은 문구 사이의 "."

    @torch.no_grad()
    def __call__(self, image):
        """반환: [(class_id, phrase, score, cx, cy, w, h), ...]  좌표는 0~1 정규화"""
        inputs = self.processor(images=image, text=self.text, return_tensors="pt").to("cuda")
        out = self.model(**inputs)
        token_probs = out.logits[0].sigmoid()            # [900 후보, 토큰 수]
        boxes = out.pred_boxes[0]                        # [900, 4] cx cy w h (0~1)

        # 문구 점수 = 그 문구 토큰들의 평균 확률 -> 가장 높은 문구가 그 박스의 클래스
        phrase_scores = torch.stack([token_probs[:, a:b].mean(dim=1) for a, b in self.spans], dim=1)
        scores, best = phrase_scores.max(dim=1)

        keep = (scores >= BOX_THRESHOLD) & (boxes[:, 2] * boxes[:, 3] <= MAX_AREA)
        scores, best, boxes = scores[keep], best[keep], boxes[keep]
        keep = nms(box_convert(boxes, "cxcywh", "xyxy"), scores, NMS_IOU)

        phrases = list(PHRASES)
        results = []
        for i in keep.tolist():
            phrase = phrases[best[i]]
            cx, cy, w, h = boxes[i].tolist()
            results.append((PHRASES[phrase], phrase, float(scores[i]), cx, cy, w, h))
        return results


def main():
    if OUT.exists():
        raise SystemExit(f"{OUT} already exists. 지우고 다시 실행하세요.")

    files = sorted(RAW.glob("*.jpg"))
    random.Random(0).shuffle(files)
    n_train = int(len(files) * SPLIT["train"])
    n_val = int(len(files) * SPLIT["val"])
    splits = {
        "train": files[:n_train],
        "val": files[n_train:n_train + n_val],
        "test": files[n_train + n_val:],
    }

    detector = Detector()
    rows, empty = [], []

    for split, split_files in splits.items():
        (OUT / "images" / split).mkdir(parents=True)
        (OUT / "labels" / split).mkdir(parents=True)

        for k, path in enumerate(split_files, 1):
            detections = detector(Image.open(path).convert("RGB"))
            shutil.copy2(path, OUT / "images" / split / path.name)

            lines = []
            for cls, phrase, score, cx, cy, w, h in detections:
                lines.append(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
                rows.append([split, path.name, NAMES[cls], phrase, f"{score:.3f}",
                             f"{cx:.4f}", f"{cy:.4f}", f"{w:.4f}", f"{h:.4f}"])
            (OUT / "labels" / split / f"{path.stem}.txt").write_text("\n".join(lines))
            if not lines:
                empty.append(f"{split}/{path.name}")
            if k % 100 == 0:
                print(f"  {split}: {k}/{len(split_files)}")
        print(f"{split}: {len(split_files)} images")

    (OUT / "data.yaml").write_text(
        f'path: "{OUT.as_posix()}"\ntrain: images/train\nval: images/val\ntest: images/test\n'
        f"nc: {len(NAMES)}\nnames:\n" + "".join(f'  {i}: "{n}"\n' for i, n in enumerate(NAMES)),
        encoding="utf-8",
    )
    with open(OUT / "detections.csv", "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(["split", "image", "class", "phrase", "score", "cx", "cy", "w", "h"])
        writer.writerows(rows)
    (OUT / "review_empty_images.txt").write_text("\n".join(empty), encoding="utf-8")

    counts = {n: sum(r[2] == n for r in rows) for n in NAMES}
    print(f"boxes: {len(rows)} {counts}")
    print(f"empty images: {len(empty)} -> review_empty_images.txt")


if __name__ == "__main__":
    main()
