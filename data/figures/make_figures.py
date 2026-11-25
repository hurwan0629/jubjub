"""data/ 의 4개 데이터셋에 대한 발표용 그림을 만든다.

출력 (data/figures/):
  01~04_dist_<name>.png    분할별 클래스 분포 (박스 수)
  05~08_sample_<name>.png  데이터셋별 샘플 이미지 1장 (라벨 박스 표시)
  class_counts_table.png   4개 데이터셋 클래스 개수 표
  all_in_one.png           한글 클래스 표 + 위 8장을 한 장으로 합친 그림

박스 수는 *_coco/annotations/*.json, 이미지는 *_yolo/images/<split>/ 기준.
"""
import json
import random
from pathlib import Path

import matplotlib.pyplot as plt
from PIL import Image

DATA = Path(__file__).resolve().parent.parent
OUT = Path(__file__).resolve().parent
NAMES = ["general", "plastic", "can", "glass"]
COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728"]  # 기존 차트와 같은 tab10 색
SPLITS = ["train", "val", "test"]
DATASETS = [  # (폴더 prefix, 표시 이름)
    ("aihub_living", "AIHub Living Waste"),
    ("taco", "TACO"),
    ("drinking_waste", "Drinking Waste"),
    ("plastopol", "PlastOPol"),
]

plt.rcParams["font.family"] = ["Segoe UI", "Malgun Gothic", "DejaVu Sans"]


def load(prefix):
    """split -> (images dict, annotations list)"""
    out = {}
    for split in SPLITS:
        path = DATA / f"{prefix}_coco" / "annotations" / f"{split}.json"
        if path.exists():
            d = json.loads(path.read_text(encoding="utf-8"))
            out[split] = ({im["id"]: im for im in d["images"]}, d["annotations"])
    return out


def class_counts(splits):
    return {s: [sum(a["category_id"] == c for a in anns) for c in range(len(NAMES))]
            for s, (_, anns) in splits.items()}


def plot_distribution(counts, title, path):
    splits = list(counts)
    fig, ax = plt.subplots(figsize=(14, 5.6))
    width = 0.2
    for c, (name, color) in enumerate(zip(NAMES, COLORS)):
        xs = [i + (c - 1.5) * width for i in range(len(splits))]
        bars = ax.bar(xs, [counts[s][c] for s in splits], width, label=name, color=color)
        ax.bar_label(bars, labels=[f"{v:,}" for v in bars.datavalues], padding=3, fontsize=10)
    ax.set_xticks(range(len(splits)), splits, fontsize=11)
    ax.set_ylabel("Objects (label boxes)", fontsize=11)
    ax.set_title(f"Class distribution by split — {title}", fontsize=13)
    ax.set_ylim(0, max(max(v) for v in counts.values()) * 1.18)
    ax.ticklabel_format(axis="y", style="plain")
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    ax.legend(loc="upper right", fontsize=11)
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)


def pick_sample(prefix, splits, seed=0):
    """train 에서 클래스가 가장 다양하고 박스가 너무 많지 않은 이미지 하나."""
    images, anns = splits["train"]
    by_img = {}
    for a in anns:
        by_img.setdefault(a["image_id"], []).append(a)
    cands = [(len({a["category_id"] for a in v}), k) for k, v in by_img.items() if len(v) <= 8]
    best = max(n for n, _ in cands)
    pool = sorted(k for n, k in cands if n == best)
    rng = random.Random(seed)
    for img_id in rng.sample(pool, len(pool)):
        im = images[img_id]
        file = DATA / f"{prefix}_yolo" / "images" / "train" / im["file_name"]
        if file.exists():
            return file, im, by_img[img_id]
    raise FileNotFoundError(prefix)


def plot_sample(file, im, anns, title, path):
    img = Image.open(file).convert("RGB")
    sx, sy = img.width / im["width"], img.height / im["height"]  # EXIF 회전 등 크기 차이 보정
    scale = 900 / img.height  # 샘플 4장의 높이를 맞춰 제목·라벨 크기가 같게 보이도록
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    sx, sy = sx * scale, sy * scale

    fig, ax = plt.subplots(figsize=(img.width / 100, img.height / 100 + 0.6), dpi=100)
    ax.imshow(img)
    for a in anns:
        x, y, w, h = a["bbox"]
        color = COLORS[a["category_id"]]
        ax.add_patch(plt.Rectangle((x * sx, y * sy), w * sx, h * sy, fill=False, color=color, lw=3))
        ax.text(x * sx, y * sy, NAMES[a["category_id"]], color="white", fontsize=12, va="bottom",
                bbox=dict(facecolor=color, edgecolor="none", pad=2))
    ax.set_title(f"Sample — {title}  ({file.name})", fontsize=13)
    ax.axis("off")
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)


KO = {"names": ["일반", "플라스틱", "캔", "유리"], "AIHub Living Waste": "AIHub 생활폐기물"}


