"""웹에서 '바닥에 버려진 쓰레기' 사진을 모아 raw/ 에 저장한다.

실행: python crawl.py
결과: raw/web_00001.jpg ...  +  raw/sources.csv (파일별 출처 URL)
"""
import csv
import hashlib
import io
import time
from pathlib import Path

import requests
from ddgs import DDGS
from PIL import Image

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"

TARGET = 1000          # 모을 이미지 수
PAGES = 5              # 검색어 하나당 넘겨볼 결과 페이지 수 (페이지당 약 35개)
MIN_SIDE = 320         # 너무 작은 이미지는 버림

# '버려진 상태'가 드러나는 검색어 (상품 사진이 섞이지 않게)
QUERIES = [
    "plastic bottle litter on grass",
    "plastic bag litter in park",
    "crushed soda can on the ground",
    "aluminum can litter street",
    "broken glass bottle litter",
    "beer bottle litter in park",
    "paper cup litter on sidewalk",
    "cigarette butts on the ground",
    "snack wrapper litter on ground",
    "styrofoam litter on ground",
    "trash on the ground in park",
    "litter on grass close up",
    "litter on sidewalk close up",
    "roadside litter close up",
    "beach litter plastic bottles",
    "공원 쓰레기",
    "길거리 쓰레기 페트병",
    "버려진 캔 쓰레기",
    "버려진 소주병",
    "길바닥 담배꽁초",
    "풀숲 쓰레기 무단투기",
    "등산로 쓰레기",
    "산책로 쓰레기",
    "하천 쓰레기",
    "해변 쓰레기 페트병",
    "한강공원 쓰레기",
    "놀이터 쓰레기",
    "길거리 일회용컵 쓰레기",
    "버려진 플라스틱 컵",
    "버려진 비닐봉지",
    "버려진 맥주캔",
    "버려진 유리병",
    "과자봉지 쓰레기",
    "스티로폼 쓰레기 길거리",
    "종이컵 쓰레기 길거리",
    "플로깅 쓰레기",
]

# 워터마크 + 저작권 문제가 큰 스톡 사이트는 제외
BLOCKED = (
    "istockphoto", "gettyimages", "alamy", "shutterstock", "depositphotos",
    "dreamstime", "123rf", "freepik", "adobe", "vecteezy", "canstockphoto",
    "bigstockphoto", "agefotostock", "pond5", "pngtree", "pikbest", "colourbox",
    "stocksy", "eyeem", "megapixl", "featurepics",
)


def download(url):
    """이미지를 받아서 RGB PIL 이미지로 반환. 실패하면 None."""
    try:
        res = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        res.raise_for_status()
        image = Image.open(io.BytesIO(res.content)).convert("RGB")
    except Exception:
        return None
    if min(image.size) < MIN_SIDE:
        return None
    return image


def main():
    RAW.mkdir(exist_ok=True)
    seen = set()          # 중복 제거용 (이미지 픽셀 해시)
    rows = []

    for query in QUERIES:
        results = []
        for page in range(1, PAGES + 1):
            try:
                results += DDGS().images(query, max_results=100, type_image="photo", page=page)
            except Exception as e:
                print(f"[skip] {query} page {page}: {e}")
            time.sleep(1)

        saved = 0
        for r in results:
            if len(rows) >= TARGET:
                break
            if any(b in (r["image"] + r["url"]).lower() for b in BLOCKED):
                continue
            image = download(r["image"])
            if image is None:
                continue
            digest = hashlib.md5(image.resize((64, 64)).tobytes()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)

            name = f"web_{len(rows) + 1:05d}.jpg"
            image.save(RAW / name, quality=95)
            rows.append({"file": name, "query": query, "image_url": r["image"],
                         "page_url": r["url"], "title": r["title"]})
            saved += 1

        print(f"{query}: +{saved} (total {len(rows)})")
        if len(rows) >= TARGET:
            break

    with open(RAW / "sources.csv", "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    print(f"done: {len(rows)} images -> {RAW}")


if __name__ == "__main__":
    main()
