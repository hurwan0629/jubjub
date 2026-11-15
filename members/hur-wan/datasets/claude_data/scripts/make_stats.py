"""claude_data 데이터셋의 통계를 stats/ 에 저장한다. 숫자는 모두 <이름>_coco/annotations/*.json 에서 센다.

실행: python scripts/make_stats.py

  stats/summary.csv     데이터셋·분할별 이미지 수, 박스 수, 클래스별 박스 수, 박스가 없는 이미지 수
  stats/box_sizes.csv   데이터셋·클래스별 박스 크기 분포 (긴 변을 640 으로 줄였을 때의 픽셀 크기)
  stats/stats.json      위 두 표 + 이미지 크기 분포, 이미지당 박스 수
  stats/tables.md       README 에 넣는 표 (루트 data/README.md 와 같은 모양)
"""
import csv
import json
import math
import statistics
from collections import Counter

from common import NAMES, ROOT, SPLITS

STATS = ROOT / "stats"
IMGSZ = 640
BINS = [(0, 8), (8, 16), (16, 32), (32, 96), (96, 10 ** 9)]      # 학습 크기(640)에서 박스 한 변의 픽셀
BIN_NAMES = ["<8px", "8-16px", "16-32px", "32-96px", ">=96px"]


def main():
    STATS.mkdir(exist_ok=True)
    summary, sizes, detail = [], [], {}
    for yolo in sorted(ROOT.glob("*_yolo")):
        prefix = yolo.name[:-5]
        info = {"splits": {}, "image_sizes": Counter(), "boxes_per_image": [], "source": None}
        size_bins = {name: Counter() for name in NAMES}
        for split in SPLITS:
            path = ROOT / f"{prefix}_coco" / "annotations" / f"{split}.json"
            if not path.exists():
                continue
            coco = json.loads(path.read_text(encoding="utf-8"))
            info["source"] = {k: coco["info"].get(k) for k in ("source", "url", "license")}
            images = {im["id"]: im for im in coco["images"]}
            per_image = Counter(a["image_id"] for a in coco["annotations"])
            per_class = Counter(NAMES[a["category_id"]] for a in coco["annotations"])
            empty = sum(1 for image_id in images if per_image[image_id] == 0)
            summary.append([prefix, split, len(images), len(coco["annotations"]), *[per_class[n] for n in NAMES], empty])
            info["splits"][split] = {"images": len(images), "boxes": len(coco["annotations"]),
                                     "classes": {n: per_class[n] for n in NAMES}, "empty_images": empty}
            info["boxes_per_image"] += [per_image[image_id] for image_id in images]
            for im in images.values():
                info["image_sizes"][f'{im["width"]}x{im["height"]}'] += 1
            for ann in coco["annotations"]:
                im = images[ann["image_id"]]
                scale = IMGSZ / max(im["width"], im["height"])           # 긴 변을 640 으로 줄이는 비율
                side = math.sqrt(ann["bbox"][2] * ann["bbox"][3]) * scale  # 박스 넓이의 제곱근 = 대표 한 변
                for (low, high), name in zip(BINS, BIN_NAMES):
                    if low <= side < high:
                        size_bins[NAMES[ann["category_id"]]][name] += 1
        for name in NAMES:
            sizes.append([prefix, name, *[size_bins[name][b] for b in BIN_NAMES]])
        boxes = info["boxes_per_image"]
        detail[prefix] = {
            "source": info["source"],
            "splits": info["splits"],
            "image_sizes": dict(info["image_sizes"].most_common(8)),
            "boxes_per_image": {"mean": round(statistics.mean(boxes), 2), "median": statistics.median(boxes), "max": max(boxes)},
            "box_side_at_640": {name: dict(size_bins[name]) for name in NAMES},
        }

    with open(STATS / "summary.csv", "w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["dataset", "split", "images", "boxes", *NAMES, "empty_images"])
        writer.writerows(summary)
    with open(STATS / "box_sizes.csv", "w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["dataset", "class", *BIN_NAMES])
        writer.writerows(sizes)
    (STATS / "stats.json").write_text(json.dumps(detail, ensure_ascii=False, indent=2), encoding="utf-8")

    # README 용 표 (data/README.md 와 같은 열)
    lines = ["| 데이터셋 | train / val / test 이미지 |", "| --- | ---: |"]
    for prefix, d in detail.items():
        lines.append(f"| {prefix} | " + " / ".join(f'{d["splits"][s]["images"]:,}' if s in d["splits"] else "없음" for s in SPLITS) + " |")
    lines += ["", "| 데이터셋 | 전체 이미지 | general | plastic | can | glass |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
    total = Counter()
    for prefix, d in detail.items():
        row = Counter({"images": sum(s["images"] for s in d["splits"].values())})
        for s in d["splits"].values():
            row.update(s["classes"])
        total.update(row)
        lines.append(f"| {prefix} | {row['images']:,} | " + " | ".join(f"{row[n]:,}" for n in NAMES) + " |")
    lines.append(f"| 총합 | {total['images']:,} | " + " | ".join(f"{total[n]:,}" for n in NAMES) + " |")
    lines += ["", f"박스 크기 (긴 변을 {IMGSZ} 으로 줄였을 때 박스 한 변의 픽셀, 전체 분할 합계)", "",
              "| 데이터셋 | 클래스 | " + " | ".join(BIN_NAMES) + " |", "| --- | --- | " + " | ".join("---:" for _ in BIN_NAMES) + " |"]
    lines += [f"| {row[0]} | {row[1]} | " + " | ".join(f"{v:,}" for v in row[2:]) + " |" for row in sizes]
    (STATS / "tables.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
