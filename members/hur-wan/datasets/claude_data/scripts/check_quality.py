"""만들어진 <이름>_yolo / <이름>_coco 를 검사해서 reports/quality_report.md, reports/quality.json 을 쓴다.

실행: python scripts/check_quality.py            (claude_data 안의 모든 데이터셋)
      python scripts/check_quality.py click      (하나만)

검사 항목
 1. 짝: 이미지마다 라벨 파일이 있고, COCO 의 이미지 목록과도 같은가
 2. 이미지: 열리는가, COCO 에 적힌 크기와 같은가, EXIF 회전이 남아 있지 않은가, 파일이 중간에 잘리지 않았는가
 3. YOLO 라벨: 한 줄에 5칸, 클래스 0~3, 박스가 이미지 안에 있는가, 같은 줄이 두 번 있지 않은가,
    거의 같은 위치에 박스가 두 개 있지 않은가 (IoU 0.85 이상 = 한 물체를 두 번 그린 것)
 4. COCO 라벨: 박스가 이미지 안에 있는가, YOLO 라벨과 박스 수·클래스·좌표가 같은가
 5. 중복: 내용이 완전히 같은 파일, 그리고 작게 줄여 비교했을 때 거의 같은 사진.
    train 과 val/test 에 같은 사진이 있으면 평가 점수가 실제보다 높게 나온다.

문제가 하나라도 있으면 마지막에 "문제 있음"을 출력하고 종료 코드 1 로 끝난다 (5번의 "거의 같은 사진"은 참고용).
"""
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

from common import NAMES, REPORTS, ROOT, SAME_OBJECT, SPLITS, iou

HASH_SIZE = 16          # 사진을 17x16 흑백으로 줄여 256비트 지문을 만든다
NEAR = 10               # 지문이 10비트 이하로 다르면 "거의 같은 사진"으로 본다 (256비트 중 4%)
TOLERANCE = 1.0         # YOLO 와 COCO 좌표 차이 허용치 (픽셀)


def fingerprint(image):
    """dHash: 줄인 흑백 사진에서 옆 칸보다 밝은지를 0/1 로 적은 값. 비슷한 사진은 값이 비슷하다."""
    small = image.convert("L").resize((HASH_SIZE + 1, HASH_SIZE))
    pixels = list(small.tobytes())                     # 흑백이라 픽셀 하나가 1바이트
    bits = 0
    for row in range(HASH_SIZE):
        for col in range(HASH_SIZE):
            left = pixels[row * (HASH_SIZE + 1) + col]
            right = pixels[row * (HASH_SIZE + 1) + col + 1]
            bits = (bits << 1) | (left > right)
    return bits


