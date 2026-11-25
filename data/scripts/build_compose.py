"""compose/ 를 만든다. 이미지는 복사하지 않고, 이미지 경로 목록(txt)과 YOLO yaml 만 만든다.

규칙은 하나: 각 데이터셋의 원래 train / val / test 를 그대로 합친다.
AIHub 는 기본에서 빼고 따로 둔다 (실내 수거함 사진이라 실전과 달라서).

만드는 것 (data/compose/):
  train.txt         AIHub 를 뺀 데이터셋들의 train
  val.txt           AIHub 를 뺀 데이터셋들의 val
  test.txt          AIHub 를 뺀 데이터셋들의 test
  train_aihub.txt   AIHub 전부 (원래 train + val). 사전학습이나 추가 실험용
  data.yaml         train.txt 로 학습
  data_aihub.yaml   train_aihub.txt 로 학습. val, test 는 data.yaml 과 같음
  README.md         데이터셋별 이미지 수와 사용법 (이 스크립트가 다시 씀)

실행: data/ 에서
  python scripts/build_compose.py
  python scripts/build_compose.py --root D:/data   # 다른 컴퓨터에서 학습할 때. 그 컴퓨터의 data/ 경로

YOLO 는 이미지 경로의 /images/ 를 /labels/ 로 바꿔서 라벨을 찾는다.
그래서 목록에 이미지 경로만 적어도 원래 자리의 라벨이 그대로 쓰인다.
"""
import argparse

from _common import CLASSES, DATA, DATASETS, SPLITS

OUT = DATA / "compose"
IMAGE_EXT = {".jpg", ".jpeg", ".png"}
AIHUB = "aihub_living"


# ── 1. 데이터셋 하나, 분할 하나의 이미지 경로 ────────────────────────────────────
def image_paths(prefix, split, root):
    folder = DATA / f"{prefix}_yolo" / "images" / split           # 예: data/taco_yolo/images/train
    if not folder.exists():                                       # 없는 분할(AIHub test)은 빈 목록
        return []
    # 목록에는 학습할 컴퓨터 기준 절대 경로(root)로 적는다. 정렬해서 순서를 고정
    return [f"{root}/{prefix}_yolo/images/{split}/{p.name}"
            for p in sorted(folder.iterdir()) if p.suffix.lower() in IMAGE_EXT]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=DATA.resolve().as_posix(),
                        help="목록에 적을 data/ 폴더의 절대 경로 (학습할 컴퓨터 기준)")
    args = parser.parse_args()
    root = args.root.rstrip("/\\").replace("\\", "/")      # 끝의 / 제거, 윈도우 \ → /

    # ── 2. 목록 만들기 ───────────────────────────────────────────────────────────
    others = [p for p, _ in DATASETS if p != AIHUB]        # AIHub 를 뺀 6개
    counts = {}                                            # README 표용: (데이터셋, 목록) → 이미지 수
    lists = {"train": [], "val": [], "test": [], "train_aihub": []}

    # 기본 목록: 6개 데이터셋의 train → train.txt, val → val.txt, test → test.txt
    for prefix in others:
        for split in SPLITS:
            paths = image_paths(prefix, split, root)
            lists[split] += paths
            counts[(prefix, split)] = len(paths)

    # AIHub 목록: 원래 train 과 val 을 모두 학습용으로
    for split in ["train", "val"]:
        paths = image_paths(AIHUB, split, root)
        lists["train_aihub"] += paths
        counts[(AIHUB, f"aihub_{split}")] = len(paths)

    # ── 3. 저장: txt 목록 ────────────────────────────────────────────────────────
    OUT.mkdir(parents=True, exist_ok=True)
    for name, paths in lists.items():
        (OUT / f"{name}.txt").write_text("\n".join(paths) + "\n", encoding="utf-8")

    # ── 4. 저장: yaml 두 개 (train 줄만 다름) ────────────────────────────────────
    names = "\n".join(f"  {i}: {c}" for i, c in enumerate(CLASSES))
    for yaml_name, train in [("data", "train.txt"), ("data_aihub", "train_aihub.txt")]:
        (OUT / f"{yaml_name}.yaml").write_text(
            "# build_compose.py 가 만든 파일. 직접 고치지 말고 스크립트를 다시 실행하세요.\n"
            f"path: {root}/compose\n"
            f"train: {train}\n"
            "val: val.txt\n"
            "test: test.txt\n"
            f"names:\n{names}\n", encoding="utf-8")

    # ── 5. 저장: README (데이터셋별 이미지 수 표) ─────────────────────────────────
    rows = []
    for prefix in others:
        rows.append(f"| {prefix} | " + " | ".join(f"{counts[(prefix, s)]:,}" for s in SPLITS) + " |")
    rows.append("| **합계** | " + " | ".join(f"**{len(lists[s]):,}**" for s in SPLITS) + " |")
    aihub_n = len(lists["train_aihub"])
    readme = f"""# compose

`python scripts/build_compose.py` 가 만든 폴더입니다. **이미지는 복사하지 않습니다.** 원래 `data/<이름>_yolo/` 의 이미지를 경로 목록으로 가리킵니다.

규칙: 각 데이터셋의 원래 train / val / test 를 그대로 합칩니다. AIHub 는 기본에서 빼고 `train_aihub.txt` 에 따로 둡니다.

## 기본 (AIHub 제외)

| 데이터셋 | train.txt | val.txt | test.txt |
| --- | ---: | ---: | ---: |
{chr(10).join(rows)}

## AIHub

`train_aihub.txt`: {aihub_n:,}장 (원래 train {counts[(AIHUB, 'aihub_train')]:,} + val {counts[(AIHUB, 'aihub_val')]:,}). 평가(val, test)에는 넣지 않습니다.

## 사용법

```bash
# 기본 학습
yolo detect train model=yolo11n.pt data=compose/data.yaml imgsz=640

# AIHub 로 먼저 학습 → 그 가중치로 기본 데이터 학습
yolo detect train model=yolo11n.pt data=compose/data_aihub.yaml imgsz=640
yolo detect train model=runs/detect/<위 결과>/weights/best.pt data=compose/data.yaml imgsz=640
```

두 yaml 은 `train` 줄만 다르고 val, test 는 같습니다. 그래서 결과를 그대로 비교할 수 있습니다.

목록 경로 기준: `{root}`. 다른 컴퓨터에서 학습하려면 거기서 `--root` 를 주고 다시 실행하세요.
"""
    (OUT / "README.md").write_text(readme, encoding="utf-8")

    for name, paths in lists.items():
        print(f"{name}.txt: {len(paths):,}장")


if __name__ == "__main__":
    main()
