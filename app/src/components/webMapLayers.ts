import type * as Leaflet from 'leaflet';

import type { LatLng } from '@/api/types';
import { colors } from '@/theme';

import type { ParkMapProps } from './parkMapTypes';

export const mapCoordinate = (p: LatLng): Leaflet.LatLngTuple => [p.latitude, p.longitude];

/** 이름은 HTML이 아닌 텍스트로 지도에 올려요. */
export function drawParkOverlays(
  lib: typeof Leaflet,
  group: Leaflet.LayerGroup,
  { area, route, markers = [], onMarkerPress }: Pick<ParkMapProps, 'area' | 'route' | 'markers' | 'onMarkerPress'>,
  dom: Pick<Document, 'createElement'> = document,
) {
  if (area && area.outer.length >= 3) {
    lib
      .polygon(
        [area.outer, ...(area.holes ?? [])].map((ring) => ring.map(mapCoordinate)),
        {
          color: colors.brand,
          fillColor: colors.brand,
          fillOpacity: 0.12,
          weight: 2,
          interactive: false,
        },
      )
      .addTo(group);
  }
  if (route && route.length > 1) {
    lib
      .polyline(route.map(mapCoordinate), { color: colors.brand, weight: 3, dashArray: '5 6', interactive: false })
      .addTo(group);
  }
  markers.forEach((m) => {
    const color = m.kind === 'station' ? colors.done : m.kind === 'unpickable' ? colors.error : colors.brand;
    const marker = lib
      .circleMarker(mapCoordinate(m.position), {
        radius: m.kind === 'point' ? 13 : 10,
        color: colors.card,
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
      .addTo(group);
    if (m.label || m.order != null) {
      const label = dom.createElement('span');
      label.textContent = m.kind === 'point' ? `${m.order ?? ''} ${m.label ?? ''}`.trim() : (m.label ?? '');
      marker.bindTooltip(label, { permanent: m.showLabel || m.kind === 'point', direction: 'top' });
    }
    if (onMarkerPress) marker.on('click', () => onMarkerPress(m.id));
  });
}