def check(prefix):
    yolo = ROOT / f"{prefix}_yolo"
    coco_dir = ROOT / f"{prefix}_coco" / "annotations"
    problems = Counter()                 # 문제 종류 -> 건수
    examples = {}                        # 문제 종류 -> 첫 예시
    counts = Counter()
    hashes = []                          # (split, 파일 이름, sha256, 지문)

    def problem(kind, where):
        problems[kind] += 1
        examples.setdefault(kind, str(where))

    for split in SPLITS:
        image_dir, label_dir = yolo / "images" / split, yolo / "labels" / split
        if not image_dir.is_dir():
            continue
        images = {p.stem: p for p in image_dir.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")}
        labels = {p.stem: p for p in label_dir.glob("*.txt")}
        coco = json.loads((coco_dir / f"{split}.json").read_text(encoding="utf-8"))
        coco_images = {Path(im["file_name"]).stem: im for im in coco["images"]}
        coco_boxes = {}
        for ann in coco["annotations"]:
            coco_boxes.setdefault(ann["image_id"], []).append(ann)

        # 1. 짝
        for stem in images.keys() ^ labels.keys():
            problem("이미지와 라벨 파일의 짝이 안 맞음", f"{split}/{stem}")
        for stem in images.keys() ^ coco_images.keys():
            problem("YOLO 이미지와 COCO 이미지 목록이 다름", f"{split}/{stem}")
        if [c["name"] for c in coco["categories"]] != list(NAMES) or [c["id"] for c in coco["categories"]] != [0, 1, 2, 3]:
            problem("COCO categories 가 4클래스 순서와 다름", split)

        for stem in sorted(images.keys() & labels.keys() & coco_images.keys()):
            path, info = images[stem], coco_images[stem]
            counts["images"] += 1

            # 2. 이미지
            try:
                with Image.open(path) as image:
                    width, height = image.size
                    if image.getexif().get(0x0112, 1) != 1:
                        problem("EXIF 회전이 남아 있음", path.name)
                    image.draft("L", (256, 256))              # JPEG 는 작게 읽어서 빠르게
                    mark = fingerprint(image)
            except Exception as error:                        # 깨진 파일
                problem("이미지를 열 수 없음", f"{path.name}: {error}")
                continue
            if (width, height) != (info["width"], info["height"]):
                problem("COCO 에 적힌 크기와 실제 크기가 다름", path.name)
            content = path.read_bytes()
            if path.suffix.lower() in (".jpg", ".jpeg") and not content.rstrip(b"\x00").endswith(b"\xff\xd9"):
                problem("JPEG 끝 표시가 없음 (받다가 잘린 파일일 수 있음)", path.name)
            hashes.append((split, path.name, hashlib.sha256(content).hexdigest(), mark))

            # 3. YOLO 라벨
            rows = []
            lines = [line for line in labels[stem].read_text(encoding="utf-8").splitlines() if line.strip()]
            if len(set(lines)) != len(lines):
                problem("같은 라벨 줄이 두 번 있음", labels[stem].name)
            for line in lines:
                fields = line.split()
                if len(fields) != 5 or fields[0] not in ("0", "1", "2", "3"):
                    problem("YOLO 라벨 형식이 틀림", labels[stem].name)
                    continue
                cx, cy, w, h = map(float, fields[1:])
                if w <= 0 or h <= 0 or cx - w / 2 < -1e-6 or cy - h / 2 < -1e-6 or cx + w / 2 > 1 + 1e-6 or cy + h / 2 > 1 + 1e-6:
                    problem("YOLO 박스가 이미지 밖으로 나감", labels[stem].name)
                rows.append((int(fields[0]), (cx - w / 2) * width, (cy - h / 2) * height, w * width, h * height))
            for i in range(len(rows)):
                for j in range(i + 1, len(rows)):
                    if iou(rows[i][1:], rows[j][1:]) >= SAME_OBJECT:
                        problem("거의 같은 위치에 박스가 두 개", labels[stem].name)
            counts["boxes"] += len(rows)
            counts["empty_images"] += not rows
            for cls, *_ in rows:
                counts[NAMES[cls]] += 1

            # 4. COCO 라벨
            anns = coco_boxes.get(info["id"], [])
            for ann in anns:
                x, y, w, h = ann["bbox"]
                if w <= 0 or h <= 0 or x < -1e-6 or y < -1e-6 or x + w > width + 1e-6 or y + h > height + 1e-6:
                    problem("COCO 박스가 이미지 밖으로 나감", path.name)
            same = len(anns) == len(rows) and all(
                ann["category_id"] == cls and max(abs(a - b) for a, b in zip(ann["bbox"], box)) <= TOLERANCE
                for ann, (cls, *box) in zip(anns, rows))
            if not same:
                problem("YOLO 와 COCO 의 박스가 다름", path.name)

    # 5. 중복
    by_content = {}
    for split, name, digest, _ in hashes:
        by_content.setdefault(digest, []).append(f"{split}/{name}")
    for group in by_content.values():
        if len(group) > 1:
            problem("내용이 완전히 같은 파일", " = ".join(group))
    near_same, near_cross = [], []
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            distance = (hashes[i][3] ^ hashes[j][3]).bit_count()
            if distance <= NEAR:
                pair = (distance, f"{hashes[i][0]}/{hashes[i][1]}", f"{hashes[j][0]}/{hashes[j][1]}")
                (near_same if hashes[i][0] == hashes[j][0] else near_cross).append(pair)

    return {
        "dataset": prefix,
        "counts": dict(counts),
        "problems": dict(problems),
        "problem_examples": examples,
        "near_duplicates_within_split": len(near_same),
        "near_duplicates_across_splits": len(near_cross),
        "near_duplicate_pairs_across_splits": sorted(near_cross)[:200],
        "near_duplicate_pairs_within_split": sorted(near_same)[:200],
    }


def main():
    prefixes = sys.argv[1:] or sorted(p.name[:-5] for p in ROOT.glob("*_yolo"))
    results = [check(prefix) for prefix in prefixes]
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "quality.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = ["# 품질 검사 결과", "", "`python scripts/check_quality.py` 가 만든 파일입니다. 검사 항목은 스크립트 맨 위 설명을 보세요.", ""]
    for r in results:
        c = r["counts"]
        lines += [f"## {r['dataset']}", "",
                  f"- 이미지 {c.get('images', 0):,}장, 박스 {c.get('boxes', 0):,}개, 박스가 없는 이미지 {c.get('empty_images', 0)}장",
                  "- 클래스별 박스: " + ", ".join(f"{n} {c.get(n, 0):,}" for n in NAMES),
                  f"- 형식·좌표 문제: {sum(r['problems'].values())}건"]
        lines += [f"  - {kind}: {n}건 (예: {r['problem_examples'][kind]})" for kind, n in r["problems"].items()]
        lines += [f"- 거의 같은 사진 (지문 차이 {NEAR}비트 이하, 참고용): 같은 분할 안 {r['near_duplicates_within_split']}쌍, "
                  f"서로 다른 분할 사이 {r['near_duplicates_across_splits']}쌍", ""]
        if r["near_duplicate_pairs_across_splits"]:
            lines += ["  분할 사이에 걸친 쌍 (최대 20쌍 표시, 전체는 quality.json):", ""]
            lines += [f"  - {a} ↔ {b} (차이 {d})" for d, a, b in r["near_duplicate_pairs_across_splits"][:20]]
            lines.append("")
    (REPORTS / "quality_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))

    if any(r["problems"] for r in results):
        print("문제 있음")
        sys.exit(1)
    print("형식·좌표 문제 없음")


if __name__ == "__main__":
    main()
