import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { searchParks } from '@/api/parks';
import type { LatLng, Park, ParkArea, ParkBounds, PatrolPoint, PatrolSlot } from '@/api/types';
import { AddTimeSheet, Icon, MapHint, ParkMap, PointList, PointNameSheet, ScheduleList, Text, Txt } from '@/components';
import type { ParkMapMarker } from '@/components';
import { useParkSearch } from '@/hooks/useParks';
import { icons } from '@/icons';
import { colors, font, radius } from '@/theme';
import { lapMinutes, loopPath, nextPatrolTime, REPEAT_LABEL } from '@/utils/route';

const MAP_HEIGHT = 290;
const InfoBar = MapHint;

/** 분리수거장 + 순찰 지점 마커 */
function routeMarkers(points: PatrolPoint[], recycle: LatLng | null, recycleLabel = false): ParkMapMarker[] {
  return [
    ...(recycle
      ? [{ id: 'station', kind: 'station' as const, position: recycle, label: '분리수거장', showLabel: recycleLabel }]
      : []),
    ...points.map((p, i) => ({
      id: p.id,
      kind: 'point' as const,
      position: p.position,
      label: p.name,
      order: i + 1,
    })),
  ];
}

/** 공원 범위 밖을 꾹 눌렀을 때 잠깐 보여 줄 안내 */
function useOutsideNotice() {
  const [outside, setOutside] = useState(false);
  return {
    outside,
    onInside: () => setOutside(false),
    onOutside: () => setOutside(true),
  };
}

/* ---------- 1. 안내 ---------- */
const GUIDE = [
  ['공원 찾기', '검색해서 Jubi가 일할 공원으로 이동해요'],
  ['분리수거장 위치', 'Jubi가 칸을 비우러 갈 곳을 1곳 정해요'],
  ['순찰 지점 찍기', '지도를 꾹 눌러 지점을 추가하고 이름을 붙여요'],
  ['순서', '지점을 돌 순서를 정해요'],
  ['순찰 시간표', '하루 중 언제 순찰할지 정해요'],
];

export function StepIntro() {
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Txt size={18} weight="bold">
        {'Jubi가 돌 순찰 경로를\n처음 한 번 정해 주세요'}
      </Txt>
      <Txt size={13} lineHeight={1.5} color={colors.textSub}>
        Jubi는 정해 준 지점을 순서대로 돌며 쓰레기를 주워요. 지점마다 붙인 이름은 알림과 기록에서 장소 이름으로 쓰여요.
      </Txt>
      <View style={st.guideCard}>
        {GUIDE.map(([title, desc], i) => (
          <View key={title} style={st.guideRow}>
            <View style={st.guideNum}>
              <Text variant="13-regular-digits" color="brandText">
                {i + 1}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={15} weight="bold">
                {title}
              </Txt>
              <Txt size={13} lineHeight={1.5} color={colors.textSub}>
                {desc}
              </Txt>
            </View>
          </View>
        ))}
      </View>
      <Txt size={13} lineHeight={1.5} color={colors.textSub}>
        {'나중에 지도 > 경로 편집에서 언제든 바꿀 수 있어요'}
      </Txt>
    </ScrollView>
  );
}

