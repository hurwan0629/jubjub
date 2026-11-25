"""data/ 의 데이터셋 분포를 그림으로 그린다.

읽는 것: data/<이름>_coco/annotations/<split>.json
만드는 것 (reports/figures/):
  01_class_by_split.png   데이터셋마다 axes 하나. 분할별 클래스 박스 수
  02_class_ratio.png      데이터셋별 클래스 비율 (100% 막대)
  03_box_size.png         데이터셋별 박스 크기 구간 비율 (100% 막대)

실행: data/ 에서  python scripts/make_dist_plots.py

큰 흐름
  1) 데이터셋마다 COCO 를 읽어 숫자를 모은다 (make_tables.py 와 같은 _common.dataset_stats)
  2) 그림 1: plot_class_by_split  — 데이터셋마다 작은 그래프(axes) 하나
  3) 그림 2, 3: plot_ratio         — 같은 함수에 다른 숫자를 넣어 100% 가로 막대 두 장
  4) png 로 저장
"""
import matplotlib.pyplot as plt

from _common import (CLASSES, COLORS, DATASETS, REPORTS, SIZE_BINS, SPLIT_KO, SPLITS,
                     TRAIN_SIZE, class_label, dataset_stats, setup_korean_font, total)

OUT = REPORTS / "figures"                     # 그림을 저장할 폴더


# ── 그림 1: 데이터셋마다 axes 하나 ───────────────────────────────────────────────
def plot_class_by_split(stats, names):
    """데이터셋마다 axes 하나. 세로축 크기는 데이터셋마다 다르다(숫자 차이가 커서)."""
    # 격자 크기 정하기: 한 줄에 4칸, 줄 수는 데이터셋 수에 맞춰 올림 (7개 → 2줄)
    n = len(stats)
    cols = 4
    rows = (n + cols - 1) // cols             # 올림 나눗셈: (7 + 3) // 4 = 2
    # fig = 그림 전체(종이), axes = 그 안의 작은 그래프들 (2×4 배열)
    fig, axes = plt.subplots(rows, cols, figsize=(5 * cols, 4.2 * rows))
    width = 0.2                               # 막대 하나의 너비. 클래스 4개 × 0.2 = 분할 하나에 0.8 차지

    # axes.flat: 2×4 격자를 한 줄로 펴서 순서대로 꺼냄. 데이터셋과 짝지어 한 칸씩 채운다
    for ax, (prefix, s) in zip(axes.flat, stats.items()):
        splits = [sp for sp in SPLITS if sp in s]           # 이 데이터셋에 있는 분할만 (AIHub 는 train, val)

        # 클래스마다 막대 묶음을 그린다. x 위치를 클래스별로 조금씩 옮겨 옆으로 나란히 세운다
        for c, (name, color) in enumerate(zip(CLASSES, COLORS)):
            # 분할 i 의 중심에서 (c - 1.5) * width 만큼 이동: c=0 → -0.3, 1 → -0.1, 2 → +0.1, 3 → +0.3
            xs = [i + (c - 1.5) * width for i in range(len(splits))]
            bars = ax.bar(xs, [s[sp]["class_boxes"][c] for sp in splits], width, color=color,
                          label=class_label(name))
            # 막대 위에 숫자 표시. 0 이면 빈칸
            ax.bar_label(bars, labels=[f"{v:,}" if v else "" for v in bars.datavalues],
                         padding=2, fontsize=7, rotation=90)

        # x축 눈금: "학습\n(1,200장)" 처럼 분할 이름과 이미지 수
        ax.set_xticks(range(len(splits)), [f"{SPLIT_KO[sp]}\n({s[sp]['images']:,}장)" for sp in splits])
        # y축 위쪽 여유: 가장 큰 막대의 1.3배 (막대 위 숫자가 잘리지 않게)
        top = max(max(s[sp]["class_boxes"]) for sp in splits)
        ax.set_ylim(0, top * 1.3 if top else 1)
        ax.set_title(f"{names[prefix]}  (이미지 {total(s, 'images'):,} · 박스 {total(s, 'boxes'):,})", fontsize=11)
        ax.set_ylabel("박스 수")
        ax.spines[["top", "right"]].set_visible(False)      # 위·오른쪽 테두리 선 지우기

    # 남는 칸은 범례 자리로 쓴다 (7개면 8번째 칸이 빔)
    for ax in list(axes.flat)[n:]:
        ax.axis("off")                        # 축, 눈금, 테두리를 모두 숨김
    # 첫 그래프에서 범례 항목(색 견본, 이름)을 가져와 빈 칸에 크게 그린다
    handles, labels = axes.flat[0].get_legend_handles_labels()
    legend_ax = list(axes.flat)[n] if n < rows * cols else axes.flat[-1]
    legend_ax.legend(handles, labels, loc="center", fontsize=12, frameon=False, title="클래스")
    fig.suptitle("분할별 클래스 박스 수 (세로축 범위는 데이터셋마다 다름)", fontsize=14)   # 그림 전체 제목
    fig.tight_layout()                        # 제목·눈금이 겹치지 않게 간격 자동 조정
    return fig


