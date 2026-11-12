"""OSM 공원 경계를 정제하고 안정적인 원본 키로 DB 목록을 갱신해요."""

import warnings
from datetime import UTC, datetime

from shapely import get_parts, polygonize_full
from shapely.errors import GEOSException
from shapely.geometry import LineString, Polygon
from shapely.ops import unary_union
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ParkCatalogEntry
from app.schemas.parks import ParkArea

DATASET = "osm-seoul"
LICENSE = "ODbL-1.0"


def _coordinates(geometry: list[dict]) -> list[tuple[float, float]]:
    return [(point["lon"], point["lat"]) for point in geometry]


def _rings(lines: list[LineString]) -> list[Polygon]:
    if not lines:
        return []
    with warnings.catch_warnings():
        warnings.simplefilter("error", RuntimeWarning)
        polygons, cuts, dangles, invalid = polygonize_full(lines)
    if not cuts.is_empty or not dangles.is_empty or not invalid.is_empty or polygons.is_empty:
        raise ValueError("닫히지 않았거나 잘못된 경계선이에요")
    # polygonize가 같은 role의 중첩 링을 구멍으로 해석하지 않게 각 링을 분리해요.
    return [Polygon(polygon.exterior) for polygon in get_parts(polygons)]


def _polygons(element: dict) -> list[Polygon]:
    if element["type"] == "way":
        coordinates = _coordinates(element.get("geometry", []))
        if len(coordinates) < 4 or coordinates[0] != coordinates[-1]:
            raise ValueError("닫힌 공원 경계가 아니에요")
        result = Polygon(coordinates)
    else:
        outer_lines, inner_lines = [], []
        for member in element.get("members", []):
            if member.get("type") != "way":
                continue
            role = member.get("role", "")
            if role not in ("outer", "inner", ""):
                raise ValueError("지원하지 않는 경계선 역할이에요")
            coordinates = _coordinates(member.get("geometry", []))
            if len(coordinates) < 2:
                raise ValueError("경계선 좌표가 누락됐어요")
            (inner_lines if role == "inner" else outer_lines).append(LineString(coordinates))
        outers, inners = _rings(outer_lines), _rings(inner_lines)
        if not outers or any(not any(outer.covers(inner) for outer in outers) for inner in inners):
            raise ValueError("바깥 경계 또는 구멍의 포함 관계가 잘못됐어요")
        pieces = [outer.difference(unary_union([inner for inner in inners if outer.covers(inner)])) for outer in outers]
        result = unary_union(pieces)
    if result.is_empty or not result.is_valid or result.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("유효한 공원 다각형이 아니에요")
    return sorted(get_parts(result), key=lambda polygon: (-polygon.area, polygon.bounds))


def _latlng(coordinates) -> list[dict[str, float]]:
    return [{"latitude": latitude, "longitude": longitude} for longitude, latitude in coordinates]


def _component_key(element: dict, polygon: Polygon) -> str:
    if element["type"] == "way":
        return f"osm:way:{element['id']}:1"
    references = sorted(
        {
            member["ref"]
            for member in element.get("members", [])
            if member.get("type") == "way"
            and member.get("role", "") in ("outer", "")
            and polygon.exterior.intersection(LineString(_coordinates(member["geometry"]))).length > 1e-10
        }
    )
    if not references:
        raise ValueError("구역을 원본 경계선과 연결할 수 없어요")
    return f"osm:relation:{element['id']}:outer:" + ",".join(str(reference) for reference in references)


def _address(tags: dict, district: str = "") -> str:
    if tags.get("addr:full"):
        return tags["addr:full"]
    parts = [
        tags.get(key, "")
        for key in ("addr:city", "addr:district", "addr:subdistrict", "addr:street", "addr:housenumber")
    ]
    address = " ".join(part for part in parts if part)
    return address or f"서울특별시 {district} · 상세 주소 미등록".replace("  ", " ")


