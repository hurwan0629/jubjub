import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { completeRouteSetup, saveRouteConfig } from '@/api/route';
import type { Station } from '@/api/stations';
import type { LatLng, PatrolPoint, PatrolSlot, RouteConfig } from '@/api/types';
import { Button, Header, Text } from '@/components';
import { PatrolRobotScope } from '@/components/PatrolRobotScope';
import { useManagedPark } from '@/hooks/useOnboarding';
import { usePatrolRobots, useReferenceRoutes, useRouteConfig } from '@/hooks/useRoute';
import { useStations } from '@/hooks/useStations';
import type { RootParams } from '@/navigation';
import { colors, layout, space } from '@/theme';
import { moveItem } from '@/utils/route';

import { Footer, Progress } from './parts';
import { StepChooseStation, StepStations } from './stationSteps';
import type { ReferenceRoute } from './steps';
import { StepDone, StepIntro, StepOrder, StepPoints, StepSchedule } from './steps';

/**
 * 단계: 안내 → (공원 분리수거장 등록) → 쓸 분리수거장 고르기 → 순찰 지점 → 순서 → 시간표 → 완료.
 * 공원에 분리수거장이 이미 있으면(두 번째 로봇부터) 등록 단계는 건너뛰어요 (C-03 Jubi 2 - 분리수거장 공통).
 */
type StepKey = 'intro' | 'register' | 'choose' | 'points' | 'order' | 'schedule' | 'done';
const LABEL: Record<StepKey, string> = {
  intro: '시작하기',
  register: '공원 분리수거장 등록',
  choose: '쓸 분리수거장 고르기',
  points: '순찰 지점 찍기',
  order: '순서',
  schedule: '순찰 시간표',
  done: '설정 완료',
};
const DEFAULT_SLOTS: PatrolSlot[] = [
  { id: '1', time: '10:00', label: '매일 순찰', on: true, repeat: 'daily' },
  { id: '2', time: '13:00', label: '점심 시간 순찰', on: true, repeat: 'daily' },
  { id: '3', time: '17:00', label: '저녁 시간 순찰', on: true, repeat: 'daily' },
  { id: '4', time: '21:10', label: '야간 점검', on: true, repeat: 'daily' },
];

/** C-03 승인된 공원의 순찰 경로 처음 설정 (5단계). */
type Props = NativeStackScreenProps<RootParams, 'RouteSetup'>;

export function RouteSetupScreen(props: Props) {
  return (
    <PatrolRobotScope fixedRobotId={props.route.params?.robotId} onMissing={() => props.navigation.goBack()}>
      {(robotId, setBusy) => <RobotRouteSetup {...props} robotId={robotId} setBusy={setBusy} />}
    </PatrolRobotScope>
  );
}

function RobotRouteSetup({
  navigation,
  robotId,
  setBusy,
}: Props & { robotId?: string; setBusy: (busy: boolean) => void }) {
  const { data: initial, error, reload } = useRouteConfig(robotId);
  const { data: stations, error: stationError, reload: reloadStations } = useStations();
  const { data: references } = useReferenceRoutes(robotId);
  const { data: robots } = usePatrolRobots();
  const failed = error ?? stationError;
  if (!initial || !stations || failed)
    return (
      <View style={s.message}>
        <Text variant="13-regular" color={failed ? 'error' : 'textSub'}>
          {failed?.message ?? '순찰 설정을 불러오고 있어요…'}
        </Text>
        {failed ? (
          <Button
            label="다시 불러오기"
            onPress={() => {
              reload();
              reloadStations();
            }}
          />
        ) : null}
      </View>
    );
  return (
    <SetupWizard
      navigation={navigation}
      initial={initial}
      initialStations={stations}
      references={references ?? []}
      robotName={robots?.find((r) => r.id === robotId)?.name ?? 'Jubi'}
      robotId={robotId}
      setBusy={setBusy}
    />
  );
}

