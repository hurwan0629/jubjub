import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Txt } from '@/components';
import { icons } from '@/icons';
import { colors, font, radius } from '@/theme';

import { ParkMap, Pt } from './ParkMap';
import { InfoBar, lapMinutes, PointList, RoutePoint } from './parts';

/* ---------- 1. 안내 ---------- */
const GUIDE = [
  ['공원 찾기', '검색해서 Jubi가 일할 공원으로 이동해요'],
  ['분리수거장 위치', 'Jubi가 칸을 비우러 갈 곳을 1곳 정해요'],
  ['순찰 지점 찍기', '지도를 꾹 눌러 지점을 추가하고 이름을 붙여요'],
  ['순서와 머무는 시간', '돌 순서와 지점마다 머무는 시간을 정해요'],
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
              <Txt size={13} lineHeight={1.5} color={colors.brandText}>
                {i + 1}
              </Txt>
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
export type Park = { name: string; address: string; distance: string };
const PARKS: Park[] = [
  { name: '한강공원', address: '서울 영등포구 여의동로 330', distance: '2.1km' },
  { name: '반포한강공원', address: '서울 서초구 신반포로11길 40', distance: '6.8km' },
  { name: '뚝섬한강공원', address: '서울 광진구 강변북로 139', distance: '12.4km' },
];

export function StepPark({ park, onPick }: { park: Park | null; onPick: (p: Park | null) => void }) {
  const [query, setQuery] = useState(park?.name ?? '');
  const q = query.trim();
  const results = q ? PARKS.filter((p) => p.name.includes(q) || p.address.includes(q)) : [];

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
            onPress={() => {
              // 위치 권한 연동 전까지는 가장 가까운 공원을 보여 줘요
              setQuery('한강');
              onPick(PARKS[0]);
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
                  const on = park?.name === p.name;
                  return (
                    <Pressable
                      key={p.name}
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
        <ParkMap height={500} faded={!park}>
          {park ? (
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
          ) : (
            <View style={st.mapChip} pointerEvents="none">
              <Icon source={icons.searchSmall} size={14} />
              <Txt size={12} weight="semibold" color={colors.brandText}>
                공원을 찾으면 지도가 그곳으로 이동해요
              </Txt>
            </View>
          )}
        </ParkMap>
      </View>
    </View>
  );
}

/* ---------- 3. 분리수거장 위치 (지도를 꾹 눌러 정해요) ---------- */
export function StepRecycle({ recycle, onSet }: { recycle: Pt | null; onSet: (p: Pt) => void }) {
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
      <ParkMap height={290} recycle={recycle} recycleLabel onLongPress={onSet} />
      <InfoBar
        text={recycle ? '다른 곳을 꾹 누르면 위치를 옮길 수 있어요' : '지도를 꾹 눌러 분리수거장 위치를 찍어요'}
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
                <Txt size={14} weight="bold" color={colors.card}>
                  1
                </Txt>
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
const QUICK_NAMES = ['정문', '화장실 앞', '놀이터'];

export function StepPoints({
  points,
  recycle,
  onAdd,
  onRemove,
}: {
  points: RoutePoint[];
  recycle: Pt | null;
  onAdd: (p: RoutePoint) => void;
  onRemove: (i: number) => void;
}) {
  const [pending, setPending] = useState<Pt | null>(null);
  const [name, setName] = useState('');
  const insets = useSafeAreaInsets();
  const close = () => {
    setPending(null);
    setName('');
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
        <ParkMap height={290} recycle={recycle} points={points} onLongPress={(p) => setPending(p)} />
        <InfoBar text="지도를 꾹 눌러 순찰 지점을 추가해요" />
        <View style={st.listHead}>
          <Txt size={17} weight="bold">
            순찰 지점
          </Txt>
          <Txt size={12} color={colors.textSub}>
            {points.length}개 지점 · 약 {lapMinutes(points, recycle)}분
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 24 }}>
          <PointList points={points} showStay onRemove={onRemove} />
        </View>
      </ScrollView>

      {/* 지점 이름 정하기 */}
      <Modal visible={!!pending} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={st.sheetDim} onPress={close} accessibilityLabel="닫기" />
          <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <Txt size={18} weight="bold">
              {points.length + 1}번째 지점의 이름을 정해요
            </Txt>
            <Txt size={13} color={colors.textSub}>
              알림과 기록에 이 이름으로 보여요
            </Txt>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="예: 벤치 쉼터"
              placeholderTextColor={colors.textDisabled}
              style={st.nameInput}
              autoFocus
              maxLength={12}
              accessibilityLabel="지점 이름"
            />
            <Txt size={14} weight="bold">
              자주 쓰는 이름
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {QUICK_NAMES.map((n) => (
                <Pressable key={n} style={[st.quick, name === n ? st.quickOn : null]} onPress={() => setName(n)}>
                  <Txt size={13} weight="semibold" color={name === n ? colors.brandText : colors.textSub}>
                    {n}
                  </Txt>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable style={[st.sheetBtn, { backgroundColor: colors.bgBrandSoft }]} onPress={close}>
                <Txt size={15} weight="bold" color={colors.brandText}>
                  취소
                </Txt>
              </Pressable>
              <Pressable
                style={[st.sheetBtn, { backgroundColor: name.trim() ? colors.brand : colors.bgDisabled }]}
                disabled={!name.trim()}
                onPress={() => {
                  if (!pending) return;
                  onAdd({ ...pending, name: name.trim(), stay: 2 });
                  close();
                }}
              >
                <Txt size={15} weight="bold" color={name.trim() ? colors.card : colors.textDisabled}>
                  지점 추가
                </Txt>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

/* ---------- 5. 순서 ---------- */
export function StepOrder({
  points,
  recycle,
  onMove,
  onRemove,
}: {
  points: RoutePoint[];
  recycle: Pt | null;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
      <ParkMap height={290} recycle={recycle} points={points} route />
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
export type Slot = { id: string; time: string; label: string; on: boolean };

export function StepSchedule({ slots, onChange }: { slots: Slot[]; onChange: (s: Slot[]) => void }) {
  const add = () => {
    const last = slots[slots.length - 1]?.time ?? '09:00';
    const [h, m] = last.split(':').map(Number);
    const time = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    onChange([...slots, { id: String(Date.now()), time, label: '추가 순찰', on: true }]);
  };
  return (
    <ScrollView contentContainerStyle={[st.padTight, { gap: 12, paddingTop: 16 }]}>
      <View style={st.listHeadInline}>
        <Txt size={17} weight="bold">
          순찰 시간표
        </Txt>
        <Txt size={12} color={colors.textSub}>
          {slots.length}개 항목
        </Txt>
      </View>
      {slots.map((s) => (
        <View key={s.id} style={st.slot}>
          <Switch
            value={s.on}
            onValueChange={(on) => onChange(slots.map((x) => (x.id === s.id ? { ...x, on } : x)))}
            trackColor={{ true: colors.brand, false: colors.bgDisabled }}
            thumbColor={colors.card}
            {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.card } as object) : {})}
            accessibilityLabel={`${s.time} 순찰 켜기`}
          />
          <View style={st.timeChip}>
            <Txt size={15} weight="bold" color={s.on ? colors.brandText : colors.textDisabled}>
              {s.time}
            </Txt>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={13} weight="bold" color={s.on ? colors.text : colors.textDisabled}>
              전체 경로
            </Txt>
            <Txt size={12} color={colors.textSub}>
              {s.label}
            </Txt>
          </View>
          <Icon source={icons.pencil} size={22} />
        </View>
      ))}
      <Pressable style={st.addSlot} onPress={add} accessibilityRole="button">
        <Txt size={15} weight="bold" color={colors.card}>
          + 순찰 시간 추가
        </Txt>
      </Pressable>
    </ScrollView>
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
  points: RoutePoint[];
  recycle: Pt | null;
  slots: Slot[];
}) {
  const on = slots
    .filter((s) => s.on)
    .map((s) => s.time)
    .sort();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const next = on.find((t) => t > hhmm) ?? on[0];
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
  listHeadInline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetDim: { flex: 1, backgroundColor: colors.overlaySoft },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 14,
  },
  nameInput: {
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    fontSize: 20,
    fontFamily: font.bold,
    color: colors.brandText,
    outlineStyle: 'none',
  } as object,
  quick: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickOn: { borderColor: colors.brand, backgroundColor: colors.bgBrandSoft },
  sheetBtn: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  slot: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timeChip: {
    backgroundColor: colors.bgBrandSoft,
    borderRadius: 12,
    width: 64,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlot: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
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
