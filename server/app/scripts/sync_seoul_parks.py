"""서울 OSM 공원 경계를 수집·정제해요. 앱 요청마다 외부 API를 호출하지 않아요."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.services.park_import import normalize_osm

OVERPASS_QUERY = """[out:json][timeout:60];
area["boundary"="administrative"]["admin_level"="4"]["name:en"="Seoul"]->.seoul;
(way["leisure"="park"](area.seoul);relation["leisure"="park"](area.seoul);
relation["boundary"="administrative"]["admin_level"="6"](area.seoul););out geom;"""


def main() -> None:
    parser = argparse.ArgumentParser(description="서울 공원 경계를 수집하고 정제해요")
    parser.add_argument("--input", type=Path, help="이미 받은 Overpass JSON을 사용해요")
    parser.add_argument("--output", type=Path, default=Path("data/seoul_parks.json"))
    args = parser.parse_args()
    if args.input:
        raw = json.loads(args.input.read_text(encoding="utf-8"))
    else:
        request = Request(
            "https://overpass-api.de/api/interpreter",
            data=urlencode({"data": OVERPASS_QUERY}).encode(),
            headers={"User-Agent": "JUBJUB-ParkCatalog/1.0"},
        )
        with urlopen(request, timeout=75) as response:
            raw = json.load(response)
    document = normalize_osm(raw)
    # 모든 입력 검증 후 저장해요. 빈 응답으로 기존 파일을 덮어쓰지 않아요.
    if not document["entries"]:
        raise ValueError("적재할 공원 경계가 없어요")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"경계 {len(document['entries'])}개를 저장했어요. 제외 {len(document['skipped'])}개: {args.output}")


if __name__ == "__main__":
    main()
