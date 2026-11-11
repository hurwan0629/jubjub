// 지도 좌표 계산 (화면에 그리지 않는 순수 함수)
import type { LatLng, ParkArea, ParkBounds } from '@/api/types';

/** 좌표가 공원 범위 안에 있나요? */
export function isInBounds(bounds: ParkBounds, p: LatLng) {
  const { southWest: sw, northEast: ne } = bounds;
  return (
    p.latitude >= sw.latitude && p.latitude <= ne.latitude && p.longitude >= sw.longitude && p.longitude <= ne.longitude
  );
}

/** 점이 다각형 안에 있나요? (광선 교차법. 공원 하나 크기에서는 위도 · 경도를 평면처럼 봐도 충분해요) */
export function isInPolygon(polygon: LatLng[], p: LatLng) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses =
      a.latitude > p.latitude !== b.latitude > p.latitude &&
      p.longitude < ((b.longitude - a.longitude) * (p.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** 공원 안인가요? 경계가 있으면 바깥 경계 안 · 구멍 밖인지, 없으면 사각형 범위로 봐요. */
export function isInPark(bounds: ParkBounds, area: ParkArea | undefined, p: LatLng) {
  if (!isInBounds(bounds, p)) return false;
  if (!area || area.outer.length < 3) return true;
  return isInPolygon(area.outer, p) && !(area.holes ?? []).some((hole) => isInPolygon(hole, p));
}

/** 다각형을 감싸는 사각형 범위 (여유 margin 비율만큼 넓혀요) */
export function boundsOf(points: LatLng[], margin = 0.08): ParkBounds {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const dLat = (maxLat - minLat) * margin;
  const dLng = (maxLng - minLng) * margin;
  return {
    southWest: { latitude: minLat - dLat, longitude: minLng - dLng },
    northEast: { latitude: maxLat + dLat, longitude: maxLng + dLng },
  };
}

/**
 * 처음 보여 줄 범위: 점들이 있으면 그 점들이 다 보이게 확대하고, 없으면 공원 전체.
 * 점이 하나뿐이어도 너무 확대되지 않게 최소 폭(약 400m)을 둬요.
 */
export function focusBounds(points: LatLng[], fallback: ParkBounds, minSpan = 0.004): ParkBounds {
  if (points.length === 0) return fallback;
  const b = boundsOf(points, 0.35);
  const center = boundsCenter(b);
  const halfLat = Math.max(b.northEast.latitude - b.southWest.latitude, minSpan) / 2;
  const halfLng = Math.max(b.northEast.longitude - b.southWest.longitude, minSpan) / 2;
  return {
    southWest: { latitude: center.latitude - halfLat, longitude: center.longitude - halfLng },
    northEast: { latitude: center.latitude + halfLat, longitude: center.longitude + halfLng },
  };
}

/** 공원 범위의 가운데 */
export function boundsCenter(bounds: ParkBounds): LatLng {
  return {
    latitude: (bounds.southWest.latitude + bounds.northEast.latitude) / 2,
    longitude: (bounds.southWest.longitude + bounds.northEast.longitude) / 2,
  };
}

/** 두 좌표 사이 거리(m). 공원 안처럼 가까운 거리용 하버사인 공식이에요. */
export function distanceMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 공원 범위 안의 비율 위치(왼쪽 위 0,0 ~ 오른쪽 아래 1,1) → 좌표.
 * 도식 지도(그림)는 공원 범위를 그대로 덮는다고 보고 이 비율로 위치를 바꿔요.
 */
export function fromBoundsRatio(bounds: ParkBounds, fx: number, fy: number): LatLng {
  const { southWest: sw, northEast: ne } = bounds;
  return {
    latitude: ne.latitude - fy * (ne.latitude - sw.latitude),
    longitude: sw.longitude + fx * (ne.longitude - sw.longitude),
  };
}

/** 좌표 → 공원 범위 안의 비율 위치 (fromBoundsRatio의 반대) */
export function toBoundsRatio(bounds: ParkBounds, p: LatLng) {
  const { southWest: sw, northEast: ne } = bounds;
  return {
    fx: (p.longitude - sw.longitude) / (ne.longitude - sw.longitude),
    fy: (ne.latitude - p.latitude) / (ne.latitude - sw.latitude),
  };
}
