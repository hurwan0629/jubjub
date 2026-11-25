"""data/ 의 데이터셋 숫자를 표로 정리한다.

읽는 것: data/<이름>_coco/annotations/<split>.json
만드는 것:
  reports/tables.md            사람이 읽는 표 (한글)
  reports/tables/*.csv         같은 숫자를 CSV 로 (엑셀, pandas 용)

실행: data/ 에서  python scripts/make_tables.py

큰 흐름
  1) 데이터셋마다 COCO 를 읽어 숫자를 모은다 (_common.dataset_stats)
  2) 표 6개를 차례로 만든다. 표마다 "행 만들기 → 마크다운 표 → CSV 저장" 을 반복
  3) 마크다운 표를 모두 이어 붙여 reports/tables.md 로 저장
"""
import csv
from collections import Counter

from _common import (CLASSES, CLASS_KO, DATASETS, REPORTS, SIZE_BINS, SPLIT_KO, SPLITS,
                     TRAIN_SIZE, dataset_stats, total)


# ── 숫자를 글자로 바꾸는 작은 도우미 ──────────────────────────────────────────────
def fmt(n):
    # 12345 → "12,345" (천 단위 쉼표)
    return f"{n:,}"


def pct(part, whole):
    # 비율을 "12.3%" 로. 분모가 0 이면 나눗셈 오류 대신 "–"
    return f"{part / whole * 100:.1f}%" if whole else "–"


# ── 마크다운 표와 CSV 저장 ──────────────────────────────────────────────────────
def md_table(header, rows, right_from=1):
    """마크다운 표. right_from 번째 열부터 오른쪽 정렬(숫자)."""
    # 둘째 줄의 "---" 는 왼쪽 정렬, "---:" 는 오른쪽 정렬. 숫자 열은 오른쪽 정렬이 읽기 쉽다.
    align = ["---" if i < right_from else "---:" for i in range(len(header))]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(align) + " |"]
    # 행마다 "| 값 | 값 | ... |"
    lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def write_csv(name, header, rows):
    # reports/tables/<name>.csv. 폴더가 없으면 만든다.
    path = REPORTS / "tables" / f"{name}.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:   # utf-8-sig: 엑셀에서 한글이 안 깨짐
        csv.writer(f).writerows([header, *rows])                  # 첫 줄 머리글, 그 아래 행들


