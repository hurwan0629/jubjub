import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components';
import type { RootParams } from '@/navigation';
import { colors } from '@/theme';

import type { Pt } from './ParkMap';
import { Footer, Progress, RoutePoint } from './parts';
import { Park, Slot, StepDone, StepIntro, StepOrder, StepPark, StepPoints, StepRecycle, StepSchedule } from './steps';

const LABELS = ['시작하기', '공원 찾기', '분리수거장 위치', '순찰 지점 찍기', '순서', '순찰 시간표', '설정 완료'];

const DEFAULT_SLOTS: Slot[] = [
  { id: '1', time: '10:00', label: '매일 순찰', on: true },
  { id: '2', time: '13:00', label: '점심 시간 순찰', on: true },
  { id: '3', time: '17:00', label: '저녁 시간 순찰', on: true },
  { id: '4', time: '21:10', label: '야간 점검', on: true },
];

/** C-03 순찰 경로 처음 설정 (가입 후 첫 로그인 때만 보여요) */
export function RouteSetupScreen({ navigation }: NativeStackScreenProps<RootParams, 'RouteSetup'>) {
  const [step, setStep] = useState(1);
  const [park, setPark] = useState<Park | null>(null);
  const [recycle, setRecycle] = useState<Pt | null>(null);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);

  const goHome = () => navigation.replace('Main');
  const prev = () => (step === 1 ? goHome() : setStep(step - 1));
  const next = () => setStep(step + 1);
  const removePoint = (i: number) => setPoints((ps) => ps.filter((_, j) => j !== i));
  const movePoint = (from: number, to: number) =>
    setPoints((ps) => {
      const copy = [...ps];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });

  let body: React.ReactNode;
  let footer: React.ReactNode;
  switch (step) {
    case 1:
      body = <StepIntro />;
      footer = <Footer nextLabel="시작하기" onNext={next} />;
      break;
    case 2:
      body = <StepPark park={park} onPick={setPark} />;
      footer = (
        <Footer onPrev={prev} nextLabel={park ? '이 공원으로 정할게요' : '다음'} nextDisabled={!park} onNext={next} />
      );
      break;
    case 3:
      body = <StepRecycle recycle={recycle} onSet={setRecycle} />;
      footer = <Footer onPrev={prev} nextDisabled={!recycle} onNext={next} />;
      break;
    case 4:
      body = (
        <StepPoints
          points={points}
          recycle={recycle}
          onAdd={(p) => setPoints((ps) => [...ps, p])}
          onRemove={removePoint}
        />
      );
      footer = <Footer onPrev={prev} nextDisabled={points.length === 0} onNext={next} />;
      break;
    case 5:
      body = <StepOrder points={points} recycle={recycle} onMove={movePoint} onRemove={removePoint} />;
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
    <SafeAreaView style={st.screen} edges={['top']}>
      <Header title="순찰 경로 정하기" onBack={step === 7 ? goHome : prev} />
      <Progress step={step} label={LABELS[step - 1]} />
      <View style={{ flex: 1 }}>{body}</View>
      {footer}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