/* ---------- 2. 공원 찾기 ---------- */
export function StepPark({ park, onPick }: { park: Park | null; onPick: (p: Park | null) => void }) {
  const [query, setQuery] = useState(park?.name ?? '');
  const q = query.trim();
  const { data: found } = useParkSearch(q);
  const results = q ? (found ?? []) : [];

  return (
    <View style={{ flex: 1 }}>
      <View style={[st.padTight, { gap: 8 }]}>
        <Txt size={18} weight="bold">
          Jubi가 일할 공원을 찾아 주세요
        </Txt>
        {!q ? (
          <Txt size={13} lineHeight={1.5} color={colors.textSub}>
            공원 이름이나 주소로 찾으면 지도가 그곳으로 이동해요
          </Txt>
        ) : null}
        <View style={st.search}>
          <Icon source={icons.search} size={20} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (park && !t.includes(park.name)) onPick(null);
            }}
            placeholder="공원 이름이나 주소를 입력해요"
            placeholderTextColor={colors.textSub}
            style={[st.searchInput, q ? { fontFamily: font.bold } : null]}
            accessibilityLabel="공원 검색"
            returnKeyType="search"
          />
          {q ? (
            <Pressable
              onPress={() => {
                setQuery('');
                onPick(null);
              }}
              hitSlop={8}
              accessibilityLabel="검색어 지우기"
            >
              <Icon source={icons.xCircle} size={18} />
            </Pressable>
          ) : null}
        </View>

        {!q ? (
          <Pressable
            style={st.locate}
            onPress={async () => {
              // 위치 권한 연동 전까지는 가장 가까운 공원(첫 검색 결과)을 골라요
              setQuery('한강');
              const nearby = await searchParks('한강');
              onPick(nearby[0] ?? null);
            }}
          >
            <Icon source={icons.buttonRoute} size={19} />
            <Txt size={15} weight="bold" color={colors.brandText}>
              내 위치에서 찾기
            </Txt>
          </Pressable>
        ) : (
          <>
            <Txt size={12} weight="semibold" color={colors.textSub} style={{ marginTop: 4 }}>
              검색 결과 {results.length}곳
            </Txt>
            <View style={st.results}>
              {results.length === 0 ? (
                <Txt size={13} color={colors.textSub} style={{ padding: 12 }}>
                  찾는 공원이 없어요. 다른 이름으로 찾아 보세요
                </Txt>
              ) : (
                results.map((p) => {
                  const on = park?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => onPick(p)}
                      style={[st.result, on ? { backgroundColor: colors.bgSelected } : null]}
                    >
                      <View style={st.pinCircle}>
                        <Icon source={icons.mapPin} size={20} />
                      </View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Txt size={14} weight="bold" color={on ? colors.brandText : colors.text}>
                          {p.name}
                        </Txt>
                        <Txt size={12} color={colors.textSub}>
                          {p.address}
                        </Txt>
                      </View>
                      <Txt size={12} color={colors.textSub}>
                        {p.distance}
                      </Txt>
                      {on ? <Icon source={icons.checkBrand} size={20} /> : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}
      </View>

      <View style={{ flex: 1, marginTop: 8 }}>
        {park ? (
          // 고른 공원 범위로 지도가 옮겨가요. 공원 밖으로는 움직이지 않아요.
          <ParkMap key={park.id} style={st.fill} bounds={park.bounds} area={park.area}>
            <View style={[st.parkPinWrap, { top: 60 }]} pointerEvents="none">
              <View style={st.parkPin}>
                <Icon source={icons.mapPinWhite} size={22} />
              </View>
              <View style={st.parkLabel}>
                <Txt size={12} weight="bold" color={colors.brandText}>
                  {park.name}
                </Txt>
              </View>
            </View>
          </ParkMap>
        ) : (
          // 아직 공원을 고르지 않았을 때: 흐린 도식 지도 + 안내
          <View style={[st.fill, st.mapPlaceholder]}>
            <View style={st.placeholderImage} pointerEvents="none">
              <Icon source={icons.parkMapBase} width={390} height={500} />
            </View>
            <View style={st.mapChip} pointerEvents="none">
              <Icon source={icons.searchSmall} size={14} />
              <Txt size={12} weight="semibold" color={colors.brandText}>
                공원을 찾으면 지도가 그곳으로 이동해요
              </Txt>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

/* ---------- 3. 분리수거장 위치 (지도를 꾹 눌러 정해요) ---------- */
export function StepRecycle({
  bounds,
  area,
  recycle,
  onSet,
}: {
  bounds: ParkBounds;
  area: ParkArea;
  recycle: LatLng | null;
  onSet: (p: LatLng) => void;
}) {
  const notice = useOutsideNotice();
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={[st.padTight, { gap: 8, paddingBottom: 12 }]}>
        <Txt size={18} weight="bold">
          분리수거장 위치를 정해 주세요
        </Txt>
        <Txt size={13} lineHeight={1.5} color={colors.textSub}>
          Jubi가 칸을 비우러 가는 곳이에요. 1곳만 정할 수 있어요
        </Txt>
      </View>
      <ParkMap
        style={st.mapBox}
        bounds={bounds}
        area={area}
        markers={routeMarkers([], recycle, true)}
        onLongPress={(p) => {
          notice.onInside();
          onSet(p);
        }}
        onLongPressOutside={notice.onOutside}
      />
      <InfoBar
        text={
          notice.outside
            ? '공원 밖이에요. 공원 안을 꾹 눌러 주세요'
            : recycle
              ? '다른 곳을 꾹 누르면 위치를 옮길 수 있어요'
              : '지도를 꾹 눌러 분리수거장 위치를 찍어요'
        }
      />
      <View style={{ paddingHorizontal: 24, paddingTop: 12 }}>
        <View style={st.legendCard}>
          <View style={st.legendRow}>
            <View style={st.legendRecycle}>
              <Icon source={icons.markerRecycle} size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={13} weight="semibold">
                분리수거장
              </Txt>
              <Txt size={12} color={colors.textSub}>
                Jubi가 칸을 비우는 곳 · 1곳
              </Txt>
            </View>
            <Txt size={12} weight="semibold" color={recycle ? colors.textDone : colors.textSub}>
              {recycle ? '정했어요' : '아직 안 정했어요'}
            </Txt>
          </View>
          <View style={st.divider} />
          <View style={st.legendRow}>
            <View style={{ width: 44, alignItems: 'center' }}>
              <View style={st.legendPoint}>
                <Text variant="14-bold-digits" color="card">
                  1
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={13} weight="semibold">
                순찰 지점
              </Txt>
              <Txt size={12} color={colors.textSub}>
                쓰레기를 줍는 곳 · 다음 단계에서 찍어요
              </Txt>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

/* ---------- 4. 순찰 지점 찍기 ---------- */
export function StepPoints({
  bounds,
  area,
  points,
  recycle,
  onAdd,
  onRemove,
}: {
  bounds: ParkBounds;
  area: ParkArea;
  points: PatrolPoint[];
  recycle: LatLng | null;
  onAdd: (p: PatrolPoint) => void;
  onRemove: (i: number) => void;
}) {
  const [pending, setPending] = useState<LatLng | null>(null);
  const notice = useOutsideNotice();

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <ParkMap
          style={st.mapBox}
          bounds={bounds}
          area={area}
          markers={routeMarkers(points, recycle)}
          route={points.map((p) => p.position)}
          onLongPress={(p) => {
            notice.onInside();
            setPending(p);
          }}
          onLongPressOutside={notice.onOutside}
        />
        <InfoBar
          text={notice.outside ? '공원 밖이에요. 공원 안을 꾹 눌러 주세요' : '지도를 꾹 눌러 순찰 지점을 추가해요'}
        />
        <View style={st.listHead}>
          <Txt size={17} weight="bold">
            순찰 지점
          </Txt>
          <Txt size={12} color={colors.textSub}>
            {points.length}개 지점 · 약 {lapMinutes(points, recycle)}분
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 24 }}>
          <PointList points={points} onRemove={onRemove} />
        </View>
      </ScrollView>

      {/* 지점 이름 정하기 */}
      <PointNameSheet
        visible={!!pending}
        order={points.length + 1}
        onCancel={() => setPending(null)}
        onSubmit={(name) => {
          if (pending) onAdd({ id: `p${Date.now()}`, position: pending, name });
          setPending(null);
        }}
      />
    </>
  );
}

/* ---------- 5. 순서 ---------- */
export function StepOrder({
  bounds,
  area,
  points,
  recycle,
  onMove,
  onRemove,
}: {
  bounds: ParkBounds;
  area: ParkArea;
  points: PatrolPoint[];
  recycle: LatLng | null;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
      {/* 지점 → 분리수거장 → 처음 지점으로 돌아오는 한 바퀴 */}
      <ParkMap
        style={st.mapBox}
        bounds={bounds}
        area={area}
        markers={routeMarkers(points, recycle)}
        route={loopPath(points, recycle)}
      />
      <InfoBar text="끌어서 순서를 바꿀 수 있어요" center />
      <View style={st.listHead}>
        <Txt size={17} weight="bold">
          순찰 지점
        </Txt>
        <Txt size={12} color={colors.textSub}>
          {points.length}개 지점 · 약 {lapMinutes(points, recycle)}분
        </Txt>
      </View>
      <View style={{ paddingHorizontal: 24 }}>
        <PointList points={points} reorder onMove={onMove} onRemove={onRemove} />
      </View>
    </ScrollView>
  );
}

/* ---------- 6. 순찰 시간표 ---------- */
export function StepSchedule({ slots, onChange }: { slots: PatrolSlot[]; onChange: (s: PatrolSlot[]) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <ScrollView contentContainerStyle={[st.padTight, { paddingTop: 16, paddingBottom: 24 }]}>
        <ScheduleList slots={slots} onChange={onChange} onAddPress={() => setAdding(true)} />
      </ScrollView>
      <AddTimeSheet
        visible={adding}
        onCancel={() => setAdding(false)}
        onSubmit={({ time, repeat }) => {
          const slot = { id: `s${Date.now()}`, time, repeat, on: true, label: `${REPEAT_LABEL[repeat]} 순찰` };
          onChange([...slots, slot].sort((a, b) => a.time.localeCompare(b.time)));
          setAdding(false);
        }}
      />
    </>
  );
}

/* ---------- 7. 완료 ---------- */
export function StepDone({
  park,
  points,
  recycle,
  slots,
}: {
  park: Park | null;
  points: PatrolPoint[];
  recycle: LatLng | null;
  slots: PatrolSlot[];
}) {
  const on = slots
    .filter((s) => s.on)
    .map((s) => s.time)
    .sort();
  const next = nextPatrolTime(slots);
  const rows: [string, string][] = [
    ['공원', park?.name ?? '-'],
    ['분리수거장', recycle ? '1곳' : '-'],
    ['순찰 지점', `${points.length}곳`],
    ['순서', points.map((p) => p.name).join(' → ') || '-'],
    ['한 바퀴', `약 ${lapMinutes(points, recycle)}분`],
    ['시간표', on.length ? `하루 ${on.length}번 · ${on.join(' ')}` : '꺼져 있어요'],
  ];
  return (
    <ScrollView contentContainerStyle={[st.padTight, { alignItems: 'center', paddingTop: 40, gap: 0 }]}>
      <View style={st.doneCircle}>
        <Icon source={icons.checkWhiteLg} size={40} />
      </View>
      <Txt size={18} weight="bold" style={{ marginTop: 22 }}>
        순찰 경로를 저장했어요
      </Txt>
      <Txt size={13} color={colors.textSub} style={{ marginTop: 18 }}>
        {next ? `${next} 순찰부터 Jubi가 이 경로로 돌아요` : '시간표를 켜면 Jubi가 이 경로로 돌아요'}
      </Txt>
      <View style={st.summary}>
        {rows.map(([k, v]) => (
          <View key={k} style={st.summaryRow}>
            <Txt size={13} color={colors.textSub}>
              {k}
            </Txt>
            <Txt size={13} style={{ flexShrink: 1, textAlign: 'right' }}>
              {v}
            </Txt>
          </View>
        ))}
      </View>
      <Txt size={13} color={colors.textSub} style={{ marginTop: 20 }}>
        {'지도 > 경로 편집에서 언제든 바꿀 수 있어요'}
      </Txt>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  mapBox: { height: MAP_HEIGHT },
  mapPlaceholder: { backgroundColor: colors.map, overflow: 'hidden', alignItems: 'center' },
  placeholderImage: { opacity: 0.35 },
  pad: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24, gap: 16 },
  padTight: { paddingHorizontal: 24, paddingTop: 8 },
  guideCard: { backgroundColor: colors.card, borderRadius: radius[16], padding: 16, gap: 14 },
  guideRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  guideNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    marginTop: 4,
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    padding: 0,
    outlineStyle: 'none',
  } as object,
  locate: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  results: { backgroundColor: colors.card, borderRadius: radius[16], padding: 6, gap: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12 },
  pinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapChip: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  parkPinWrap: { position: 'absolute', alignSelf: 'center', alignItems: 'center', gap: 6 },
  parkPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parkLabel: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  legendCard: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  legendRecycle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendPoint: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: colors.card,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, backgroundColor: colors.border },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
  },
  doneCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    alignSelf: 'stretch',
    marginTop: 24,
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: 16,
    gap: 16,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
});