def normalize_osm(raw: dict) -> dict:
    if raw.get("remark") or not isinstance(raw.get("elements"), list):
        raise ValueError("OSM 응답이 없거나 일부만 수집됐어요")
    entries, skipped, member_ways = [], [], set()
    districts = []
    for element in raw["elements"]:
        tags = element.get("tags", {})
        if tags.get("boundary") == "administrative" and tags.get("admin_level") == "6":
            for polygon in _polygons(element):
                districts.append((tags.get("name:ko") or tags.get("name", ""), polygon))
    elements = sorted(raw["elements"], key=lambda element: (element.get("type") != "relation", element.get("id", 0)))
    for element in elements:
        kind, identifier = element.get("type"), element.get("id")
        if kind not in ("way", "relation") or (kind == "way" and identifier in member_ways):
            continue
        tags = element.get("tags", {})
        if tags.get("leisure") != "park":
            continue
        try:
            polygons = _polygons(element)
            name = tags.get("name:ko") or tags.get("name") or "이름 없는 공원"
            element_entries = []
            for number, polygon in enumerate(polygons, 1):
                center = polygon.representative_point()
                district = next((name for name, boundary in districts if boundary.covers(center)), "")
                area = ParkArea(
                    outer=_latlng(polygon.exterior.coords),
                    holes=[_latlng(ring.coords) for ring in polygon.interiors],
                )
                element_entries.append(
                    {
                        "source_key": _component_key(element, polygon),
                        "name": name if len(polygons) == 1 else f"{name} · {number}구역",
                        "address": _address(tags, district),
                        "source_url": f"https://www.openstreetmap.org/{kind}/{identifier}",
                        "area": area.model_dump(by_alias=True),
                    }
                )
            if len({entry["source_key"] for entry in element_entries}) != len(element_entries):
                raise ValueError("분리된 구역의 원본 경계선이 같아서 안정적인 ID를 정할 수 없어요")
            entries.extend(element_entries)
            if kind == "relation":
                member_ways.update(
                    member["ref"] for member in element.get("members", []) if member.get("type") == "way"
                )
        except (ValueError, KeyError, TypeError, RuntimeWarning, GEOSException) as exc:
            skipped.append({"source": f"osm:{kind}:{identifier}", "reason": str(exc)})
    return {
        "dataset": DATASET,
        "source": "OpenStreetMap contributors",
        "license": LICENSE,
        "license_url": "https://opendatacommons.org/licenses/odbl/1-0/",
        "osm_timestamp": raw.get("osm3s", {}).get("timestamp_osm_base"),
        "entries": entries,
        "skipped": skipped,
    }


def catalog_values(entry: dict) -> dict:
    area = ParkArea.model_validate(entry["area"])
    polygon = Polygon(
        [(point.longitude, point.latitude) for point in area.outer],
        [[(point.longitude, point.latitude) for point in ring] for ring in area.holes],
    )
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        raise ValueError("유효하지 않은 공원 경계예요")
    for ring in [area.outer, *area.holes]:
        if len(ring) < 4 or ring[0] != ring[-1]:
            raise ValueError("공원 경계는 닫힌 좌표 목록이어야 해요")
    if not entry.get("source_key") or not entry.get("name") or not entry.get("address"):
        raise ValueError("공원 식별자·이름·주소가 필요해요")
    min_lng, min_lat, max_lng, max_lat = polygon.bounds
    center = polygon.representative_point()
    return {
        "source_key": entry["source_key"],
        "dataset": DATASET,
        "name": entry["name"],
        "address": entry["address"],
        "source_url": entry["source_url"],
        "source_license": LICENSE,
        "area": area.model_dump(by_alias=True),
        "bounds": {
            "southWest": {"latitude": min_lat, "longitude": min_lng},
            "northEast": {"latitude": max_lat, "longitude": max_lng},
        },
        "center_lat": center.y,
        "center_lng": center.x,
        "is_active": True,
        "imported_at": datetime.now(UTC),
    }


def import_catalog(db: Session, document: dict, *, replace: bool = False) -> int:
    if document.get("dataset") != DATASET or document.get("license") != LICENSE or not document.get("entries"):
        raise ValueError("서울 공원 목록과 출처·라이선스가 필요해요. 빈 목록은 적재하지 않아요")
    # 전체 입력을 먼저 검증해서 잘못된 파일이 일부만 반영되지 않게 해요.
    records = [catalog_values(entry) for entry in document["entries"]]
    if len({record["source_key"] for record in records}) != len(records):
        raise ValueError("공원 원본 키가 중복됐어요")
    existing = {
        entry.source_key: entry
        for entry in db.scalars(select(ParkCatalogEntry).where(ParkCatalogEntry.dataset == DATASET))
    }
    try:
        if replace:
            for entry in existing.values():
                entry.is_active = False
        for values in records:
            entry = existing.get(values["source_key"])
            if entry is None:
                db.add(ParkCatalogEntry(**values))
            else:
                for key, value in values.items():
                    setattr(entry, key, value)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return len(records)
