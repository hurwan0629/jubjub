// A-04 순찰 경로 편집. A-02 지도의 "경로 편집"으로 들어와요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { saveRouteConfig } from '@/api/route';
import type { LatLng, PatrolPoint, RouteConfig } from '@/api/types';
import {
  AddTimeSheet,
  Button,
  Header,
  Icon,
  MapHint,
  ParkMap,
  PointList,
  PointNameSheet,
  ScheduleList,
  Text,
} from '@/components';
import type { ParkMapMarker } from '@/components';
import { useRouteConfig } from '@/hooks/useRoute';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { lapMinutes, loopPath, moveItem, nextPatrolTime, REPEAT_LABEL } from '@/utils/route';

type Props = NativeStackScreenProps<RootParams, 'RouteEdit'>;
type Tab = 'route' | 'schedule';

const MAP_HEIGHT = 290;
const NOTICE_MS = 2500;
const TOAST_MS = 1600;

export function RouteEditScreen({ navigation }: Props) {
  const { data } = useRouteConfig();

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="순찰 경로 편집" onBack={() => navigation.goBack()} />
      {/* 불러온 경로를 고쳐 쓰는 편집기. 처음 불러온 값으로 한 번만 시작해요. */}
      {data ? <RouteEditor initial={data} onDone={() => navigation.goBack()} /> : <View style={s.flex} />}
    </SafeAreaView>
  );
}

function RouteEditor({ initial, onDone }: { initial: RouteConfig; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('route');
  const [draft, setDraft] = useState<RouteConfig>(initial);
  const [pending, setPending] = useState<LatLng | null>(null);
  const [addingTime, setAddingTime] = useState(false);
  const [blocked, setBlocked] = useState(false); // 공원 밖을 꾹 눌렀을 때 경고
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const setPoints = (points: PatrolPoint[]) => setDraft((d) => ({ ...d, points }));

  const markers: ParkMapMarker[] = [
    ...(draft.station
      ? [{ id: 'station', kind: 'station' as const, position: draft.station, label: '분리수거장' }]
      : []),
    ...draft.points.map((p, i) => ({
      id: p.id,
      kind: 'point' as const,
      position: p.position,
      label: p.name,
      order: i + 1,
    })),
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveRouteConfig(draft);
      const next = nextPatrolTime(draft.schedule);
      setToast(next ? `경로를 저장했어요 · ${next} 순찰부터 적용돼요` : '경로를 저장했어요');
      later(onDone, TOAST_MS);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.flex}>
      {/* 경로 편집 · 시간표 설정 */}
      <View style={s.tabs} accessibilityRole="tablist">
        {(
          [
            ['route', '경로 편집'],
            ['schedule', '시간표 설정'],
          ] as const
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              style={[s.tab, on ? s.tabOn : null]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text variant="14-bold" color={on ? 'brandText' : 'textSub'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'route' ? (
        <ScrollView contentContainerStyle={s.scroll}>
          <ParkMap
            style={s.map}
            bounds={draft.bounds}
            area={draft.area}
            markers={markers}
            route={loopPath(draft.points, draft.station)}
            onLongPress={(p) => {
              setBlocked(false);
              setPending(p);
            }}
            onLongPressOutside={() => {
              setBlocked(true);
              later(() => setBlocked(false), NOTICE_MS);
            }}
          />
          {blocked ? (
            <MapHint tone="error" text="로봇이 갈 수 없는 위치예요" />
          ) : (
            <MapHint text="지도를 꾹 눌러 지점을 추가할 수 있어요" />
          )}
          <View style={s.listHead}>
            <Text variant="17-bold">순찰 지점</Text>
            <Text variant="12-regular" color="textSub">
              {draft.points.length}개 지점 · 약 {lapMinutes(draft.points, draft.station)}분
            </Text>
          </View>
          <View style={s.padded}>
            <PointList
              points={draft.points}
              showStay
              reorder
              onRemove={(i) => setPoints(draft.points.filter((_, j) => j !== i))}
              onMove={(from, to) => setPoints(moveItem(draft.points, from, to))}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[s.scroll, s.padded, s.scheduleTop]}>
          <ScheduleList
            slots={draft.schedule}
            onChange={(schedule) => setDraft((d) => ({ ...d, schedule }))}
            onAddPress={() => setAddingTime(true)}
          />
        </ScrollView>
      )}

      {/* 저장 완료 알림 */}
      {toast ? (
        <View style={s.toast} accessibilityLiveRegion="polite">
          <View style={s.toastIcon}>
            <Icon source={icons.check} size={14} />
          </View>
          <Text variant="13-semibold" color="card" style={s.flexShrink}>
            {toast}
          </Text>
        </View>
      ) : null}

      {/* 취소 · 저장하기 */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, space[12]) }]}>
        <View style={s.cancel}>
          <Button label="취소" variant="soft" onPress={onDone} />
        </View>
        <View style={s.flex}>
          <Button label="저장하기" disabled={saving || !!toast || draft.points.length === 0} onPress={handleSave} />
        </View>
      </View>

      <PointNameSheet
        visible={!!pending}
        order={draft.points.length + 1}
        onCancel={() => setPending(null)}
        onSubmit={(name) => {
          if (pending) setPoints([...draft.points, { id: `p${Date.now()}`, name, position: pending, stay: 2 }]);
          setPending(null);
        }}
      />
      <AddTimeSheet
        visible={addingTime}
        onCancel={() => setAddingTime(false)}
        onSubmit={({ time, repeat }) => {
          const slot = { id: `s${Date.now()}`, time, repeat, on: true, label: `${REPEAT_LABEL[repeat]} 순찰` };
          setDraft((d) => ({ ...d, schedule: [...d.schedule, slot].sort((a, b) => a.time.localeCompare(b.time)) }));
          setAddingTime(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: layout.screenPadding,
    marginVertical: space[12],
    padding: space[4],
    borderRadius: radius[16],
    backgroundColor: colors.bgDisabled,
  },
  tab: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.card, ...softShadow },
  scroll: { paddingBottom: space[24] },
  padded: { paddingHorizontal: layout.screenPadding },
  scheduleTop: { paddingTop: space[8] },
  map: { height: MAP_HEIGHT },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[20],
    paddingBottom: space[12],
  },
  toast: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    bottom: 100,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.text,
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
  },
  toastIcon: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    backgroundColor: colors.card,
    paddingTop: space[12],
    paddingHorizontal: layout.screenPadding,
    flexDirection: 'row',
    gap: 10,
  },
  cancel: { width: 106 },
});