def main():
    # ── 준비: 모든 데이터셋의 숫자를 한 번에 모아 둔다 ──────────────────────────
    # stats["taco"]["train"]["class_boxes"] → [general, plastic, can, glass] 박스 수
    stats = {prefix: dataset_stats(prefix) for prefix, _ in DATASETS}
    names = dict(DATASETS)                    # "taco" → "TACO" (표시 이름)
    ko = [CLASS_KO[c] for c in CLASSES]       # 표 머리글용 ["일반", "플라스틱", "캔", "유리"]
    # out 에 마크다운 줄을 계속 쌓아 두었다가 마지막에 한 파일로 저장한다
    out = ["# 데이터셋 통계", "",
           "`python scripts/make_tables.py` 가 만든 파일입니다. 숫자는 `<이름>_coco/annotations/*.json` 기준입니다.",
           "박스 하나가 물체 하나입니다. 이미지 한 장에 박스가 여러 개 있을 수 있습니다.", ""]

    # ── 표 1. 데이터셋별 요약 ───────────────────────────────────────────────────
    # 데이터셋 한 줄: 분할별 이미지 수, 전체 이미지·박스 수, 이미지당 박스 수, 박스 없는 이미지 수
    header = ["데이터셋", "학습 / 검증 / 시험 이미지", "전체 이미지", "전체 박스", "이미지당 박스", "박스 없는 이미지"]
    rows, csv_rows = [], []                   # rows: 마크다운용(쉼표 넣은 글자), csv_rows: CSV용(숫자 그대로)
    for prefix, s in stats.items():
        # "1,200 / 150 / 150". AIHub 처럼 test 가 없으면 "없음"
        per_split = " / ".join(fmt(s[sp]["images"]) if sp in s else "없음" for sp in SPLITS)
        img, box = total(s, "images"), total(s, "boxes")          # 분할 합계
        rows.append([names[prefix], per_split, fmt(img), fmt(box), f"{box / img:.2f}", fmt(total(s, "empty"))])
        csv_rows.append([prefix] + [s[sp]["images"] if sp in s else 0 for sp in SPLITS]
                        + [img, box, round(box / img, 3), total(s, "empty")])
    # 맨 아래 합계 줄 (마크다운에서 **굵게**)
    all_img = sum(total(s, "images") for s in stats.values())
    all_box = sum(total(s, "boxes") for s in stats.values())
    rows.append(["**합계**", "", f"**{fmt(all_img)}**", f"**{fmt(all_box)}**", "", ""])
    # 앞의 두 열(이름, "1,200 / 150 / 150")은 왼쪽 정렬, 나머지는 오른쪽 정렬
    out += ["## 1. 데이터셋별 요약", "", md_table(header, rows, right_from=2), ""]
    write_csv("01_summary", ["dataset", "train_images", "val_images", "test_images",
                             "images", "boxes", "boxes_per_image", "empty_images"], csv_rows)

    # ── 표 2. 클래스별 박스 수와 비율 ────────────────────────────────────────────
    # 같은 숫자로 표 두 개를 만든다: 박스 수(rows), 데이터셋 안 비율(ratio_rows)
    header = ["데이터셋"] + ko + ["합계"]
    rows, ratio_rows, csv_rows = [], [], []
    sums = [0] * len(CLASSES)                 # 전체 데이터셋 합계를 클래스별로 누적
    for prefix, s in stats.items():
        cb = total(s, "class_boxes")          # 이 데이터셋의 [general, plastic, can, glass]
        sums = [a + b for a, b in zip(sums, cb)]
        rows.append([names[prefix]] + [fmt(v) for v in cb] + [fmt(sum(cb))])
        ratio_rows.append([names[prefix]] + [pct(v, sum(cb)) for v in cb] + ["100%"])
        csv_rows.append([prefix] + cb)
    rows.append(["**합계**"] + [f"**{fmt(v)}**" for v in sums] + [f"**{fmt(sum(sums))}**"])
    ratio_rows.append(["**합계**"] + [f"**{pct(v, sum(sums))}**" for v in sums] + ["100%"])
    # AIHub 가 박스의 80% 를 차지해서 합계가 AIHub 비율로 끌려간다. AIHub 를 뺀 합계를 따로 보여준다.
    no_aihub = [a - b for a, b in zip(sums, total(stats["aihub_living"], "class_boxes"))]
    rows.append(["합계 (AIHub 제외)"] + [fmt(v) for v in no_aihub] + [fmt(sum(no_aihub))])
    ratio_rows.append(["합계 (AIHub 제외)"] + [pct(v, sum(no_aihub)) for v in no_aihub] + ["100%"])
    out += ["## 2. 클래스별 박스 수", "", "전체 분할을 합친 숫자입니다.", "",
            md_table(header, rows), "", "### 비율", "", "데이터셋 안에서 각 클래스가 차지하는 비율입니다.", "",
            md_table(header, ratio_rows), ""]
    write_csv("02_class_boxes", ["dataset"] + CLASSES, csv_rows)

    # ── 표 3. 분할별 클래스 박스 수 ──────────────────────────────────────────────
    # 데이터셋 × 분할마다 한 줄. val/test 에 클래스가 충분한지 보는 표
    header = ["데이터셋", "분할", "이미지"] + ko
    rows, csv_rows = [], []
    for prefix, s in stats.items():
        for sp in SPLITS:
            if sp not in s:                   # 없는 분할(AIHub test)은 건너뜀
                continue
            rows.append([names[prefix], SPLIT_KO[sp], fmt(s[sp]["images"])] + [fmt(v) for v in s[sp]["class_boxes"]])
            csv_rows.append([prefix, sp, s[sp]["images"]] + s[sp]["class_boxes"])
    out += ["## 3. 분할별 클래스 박스 수", "", md_table(header, rows, right_from=2), ""]
    write_csv("03_split_class_boxes", ["dataset", "split", "images"] + CLASSES, csv_rows)

    # ── 표 4. 클래스가 들어 있는 이미지 수 ───────────────────────────────────────
    # 박스 수가 아니라 이미지 수. 한 장에 캔이 10개 있어도 1장으로 센다.
    header = ["데이터셋"] + ko
    rows, csv_rows = [], []
    for prefix, s in stats.items():
        ci = total(s, "class_images")         # 클래스별 "그 클래스가 있는 이미지 수"
        img = total(s, "images")
        rows.append([names[prefix]] + [f"{fmt(v)} ({pct(v, img)})" for v in ci])   # "966 (64.4%)"
        csv_rows.append([prefix] + ci)
    out += ["## 4. 클래스가 들어 있는 이미지 수", "",
            "그 클래스 박스가 하나라도 있는 이미지 수와, 전체 이미지 중 비율입니다. "
            "박스 수가 많아도 몇 장에 몰려 있으면 이 숫자는 작습니다.", "", md_table(header, rows), ""]
    write_csv("04_class_images", ["dataset"] + CLASSES, csv_rows)

    # ── 표 5. 박스 크기 ──────────────────────────────────────────────────────────
    # 데이터셋 × 클래스마다 한 줄, 크기 구간(<8, 8-16, ...)별 박스 수
    bins = [b[2] for b in SIZE_BINS]          # 구간 이름만 뽑음 ["<8", "8-16", ...]
    header = ["데이터셋", "클래스"] + [f"{b}px" for b in bins]
    rows, csv_rows = [], []
    for prefix, s in stats.items():
        for c, name in enumerate(CLASSES):
            # 구간 i 마다 모든 분할의 박스 수를 더함
            counts = [sum(s[sp]["size_bins"][c][i] for sp in s) for i in range(len(SIZE_BINS))]
            if sum(counts) == 0:              # 박스가 하나도 없는 클래스(예: CLICK glass)는 줄을 만들지 않음
                continue
            rows.append([names[prefix], CLASS_KO[name]] + [fmt(v) for v in counts])
            csv_rows.append([prefix, name] + counts)
    out += ["## 5. 박스 크기", "",
            f"이미지 긴 변을 {TRAIN_SIZE}으로 줄였을 때(학습 입력 크기) 박스 넓이의 제곱근, 즉 정사각형으로 본 한 변의 길이입니다. "
            "16px 미만은 YOLO 가 찾기 어려운 크기입니다.", "", md_table(header, rows, right_from=2), ""]
    write_csv("05_box_sizes", ["dataset", "class"] + bins, csv_rows)

    # ── 표 6. 이미지 해상도 ──────────────────────────────────────────────────────
    # 사진 크기가 제각각인지, 많이 쓰인 해상도 3개는 무엇인지
    header = ["데이터셋", "서로 다른 해상도 수", "많은 순 (가로×세로: 장수)"]
    rows = []
    for prefix, s in stats.items():
        # 분할별 Counter 를 더해 하나로 합침 (Counter 끼리는 + 로 개수가 더해진다)
        res = sum((s[sp]["resolutions"] for sp in s), start=Counter())
        # most_common(3): 가장 많은 3개 → "640×481: 112,368, ..."
        top = ", ".join(f"{w}×{h}: {fmt(n)}" for (w, h), n in res.most_common(3))
        rows.append([names[prefix], fmt(len(res)), top])
    out += ["## 6. 이미지 해상도", "", md_table(header, rows, right_from=1), ""]

    # ── 저장: 쌓아 둔 마크다운 줄을 한 파일로 ─────────────────────────────────────
    path = REPORTS / "tables.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out), encoding="utf-8")
    print(f"저장: {path}")
    print(f"저장: {REPORTS / 'tables'}/*.csv")


if __name__ == "__main__":
    main()
