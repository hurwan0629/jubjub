import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { searchParks } from '@/api/parks';
import type { LatLng, Park, ParkArea, ParkBounds, PatrolPoint, PatrolSlot } from '@/api/types';
import { AddTimeSheet, Icon, MapHint, ParkMap, PointList, PointNameSheet, ScheduleList, Text } from '@/components';
import type { ParkMapMarker } from '@/components';
import { useParkSearch } from '@/hooks/useParks';
import { icons } from '@/icons';
import { colors, layout, radius, space, typography } from '@/theme';
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
    <ScrollView contentContainerStyle={s.pad}>
      <Text variant="18-bold">{'Jubi가 돌 순찰 경로를\n처음 한 번 정해 주세요'}</Text>
      <Text variant="13-regular" color="textSub" lineHeight="relaxed">
        Jubi는 정해 준 지점을 순서대로 돌며 쓰레기를 주워요. 지점마다 붙인 이름은 알림과 기록에서 장소 이름으로 쓰여요.
      </Text>
      <View style={s.guideCard}>
        {GUIDE.map(([title, desc], i) => (
          <View key={title} style={s.guideRow}>
            <View style={s.guideNum}>
              <Text variant="13-regular-digits" color="brandText">
                {i + 1}
              </Text>
            </View>
            <View style={s.textCol}>
              <Text variant="15-bold">{title}</Text>
              <Text variant="13-regular" color="textSub" lineHeight="relaxed">
                {desc}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <Text variant="13-regular" color="textSub" lineHeight="relaxed">
        {'나중에 지도 > 경로 편집에서 언제든 바꿀 수 있어요'}
      </Text>
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
    <View style={s.flex}>
      <View style={[s.padTight, { gap: space[8] }]}>
        <Text variant="18-bold">Jubi가 일할 공원을 찾아 주세요</Text>
        {!q ? (
          <Text variant="13-regular" color="textSub" lineHeight="relaxed">
            공원 이름이나 주소로 찾으면 지도가 그곳으로 이동해요
          </Text>
        ) : null}
        <View style={s.search}>
          <Icon source={icons.search} size={20} />
          <TextInput
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              if (park && !t.includes(park.name)) onPick(null);
            }}
            placeholder="공원 이름이나 주소를 입력해요"
            placeholderTextColor={colors.textSub}
            style={[s.searchInput, q ? s.searchInputFilled : null]}
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
            style={s.locate}
            onPress={async () => {
              // 위치 권한 연동 전까지는 가장 가까운 공원(첫 검색 결과)을 골라요
              setQuery('한강');
              const nearby = await searchParks('한강');
              onPick(nearby[0] ?? null);
            }}
          >
            <Icon source={icons.buttonRoute} size={19} />
            <Text variant="15-bold" color="brandText">
              내 위치에서 찾기
            </Text>
          </Pressable>
        ) : (
          <>
            <Text variant="12-semibold" color="textSub" style={s.mt4}>
              검색 결과 {results.length}곳
            </Text>
            <View style={s.results}>
              {results.length === 0 ? (
                <Text variant="13-regular" color="textSub" style={s.p12}>
                  찾는 공원이 없어요. 다른 이름으로 찾아 보세요
                </Text>
              ) : (
                results.map((p) => {
                  const on = park?.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => onPick(p)}
                      style={[s.result, on ? { backgroundColor: colors.bgSelected } : null]}
                    >
                      <View style={s.pinCircle}>
                        <Icon source={icons.mapPin} size={20} />
                      </View>
                      <View style={s.textColLoose}>
                        <Text variant="14-bold" color={on ? 'brandText' : 'text'}>
                          {p.name}
                        </Text>
                        <Text variant="12-regular" color="textSub">
                          {p.address}
                        </Text>
                      </View>
                      <Text variant="12-regular" color="textSub">
                        {p.distance}
                      </Text>
                      {on ? <Icon source={icons.checkBrand} size={20} /> : null}
                    </Pressable>
                  );
                })
              )}
            </View>
          </>
        )}
      </View>

      <View style={s.flexMt8}>
        {park ? (
          // 고른 공원 범위로 지도가 옮겨가요. 공원 밖으로는 움직이지 않아요.
          <ParkMap key={park.id} style={s.fill} bounds={park.bounds} area={park.area}>
            <View style={[s.parkPinWrap, { top: 60 }]} pointerEvents="none">
              <View style={s.parkPin}>
                <Icon source={icons.mapPinWhite} size={22} />
              </View>
              <View style={s.parkLabel}>
                <Text variant="12-bold" color="brandText">
                  {park.name}
                </Text>
              </View>
            </View>
          </ParkMap>
        ) : (
          // 아직 공원을 고르지 않았을 때: 흐린 도식 지도 + 안내
          <View style={[s.fill, s.mapPlaceholder]}>
            <View style={s.placeholderImage} pointerEvents="none">
              <Icon source={icons.parkMapBase} width={390} height={500} />
            </View>
            <View style={s.mapChip} pointerEvents="none">
              <Icon source={icons.searchSmall} size={14} />
              <Text variant="12-semibold" color="brandText">
                공원을 찾으면 지도가 그곳으로 이동해요
              </Text>
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
    <ScrollView contentContainerStyle={{ paddingBottom: space[16] }}>
      <View style={[s.padTight, { gap: space[8], paddingBottom: space[12] }]}>
        <Text variant="18-bold">분리수거장 위치를 정해 주세요</Text>
        <Text variant="13-regular" color="textSub" lineHeight="relaxed">
          Jubi가 칸을 비우러 가는 곳이에요. 1곳만 정할 수 있어요
        </Text>
      </View>
      <ParkMap
        style={s.mapBox}
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
      <View style={s.padTop}>
        <View style={s.legendCard}>
          <View style={s.legendRow}>
            <View style={s.legendRecycle}>
              <Icon source={icons.markerRecycle} size={22} />
            </View>
            <View style={s.textCol}>
              <Text variant="13-semibold">분리수거장</Text>
              <Text variant="12-regular" color="textSub">
                Jubi가 칸을 비우는 곳 · 1곳
              </Text>
              <Text variant="12-regular" color="textSub">
                이 지점으로 Jubi가 돌아옵니다
              </Text>
            </View>
            <Text variant="12-semibold" color={recycle ? 'textDone' : 'textSub'}>
              {recycle ? '정했어요' : '아직 안 정했어요'}
            </Text>
          </View>
          <View style={s.divider} />
          <View style={s.legendRow}>
            <View style={s.iconCol}>
              <View style={s.legendPoint}>
                <Text variant="14-bold-digits" color="card">
                  1
                </Text>
              </View>
            </View>
            <View style={s.textCol}>
              <Text variant="13-semibold">순찰 지점</Text>
              <Text variant="12-regular" color="textSub">
                쓰레기를 줍는 곳 · 다음 단계에서 찍어요
              </Text>
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
      <ScrollView contentContainerStyle={{ paddingBottom: space[16] }}>
        <ParkMap
          style={s.mapBox}
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
        <View style={s.listHead}>
          <Text variant="17-bold">순찰 지점</Text>
          <Text variant="12-regular" color="textSub">
            {points.length}개 지점 · 약 {lapMinutes(points, recycle)}분
          </Text>
        </View>
        <View style={s.padX}>
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
    <ScrollView contentContainerStyle={{ paddingBottom: space[16] }}>
      {/* 지점 → 분리수거장 → 처음 지점으로 돌아오는 한 바퀴 */}
      <ParkMap
        style={s.mapBox}
        bounds={bounds}
        area={area}
        markers={routeMarkers(points, recycle)}
        route={loopPath(points, recycle)}
      />
      <InfoBar text="끌어서 순서를 바꿀 수 있어요" center />
      <View style={s.listHead}>
        <Text variant="17-bold">순찰 지점</Text>
        <Text variant="12-regular" color="textSub">
          {points.length}개 지점 · 약 {lapMinutes(points, recycle)}분
        </Text>
      </View>
      <View style={s.padX}>
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
      <ScrollView contentContainerStyle={[s.padTight, { paddingTop: space[16], paddingBottom: space[24] }]}>
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
    .filter((slot) => slot.on)
    .map((slot) => slot.time)
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
    <ScrollView contentContainerStyle={[s.padTight, { alignItems: 'center', paddingTop: 40, gap: 0 }]}>
      <View style={s.doneCircle}>
        <Icon source={icons.checkWhiteLg} size={40} />
      </View>
      <Text variant="18-bold" style={s.doneTitle}>
        순찰 경로를 저장했어요
      </Text>
      <Text variant="13-regular" color="textSub" style={s.doneBody}>
        {next ? `${next} 순찰부터 Jubi가 이 경로로 돌아요` : '시간표를 켜면 Jubi가 이 경로로 돌아요'}
      </Text>
      <View style={s.summary}>
        {rows.map(([k, v]) => (
          <View key={k} style={s.summaryRow}>
            <Text variant="13-regular" color="textSub">
              {k}
            </Text>
            <Text variant="13-regular" style={s.summaryValue}>
              {v}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="13-regular" color="textSub" style={s.mt20}>
        {'지도 > 경로 편집에서 언제든 바꿀 수 있어요'}
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  textCol: { flex: 1, gap: 2 },
  textColLoose: { flex: 1, gap: 3 },
  flexMt8: { flex: 1, marginTop: space[8] },
  mt4: { marginTop: space[4] },
  mt20: { marginTop: space[20] },
  p12: { padding: space[12] },
  padX: { paddingHorizontal: layout.screenPadding },
  padTop: { paddingHorizontal: layout.screenPadding, paddingTop: space[12] },
  iconCol: { width: layout.touchMin, alignItems: 'center' },
  doneTitle: { marginTop: 22 }, // Figma 완료 화면 간격 (토큰 없음)
  doneBody: { marginTop: 18 },
  summaryValue: { flexShrink: 1, textAlign: 'right' },
  fill: { flex: 1 },
  mapBox: { height: MAP_HEIGHT },
  mapPlaceholder: { backgroundColor: colors.map, overflow: 'hidden', alignItems: 'center' },
  placeholderImage: { opacity: 0.35 },
  pad: { paddingHorizontal: space[24], paddingTop: space[24], paddingBottom: space[24], gap: space[16] },
  padTight: { paddingHorizontal: space[24], paddingTop: space[8] },
  guideCard: { backgroundColor: colors.card, borderRadius: radius[16], padding: space[16], gap: 14 },
  guideRow: { flexDirection: 'row', gap: space[12], alignItems: 'flex-start' },
  guideNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    marginTop: space[4],
    backgroundColor: colors.bgBrandSoft,
    borderRadius: radius[16],
    padding: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
  },
  searchInputFilled: { fontFamily: typography['15-bold'].fontFamily },
  searchInput: {
    flex: 1,
    ...typography['15-regular'],
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
    gap: space[8],
  },
  results: { backgroundColor: colors.card, borderRadius: radius[16], padding: 6, gap: 2 },
  result: { flexDirection: 'row', alignItems: 'center', gap: space[12], padding: 10, borderRadius: 12 },
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
    paddingHorizontal: space[12],
    paddingVertical: space[8],
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
  parkLabel: { backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: space[8], paddingVertical: space[4] },
  legendCard: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingHorizontal: space[12],
    paddingVertical: space[8],
    gap: space[4],
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space[12], paddingVertical: 6 },
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
    borderRadius: radius[16],
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
    paddingHorizontal: space[24],
    paddingTop: space[20],
    paddingBottom: space[12],
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
    marginTop: space[24],
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[16],
    gap: space[16],
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space[16] },
});
