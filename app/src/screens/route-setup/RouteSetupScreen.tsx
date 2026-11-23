import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveRouteConfig } from '@/api/route';
import type { LatLng, PatrolPoint, PatrolSlot, RouteConfig } from '@/api/types';
import { Button, Header, Text } from '@/components';
import { PatrolRobotScope } from '@/components/PatrolRobotScope';
import { useManagedPark } from '@/hooks/useOnboarding';
import { useRouteConfig } from '@/hooks/useRoute';
import type { RootParams } from '@/navigation';
import { colors, layout, space } from '@/theme';
import { moveItem } from '@/utils/route';

import { Footer, Progress } from './parts';
import { StepDone, StepIntro, StepOrder, StepPoints, StepRecycle, StepSchedule } from './steps';

const LABELS = ['시작하기', '분리수거장 위치', '순찰 지점 찍기', '순서', '순찰 시간표', '설정 완료'];
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
    <PatrolRobotScope>
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
  if (!initial || error)
    return (
      <View style={s.message}>
        <Text variant="13-regular" color={error ? 'error' : 'textSub'}>
          {error?.message ?? '순찰 설정을 불러오고 있어요…'}
        </Text>
        {error ? <Button label="다시 불러오기" onPress={reload} /> : null}
      </View>
    );
  return <SetupWizard navigation={navigation} initial={initial} robotId={robotId} setBusy={setBusy} />;
}

function SetupWizard({
  navigation,
  robotId,
  setBusy,
  initial,
}: Pick<Props, 'navigation'> & {
  robotId?: string;
  setBusy: (busy: boolean) => void;
  initial: RouteConfig;
}) {
  const { data: managed, error: loadError, loading, reload } = useManagedPark();
  const [step, setStep] = useState(1);
  const [recycle, setRecycle] = useState<LatLng | null>(initial.station);
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
    if (step === 1) exit();
    else setStep(step - 1);
  };
  const next = async () => {
    if (saving || !park) return;
    setError(undefined);
    if (step < 5) {
      setStep(step + 1);
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
        station: recycle,
        points,
        schedule: slots,
      });
      setStep(6);
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
      case 1:
        body = <StepIntro />;
        footer = <Footer nextLabel="시작하기" onNext={next} />;
        break;
      case 2:
        body = (
          <StepRecycle bounds={park.bounds} area={park.area} recycle={recycle} points={points} onSet={setRecycle} />
        );
        footer = <Footer onPrev={prev} nextDisabled={!recycle} onNext={next} />;
        break;
      case 3:
        body = (
          <StepPoints
            bounds={park.bounds}
            area={park.area}
            points={points}
            recycle={recycle}
            onAdd={(p) => setPoints((ps) => [...ps, p])}
            onRemove={(i) => setPoints((ps) => ps.filter((_, j) => j !== i))}
          />
        );
        footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
        break;
      case 4:
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
      case 5:
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
      <Header title="순찰 경로 정하기" onBack={saving ? undefined : step === 6 ? goHome : prev} />
      <Progress step={step} label={LABELS[step - 1]} />
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
