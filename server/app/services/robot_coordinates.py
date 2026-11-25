"""두 기준점의 회전·축척으로 지도 좌표와 SLAM 좌표를 변환해요."""

import math

from app.core.errors import AppError

EARTH_RADIUS = 6371000.0


def _transform(anchors):
    try:
        first, second = anchors[:2]
        lat0, lng0 = float(first["lat"]), float(first["lng"])
        east = math.radians(float(second["lng"]) - lng0) * EARTH_RADIUS * math.cos(math.radians(lat0))
        north = math.radians(float(second["lat"]) - lat0) * EARTH_RADIUS
        dx, dy = float(second["slam_x"]) - float(first["slam_x"]), float(second["slam_y"]) - float(first["slam_y"])
        norm = east * east + north * north
        if norm < 0.01 or dx * dx + dy * dy < 0.01:
            raise ValueError
        a, b = (dx * east + dy * north) / norm, (dy * east - dx * north) / norm
        values = (lat0, lng0, float(first["slam_x"]), float(first["slam_y"]), a, b)
        if not all(math.isfinite(value) for value in values) or abs(lat0) >= 89:
            raise ValueError
        return values
    except (ValueError, TypeError, KeyError, ZeroDivisionError):
        raise AppError(
            409, "서로 다른 위치의 좌표 기준점 두 개를 설정해 주세요", code="robot_anchors_required"
        ) from None


def to_slam(anchors, lat, lng):
    lat0, lng0, x0, y0, a, b = _transform(anchors)
    east = math.radians(lng - lng0) * EARTH_RADIUS * math.cos(math.radians(lat0))
    north = math.radians(lat - lat0) * EARTH_RADIUS
    return {"x": x0 + a * east - b * north, "y": y0 + b * east + a * north}


def to_geo(anchors, x, y):
    lat0, lng0, x0, y0, a, b = _transform(anchors)
    east, north = (a * (x - x0) + b * (y - y0)) / (a * a + b * b), (-b * (x - x0) + a * (y - y0)) / (a * a + b * b)
    lat, lng = (
        lat0 + math.degrees(north / EARTH_RADIUS),
        lng0 + math.degrees(east / (EARTH_RADIUS * math.cos(math.radians(lat0)))),
    )
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise AppError(422, "지도 범위 안의 좌표를 보내 주세요", code="robot_coordinates_invalid")
    return lat, lng