# ── 그림 2, 3 에서 쓰는 도우미 ───────────────────────────────────────────────────
def text_color(hex_color):
    """막대 색이 밝으면 검은 글씨, 어두우면 흰 글씨."""
    # "#fddbc7" → r=0xfd, g=0xdb, b=0xc7 (16진수 두 자리씩)
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    # 사람 눈이 느끼는 밝기 공식 (초록을 가장 밝게 느낀다). 160 보다 밝으면 검은 글씨
    return "black" if 0.299 * r + 0.587 * g + 0.114 * b > 160 else "white"


# ── 그림 2, 3: 100% 가로 막대 ────────────────────────────────────────────────────
def plot_ratio(rows_data, legend_names, colors, title, xlabel):
    """rows_data: [(라벨, [값...])]. 각 행을 100% 로 맞춘 가로 막대."""
    # 행(데이터셋) 수에 맞춰 그림 높이를 정한다
    fig, ax = plt.subplots(figsize=(11, 0.55 * len(rows_data) + 1.8))
    labels = [r[0] for r in rows_data]
    ys = range(len(rows_data))[::-1]          # 첫 데이터셋이 맨 위에 오도록 y 위치를 거꾸로
    left = [0.0] * len(rows_data)             # 행마다 "지금까지 쌓은 막대의 오른쪽 끝" (%)

    # 항목(클래스 또는 크기 구간) 하나씩, 모든 행에 대해 이어 붙인다 → 누적 막대
    for k, (name, color) in enumerate(zip(legend_names, colors)):
        # 행마다 이 항목이 차지하는 비율(%)
        widths = []
        for _, values in rows_data:
            s = sum(values)
            widths.append(values[k] / s * 100 if s else 0)
        # left 에서 시작해 widths 만큼 그린다
        ax.barh(list(ys), widths, left=left, color=color, label=name, edgecolor="white", linewidth=0.5)
        # 6% 이상인 칸에만 가운데에 숫자 표시 (좁은 칸은 글자가 넘쳐서)
        for y, l, w in zip(ys, left, widths):
            if w >= 6:
                ax.text(l + w / 2, y, f"{w:.0f}%", ha="center", va="center", fontsize=8,
                        color=text_color(color))
        left = [l + w for l, w in zip(left, widths)]       # 다음 항목은 여기서부터 이어서

    ax.set_yticks(list(ys), labels)           # y축에 데이터셋 이름
    ax.set_xlim(0, 100)
    ax.set_xlabel(xlabel)
    ax.set_title(title, fontsize=13)
    # 범례를 그래프 아래 가운데에 한 줄로. 행 수가 적을수록 조금 더 아래로
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.12 - 0.3 / len(rows_data)),
              ncol=len(legend_names), frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    return fig


def main():
    # ── 준비 ─────────────────────────────────────────────────────────────────────
    setup_korean_font()
    OUT.mkdir(parents=True, exist_ok=True)
    names = dict(DATASETS)                    # "taco" → "TACO"
    stats = {prefix: dataset_stats(prefix) for prefix, _ in DATASETS}

    # ── 그림 1 ───────────────────────────────────────────────────────────────────
    fig = plot_class_by_split(stats, names)
    fig.savefig(OUT / "01_class_by_split.png", dpi=130)    # dpi: 해상도
    plt.close(fig)                            # 메모리에서 그림 닫기 (여러 장 그릴 때 쌓이지 않게)

    # ── 그림 2: 클래스 비율 ──────────────────────────────────────────────────────
    # 행 = (라벨, [general, plastic, can, glass 박스 수])
    rows = [(f"{names[p]} ({total(s, 'boxes'):,})", total(s, "class_boxes")) for p, s in stats.items()]
    # 마지막 행: AIHub 를 뺀 나머지 데이터셋을 클래스별로 합친 것
    no_aihub = [sum(col) for col in zip(*(total(s, "class_boxes") for p, s in stats.items() if p != "aihub_living"))]
    rows.append((f"합계, AIHub 제외 ({sum(no_aihub):,})", no_aihub))
    fig = plot_ratio(rows, [class_label(c) for c in CLASSES], COLORS,
                     "데이터셋별 클래스 비율 (괄호는 박스 수)", "박스 비율 (%)")
    fig.savefig(OUT / "02_class_ratio.png", dpi=130)
    plt.close(fig)

    # ── 그림 3: 박스 크기 구간 비율 ──────────────────────────────────────────────
    # 행 = (데이터셋, [<8, 8-16, 16-32, 32-96, ≥96 박스 수]). 클래스와 분할을 모두 합친 값
    rows = []
    for p, s in stats.items():
        counts = [sum(s[sp]["size_bins"][c][i] for sp in s for c in range(len(CLASSES)))
                  for i in range(len(SIZE_BINS))]
        rows.append((names[p], counts))
    size_colors = ["#b2182b", "#ef8a62", "#fddbc7", "#67a9cf", "#2166ac"]   # 작을수록 빨강
    fig = plot_ratio(rows, [f"{b[2]}px" for b in SIZE_BINS], size_colors,
                     f"박스 크기 구간 비율 (긴 변 {TRAIN_SIZE}px 기준, 박스 넓이의 제곱근)", "박스 비율 (%)")
    fig.savefig(OUT / "03_box_size.png", dpi=130)
    plt.close(fig)

    for f in sorted(OUT.glob("*.png")):
        print(f"저장: {f}")


if __name__ == "__main__":
    main()
