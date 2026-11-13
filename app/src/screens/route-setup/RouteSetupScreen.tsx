import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { completeRouteSetup } from '@/api/auth';
import type { LatLng, Park, PatrolPoint, PatrolSlot } from '@/api/types';
import { Header } from '@/components';
import type { RootParams } from '@/navigation';
import { colors } from '@/theme';
import { moveItem } from '@/utils/route';

import { Footer, Progress } from './parts';
import { StepDone, StepIntro, StepOrder, StepPark, StepPoints, StepRecycle, StepSchedule } from './steps';

const LABELS = ['시작하기', '공원 찾기', '분리수거장 위치', '순찰 지점 찍기', '순서', '순찰 시간표', '설정 완료'];

const DEFAULT_SLOTS: PatrolSlot[] = [
  { id: '1', time: '10:00', label: '매일 순찰', on: true, repeat: 'daily' },
  { id: '2', time: '13:00', label: '점심 시간 순찰', on: true, repeat: 'daily' },
  { id: '3', time: '17:00', label: '저녁 시간 순찰', on: true, repeat: 'daily' },
  { id: '4', time: '21:10', label: '야간 점검', on: true, repeat: 'daily' },
];

/** C-03 순찰 경로 처음 설정 (가입 후 첫 로그인 때만 보여요) */
export function RouteSetupScreen({ navigation }: NativeStackScreenProps<RootParams, 'RouteSetup'>) {
  const [step, setStep] = useState(1);
  const [park, setPark] = useState<Park | null>(null);
  const [recycle, setRecycle] = useState<LatLng | null>(null);
  const [points, setPoints] = useState<PatrolPoint[]>([]);
  const [slots, setSlots] = useState<PatrolSlot[]>(DEFAULT_SLOTS);

  // 첫 로그인에서 왔으면 홈 탭을 새로 띄우고, 설정 > 공원 변경하기에서 왔으면 원래 홈 탭으로 돌아가요
  const goHome = () => navigation.popTo('Main');
  const prev = () => (step === 1 ? goHome() : setStep(step - 1));
  const next = () => {
    // 마지막 단계(완료 화면)로 넘어가면 처음 설정을 끝낸 거예요. 다음 로그인부터 A-01 홈으로 가요
    if (step + 1 === 7) completeRouteSetup().catch(() => {});
    setStep(step + 1);
  };
  // 다른 공원을 고르면 그 공원 범위 밖의 위치가 남지 않도록 분리수거장 · 지점을 비워요
  const pickPark = (p: Park | null) => {
    if (p?.id !== park?.id) {
      setRecycle(null);
      setPoints([]);
    }
    setPark(p);
  };
  // 3~5단계 지도는 고른 공원 경계 안에서만 위치를 찍어요 (2단계에서 공원을 골라야 다음으로 가요)
  const removePoint = (i: number) => setPoints((ps) => ps.filter((_, j) => j !== i));
  const movePoint = (from: number, to: number) => setPoints((ps) => moveItem(ps, from, to));

  let body: React.ReactNode;
  let footer: React.ReactNode;
  switch (step) {
    case 1:
      body = <StepIntro />;
      footer = <Footer nextLabel="시작하기" onNext={next} />;
      break;
    case 2:
      body = <StepPark park={park} onPick={pickPark} />;
      footer = (
        <Footer onPrev={prev} nextLabel={park ? '이 공원으로 정할게요' : '다음'} nextDisabled={!park} onNext={next} />
      );
      break;
    case 3:
      body = park ? <StepRecycle bounds={park.bounds} area={park.area} recycle={recycle} onSet={setRecycle} /> : null;
      footer = <Footer onPrev={prev} nextDisabled={!recycle} onNext={next} />;
      break;
    case 4:
      body = park ? (
        <StepPoints
          bounds={park.bounds}
          area={park.area}
          points={points}
          recycle={recycle}
          onAdd={(p) => setPoints((ps) => [...ps, p])}
          onRemove={removePoint}
        />
      ) : null;
      footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
      break;
    case 5:
      body = park ? (
        <StepOrder
          bounds={park.bounds}
          area={park.area}
          points={points}
          recycle={recycle}
          onMove={movePoint}
          onRemove={removePoint}
        />
      ) : null;
      footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
      break;
    case 6:
      body = <StepSchedule slots={slots} onChange={setSlots} />;
      footer = <Footer onPrev={prev} nextLabel="완료" onNext={next} />;
      break;
    default:
      body = <StepDone park={park} points={points} recycle={recycle} slots={slots} />;
      footer = <Footer nextLabel="홈으로 가기" onNext={goHome} />;
  }

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="순찰 경로 정하기" onBack={step === 7 ? goHome : prev} />
      <Progress step={step} label={LABELS[step - 1]} />
      <View style={s.flex}>{body}</View>
      {footer}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
});
