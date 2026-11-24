// C-03 순찰 경로 처음 설정 - 공원 분리수거장 등록 (여러 곳) · 쓸 분리수거장 고르기
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createStation, deleteStation } from '@/api/stations';
import type { Station } from '@/api/stations';
import type { ParkArea, ParkBounds } from '@/api/types';
import { Icon, MapHint, ParkMap, PointNameSheet, Text } from '@/components';
import type { ParkMapMarker } from '@/components';
import { icons } from '@/icons';
import { colors, layout, radius, space } from '@/theme';

const MAP_HEIGHT = 290;

/** 공원 범위 밖을 꾹 눌렀을 때 안내 */
function useOutside() {
  const [outside, setOutside] = useState(false);
  return { outside, inside: () => setOutside(false), out: () => setOutside(true) };
}

/* ---------- 2. 공원 분리수거장 등록 ---------- */
export function StepStations({
  bounds,
  area,
  catalogId,
  stations,
  onChange,
}: {
  bounds: ParkBounds;
  area: ParkArea;
  catalogId?: string;
  stations: Station[];
  onChange: (stations: Station[]) => void;
}) {
  const notice = useOutside();
  const [pending, setPending] = useState<Station['position'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const markers: ParkMapMarker[] = stations.map((st) => ({
    id: st.id,
    kind: 'station',
    position: st.position,
    label: st.name,
    showLabel: true,
  }));

  const add = async (name: string) => {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = await createStation(name, pending, catalogId);
      onChange([...stations, created]);
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분리수거장을 등록하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (station: Station) => {
    setBusy(true);
    setError(undefined);
    try {
      await deleteStation(station.id, catalogId);
      onChange(stations.filter((s) => s.id !== station.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '분리수거장을 지우지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: space[16] }}>
        <View style={s.head}>
          <Text variant="18-bold">공원의 분리수거장을 모두 찍어 주세요</Text>
          <Text variant="13-regular" color="textSub">
            처음 한 번만 해요. 등록한 곳은 모든 로봇이 같이 써요
          </Text>
        </View>
        <ParkMap
          style={s.map}
          bounds={bounds}
          area={area}
          markers={markers}
          onLongPress={(p) => {
            notice.inside();
            setPending(p);
          }}
          onLongPressOutside={notice.out}
        />
        <MapHint
          tone={notice.outside ? 'error' : 'brand'}
          text={
            notice.outside
              ? '공원 밖이에요. 공원 안을 꾹 눌러 주세요'
              : stations.length
                ? '지도를 꾹 눌러 분리수거장을 더 추가할 수 있어요'
                : '지도를 꾹 눌러 분리수거장 위치를 찍어요'
          }
        />
        <View style={s.padX}>
          <View style={s.card}>
            <Text variant="14-bold">
              등록한 분리수거장{' '}
              <Text variant="14-bold" color="textDone">
                {stations.length}곳
              </Text>
            </Text>
            {stations.length === 0 ? (
              <Text variant="13-regular" color="textSub">
                아직 등록한 분리수거장이 없어요
              </Text>
            ) : (
              stations.map((st) => (
                <View key={st.id} style={s.row}>
                  <View style={s.recycleDot}>
                    <Icon source={icons.markerRecycle} size={16} />
                  </View>
                  <Text variant="15-bold" style={s.flex1} numberOfLines={1}>
                    {st.name}
                  </Text>
                  <Pressable
                    onPress={() => remove(st)}
                    disabled={busy}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`${st.name} 삭제`}
                  >
                    <Text variant="13-semibold" color="error">
                      삭제
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
            {error ? (
              <Text variant="12-regular" color="error" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <PointNameSheet
        visible={!!pending}
        kind="station"
        order={stations.length + 1}
        sending={busy}
        onCancel={() => setPending(null)}
        onSubmit={add}
      />
    </>
  );
}

/* ---------- 3. 쓸 분리수거장 고르기 ---------- */
export function StepChooseStation({
  bounds,
  area,
  robotName,
  stations,
  selectedId,
  onSelect,
}: {
  bounds: ParkBounds;
  area: ParkArea;
  robotName: string;
  stations: Station[];
  selectedId: string | undefined;
  onSelect: (station: Station) => void;
}) {
  const markers: ParkMapMarker[] = stations.map((st) => ({
    id: st.id,
    kind: 'station',
    position: st.position,
    label: st.id === selectedId ? `${st.name} · 선택` : st.name,
    showLabel: st.id === selectedId,
  }));
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: space[16] }}>
      <View style={s.head}>
        <Text variant="18-bold">{robotName}이 비우러 갈 분리수거장을 골라 주세요</Text>
        <Text variant="13-regular" color="textSub">
          칸이 차면 이곳으로 가요. 경로 편집에서 언제든 바꿀 수 있어요
        </Text>
      </View>
      <ParkMap
        style={s.map}
        bounds={bounds}
        area={area}
        markers={markers}
        onMarkerPress={(id) => {
          const found = stations.find((st) => st.id === id);
          if (found) onSelect(found);
        }}
      />
      <MapHint text="목록이나 지도에서 분리수거장을 눌러 골라요" />
      <View style={s.padX}>
        <View style={s.card}>
          {stations.map((st) => {
            const selected = st.id === selectedId;
            return (
              <Pressable
                key={st.id}
                style={[s.choice, selected ? s.choiceOn : null]}
                onPress={() => onSelect(st)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Icon source={selected ? icons.radioOn : icons.radioOff} size={20} />
                <Text variant="15-bold" color={selected ? 'brandText' : 'text'} style={s.flex1}>
                  {st.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  head: { paddingHorizontal: space[24], paddingTop: space[8], paddingBottom: space[12], gap: space[8] },
  map: { height: MAP_HEIGHT },
  padX: { paddingHorizontal: layout.screenPadding, paddingTop: space[12] },
  card: { backgroundColor: colors.card, borderRadius: radius[16], padding: space[16], gap: space[12] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[12], minHeight: 36 },
  recycleDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: 14,
    paddingVertical: space[12],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceOn: { backgroundColor: colors.bgBrandSoft, borderColor: colors.brand, borderWidth: 1.5 },
});