function SetupWizard({
  navigation,
  robotId,
  setBusy,
  initial,
  initialStations,
  references,
  robotName,
}: Pick<Props, 'navigation'> & {
  robotId?: string;
  setBusy: (busy: boolean) => void;
  initial: RouteConfig;
  initialStations: Station[];
  references: ReferenceRoute[];
  robotName: string;
}) {
  const { data: managed, error: loadError, loading, reload } = useManagedPark();
  const [stations, setStations] = useState<Station[]>(initialStations);
  // 처음 열 때 공원에 분리수거장이 없으면 등록 단계부터 (두 번째 로봇부터는 건너뛰어요)
  const [registerFirst] = useState(initialStations.length === 0);
  const steps: StepKey[] = [
    'intro',
    ...(registerFirst ? (['register'] as const) : []),
    'choose',
    'points',
    'order',
    'schedule',
  ];
  const [index, setIndex] = useState(0);
  const step: StepKey = index >= steps.length ? 'done' : steps[index];
  // 쓸 분리수거장: 저장된 기본 분리수거장 → 같은 위치 → 하나뿐이면 그곳
  const [stationId, setStationId] = useState<string | undefined>(
    initial.defaultStationId ??
      initialStations.find(
        (st) =>
          st.position.latitude === initial.station?.latitude && st.position.longitude === initial.station?.longitude,
      )?.id ??
      (initialStations.length === 1 ? initialStations[0].id : undefined),
  );
  const chosen = stations.find((st) => st.id === stationId);
  const recycle: LatLng | null = chosen?.position ?? null;
  const [points, setPoints] = useState<PatrolPoint[]>(initial.points);
  const [slots, setSlots] = useState<PatrolSlot[]>(initial.schedule.length ? initial.schedule : DEFAULT_SLOTS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const park = managed ? { ...managed, id: managed.catalogId, distance: '' } : null;
  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  // 홈의 "jubi의 경로를 정해주세요" 버튼에서 들어와요. 첫 단계에서 뒤로 가면 홈으로 돌아가요.
  const exit = () => (navigation.canGoBack() ? navigation.goBack() : goHome());
  const prev = () => {
    if (saving) return;
    setError(undefined);
    if (index === 0) exit();
    else setIndex(index - 1);
  };
  const next = async () => {
    if (saving || !park) return;
    setError(undefined);
    if (step !== 'schedule') {
      setIndex(index + 1);
      return;
    }
    if (!recycle) return;
    setSaving(true);
    setBusy(true);
    try {
      await saveRouteConfig({
        catalogId: initial.catalogId,
        robotId,
        parkName: park.name,
        bounds: park.bounds,
        area: park.area,
        defaultStationId: chosen?.id ?? null,
        station: recycle,
        points,
        schedule: slots,
      });
      // 서버가 분리수거장 · 지점 · 시간표가 모두 저장됐는지 확인하고 처음 설정을 끝내요
      await completeRouteSetup(robotId, initial.catalogId);
      setIndex(steps.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : '경로를 저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!park || managed?.status !== 'approved' || loadError) {
    body = (
      <View style={s.message}>
        <Text variant="15-bold">
          {loadError?.message ?? (loading ? '공원 정보를 불러오고 있어요…' : '공원 승인 후 순찰 경로를 정할 수 있어요')}
        </Text>
        {!loading ? (
          <>
            <Button label="다시 불러오기" onPress={reload} />
            <Button label="홈으로" variant="soft" onPress={exit} />
          </>
        ) : null}
      </View>
    );
  } else {
    switch (step) {
      case 'intro':
        body = <StepIntro />;
        footer = <Footer nextLabel="시작하기" onNext={next} />;
        break;
      case 'register':
        body = (
          <StepStations
            bounds={park.bounds}
            area={park.area}
            catalogId={initial.catalogId}
            stations={stations}
            onChange={(list) => {
              setStations(list);
              if (!list.some((st) => st.id === stationId)) setStationId(list.length === 1 ? list[0].id : undefined);
            }}
          />
        );
        footer = <Footer onPrev={prev} nextDisabled={stations.length === 0} onNext={next} />;
        break;
      case 'choose':
        body = (
          <StepChooseStation
            bounds={park.bounds}
            area={park.area}
            robotName={robotName}
            stations={stations}
            selectedId={stationId}
            onSelect={(st) => setStationId(st.id)}
          />
        );
        footer = <Footer onPrev={prev} nextDisabled={!chosen} onNext={next} />;
        break;
      case 'points':
        body = (
          <StepPoints
            bounds={park.bounds}
            area={park.area}
            points={points}
            recycle={recycle}
            references={references}
            onAdd={(p) => setPoints((ps) => [...ps, p])}
            onRemove={(i) => setPoints((ps) => ps.filter((_, j) => j !== i))}
          />
        );
        footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
        break;
      case 'order':
        body = (
          <StepOrder
            bounds={park.bounds}
            area={park.area}
            points={points}
            recycle={recycle}
            onMove={(from, to) => setPoints((ps) => moveItem(ps, from, to))}
            onRemove={(i) => setPoints((ps) => ps.filter((_, j) => j !== i))}
          />
        );
        footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
        break;
      case 'schedule':
        body = <StepSchedule slots={slots} onChange={setSlots} />;
        footer = (
          <Footer
            onPrev={saving ? undefined : prev}
            nextLabel={saving ? '저장 중…' : '완료'}
            nextDisabled={saving || slots.length === 0}
            onNext={next}
          />
        );
        break;
      default:
        body = <StepDone park={park} points={points} recycle={recycle} slots={slots} />;
        footer = <Footer nextLabel="홈으로 가기" onNext={goHome} />;
    }
  }
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title={`${robotName} 순찰 경로 정하기`} onBack={saving ? undefined : step === 'done' ? goHome : prev} />
      <Progress step={index + 1} total={steps.length} label={LABEL[step]} />
      <View style={s.flex} pointerEvents={saving ? 'none' : 'auto'}>
        {body}
      </View>
      {error ? (
        <Text variant="13-regular" color="error" style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {footer}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  message: { padding: layout.screenPadding, gap: space[16] },
  error: { paddingHorizontal: layout.screenPadding, paddingVertical: space[8] },
});
