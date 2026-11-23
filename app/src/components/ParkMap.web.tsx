// 웹 전용 실제 지도. 모바일 SDK와 분리해 정적 렌더링 중에는 불러오지 않아요.
import type * as Leaflet from 'leaflet';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme';
import { isInPark } from '@/utils/geo';

import type { ParkMapProps } from './parkMapTypes';
import { Text } from './Text';
import { drawParkOverlays, mapCoordinate } from './webMapLayers';
import 'leaflet/dist/leaflet.css';

type MapRuntime = { lib: typeof Leaflet; map: Leaflet.Map; group: Leaflet.LayerGroup };

export function ParkMap(props: ParkMapProps) {
  const { bounds, area, markers, route, children, faded, style, ref } = props;
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const [runtime, setRuntime] = useState<MapRuntime | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(ref, () => ({
    zoomIn: () => runtime?.map.zoomIn(),
    zoomOut: () => runtime?.map.zoomOut(),
    recenter: () => {
      runtime?.map.fitBounds([mapCoordinate(bounds.southWest), mapCoordinate(bounds.northEast)]);
    },
  }));

  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelHold = () => clearTimeout(timer);
    void import('leaflet')
      .then((lib) => {
        if (disposed || !container.current) return;
        map = lib.map(container.current, { zoomControl: true, attributionControl: false, maxZoom: 19, minZoom: 10 });
        lib.control.attribution({ position: 'topright' }).addTo(map);
        const tiles = lib
          .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          })
          .addTo(map);
        tiles.on('tileerror', () => {
          if (!disposed) setError(true);
        });
        tiles.on('load', () => {
          if (!disposed && container.current?.querySelector('.leaflet-tile-loaded')) setError(false);
        });
        const group = lib.layerGroup().addTo(map);
        const pick = (e: Leaflet.LeafletMouseEvent) => {
          const p = { latitude: e.latlng.lat, longitude: e.latlng.lng };
          const current = latest.current;
          if (isInPark(current.bounds, current.area, p)) current.onLongPress?.(p);
          else current.onLongPressOutside?.(p);
        };
        map.on('mousedown', (e: Leaflet.LeafletMouseEvent) => {
          cancelHold();
          if (e.originalEvent.button === 0) timer = setTimeout(() => pick(e), 450);
        });
        map.on('mouseup mouseout dragstart zoomstart', cancelHold);
        map.on('contextmenu', (e: Leaflet.LeafletMouseEvent) => {
          cancelHold();
          pick(e);
        });
        observer = new ResizeObserver(() => map?.invalidateSize());
        observer.observe(container.current);
        setRuntime({ lib, map, group });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      cancelHold();
      observer?.disconnect();
      map?.remove();
    };
  }, [attempt]);

  useEffect(() => {
    if (!runtime) return;
    const extent = runtime.lib.latLngBounds(mapCoordinate(bounds.southWest), mapCoordinate(bounds.northEast));
    runtime.map.setMaxBounds(extent.pad(0.5));
    runtime.map.invalidateSize();
    runtime.map.fitBounds(extent, { padding: [24, 24], animate: false });
  }, [runtime, bounds]);

  useEffect(() => {
    if (!runtime) return;
    runtime.group.clearLayers();
    drawParkOverlays(runtime.lib, runtime.group, {
      area,
      markers,
      route,
      onMarkerPress: (id) => latest.current.onMarkerPress?.(id),
    });
  }, [runtime, area, markers, route]);

  return (
    <View style={[s.box, style]}>
      <div ref={container} aria-label="공원 지도" style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {faded ? <View style={[StyleSheet.absoluteFill, s.fade]} pointerEvents="none" /> : null}
      {children ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {children}
        </View>
      ) : null}
      {error ? (
        <View style={s.error} accessibilityLiveRegion="polite">
          <Text variant="12-regular">지도를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setRuntime(null);
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            <Text variant="12-bold" color="brandText">
              다시 시도
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.map, overflow: 'hidden' },
  fade: { backgroundColor: colors.bg, opacity: 0.65 },
  error: {
    position: 'absolute',
    top: 48,
    left: space[12],
    right: space[12],
    padding: space[12],
    backgroundColor: colors.card,
    gap: space[8],
  },
});