def plot_table(rows, path, ko=False, dpi=100):
    if ko:
        header = ["데이터셋", "이미지 수", *KO["names"], "전체 박스"]
        rest = [r for r in rows if r[0] != "AIHub Living Waste"]
        rows = [(KO.get(name, name), n, cnt) for name, n, cnt in rows]
        rows.append(("합계 (AIHub 제외)", sum(n for _, n, _ in rest),
                     [sum(cnt[c] for _, _, cnt in rest) for c in range(len(NAMES))]))
        title = "데이터셋별 클래스 개수 (라벨 박스 수, 전체 분할 합계)"
    else:
        header = ["Dataset", "Images", *NAMES, "Total boxes"]
        title = "Class counts per dataset (label boxes, all splits)"
    cells = [[name, f"{n_img:,}", *[f"{v:,}" for v in cnt], f"{sum(cnt):,}"] for name, n_img, cnt in rows]
    width, font = (28, 16) if ko else (13, 12)
    fig, ax = plt.subplots(figsize=(width, 0.5 * (len(cells) + 1) + 0.7))
    ax.axis("off")
    ax.set_title(title, fontsize=font + 3)
    t = ax.table(cellText=cells, colLabels=header, loc="center", cellLoc="right", colLoc="center",
                 colWidths=[0.22] + [0.13] * (len(header) - 1))
    t.auto_set_font_size(False)
    t.set_fontsize(font)
    t.scale(1, 2.8 if ko else 2.0)
    for (r, c), cell in t.get_celld().items():
        cell.set_edgecolor("#cccccc")
        if r == 0:
            cell.set_text_props(weight="bold", color="white")
            cell.set_facecolor(COLORS[c - 2] if 2 <= c < 2 + len(NAMES) else "#444444")
        elif c == 0:
            cell.set_text_props(ha="left", weight="bold")
            cell._loc = "left"
        if r > 0 and r % 2 == 0:
            cell.set_facecolor("#f4f4f4")
        if ko:
            cell.get_text().set_fontfamily("Malgun Gothic")
            if r == len(cells):
                cell.set_text_props(weight="bold")
                cell.set_facecolor("#e8eef5")
    if ko:
        ax.title.set_fontfamily("Malgun Gothic")
    fig.tight_layout()
    fig.savefig(path, dpi=dpi, bbox_inches="tight" if ko else None, pad_inches=0.15)
    plt.close(fig)


def combine(table_path, path, width=2800, gap=40):
    """표(맨 위) + 분포 4장(2x2) + 샘플 4장(가로 한 줄)을 한 장으로 합친다."""
    def fit_width(im, w):
        return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

    table = fit_width(Image.open(table_path).convert("RGB"), width)
    dists = [Image.open(p).convert("RGB") for p in sorted(OUT.glob("0[1-4]_dist_*.png"))]
    samples = [Image.open(p).convert("RGB") for p in sorted(OUT.glob("0[5-8]_sample_*.png"))]
    cell_w = (width - gap) // 2
    dists = [fit_width(im, cell_w) for im in dists]
    # 샘플은 높이를 맞춘 뒤 가로 합이 width 가 되도록 공통 높이를 정한다.
    ratios = [im.width / im.height for im in samples]
    h = round((width - gap * (len(samples) - 1)) / sum(ratios))
    samples = [im.resize((round(h * r), h), Image.LANCZOS) for im, r in zip(samples, ratios)]

    dist_h = dists[0].height
    canvas = Image.new("RGB", (width + 2 * gap, table.height + 2 * dist_h + h + 5 * gap), "white")
    y = gap
    canvas.paste(table, (gap, y))
    y += table.height + gap
    for i, im in enumerate(dists):
        canvas.paste(im, (gap + (i % 2) * (cell_w + gap), y + (i // 2) * (dist_h + gap)))
    y += 2 * dist_h + 2 * gap
    x = gap
    for im in samples:
        canvas.paste(im, (x, y))
        x += im.width + gap
    canvas.save(path)


def main():
    rows = []
    for i, (prefix, title) in enumerate(DATASETS):
        splits = load(prefix)
        counts = class_counts(splits)
        print(title, counts)
        plot_distribution(counts, title, OUT / f"{i + 1:02d}_dist_{prefix}.png")
        file, im, anns = pick_sample(prefix, splits)
        plot_sample(file, im, anns, title, OUT / f"{i + 5:02d}_sample_{prefix}.png")
        n_img = sum(len(imgs) for imgs, _ in splits.values())
        rows.append((title, n_img, [sum(counts[s][c] for s in counts) for c in range(len(NAMES))]))
    plot_table(rows, OUT / "class_counts_table.png")
    plot_table(rows, OUT / "_class_counts_table_ko.png", ko=True)
    combine(OUT / "_class_counts_table_ko.png", OUT / "all_in_one.png")
    (OUT / "_class_counts_table_ko.png").unlink()


if __name__ == "__main__":
    main()
