import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getPatrolRobots } from '@/api/route';
import { useApi } from '@/hooks/useApi';
import { colors, layout, space } from '@/theme';

import { Button } from './Button';
import { Header } from './Header';
import { Text } from './Text';

/** 대상 변경 시 편집기를 새로 열어 이전 로봇의 지점이 섞이지 않도록 해요. */
export function PatrolRobotScope({
  children,
  fixedRobotId,
  onMissing,
}: {
  children: (robotId: string | undefined, setBusy: (busy: boolean) => void) => ReactNode;
  fixedRobotId?: string;
  onMissing?: () => void;
}) {
  const { data: robots, error, reload } = useApi(() => getPatrolRobots(), []);
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const robotId = fixedRobotId ?? robots?.find((r) => r.id === selected)?.id ?? robots?.[0]?.id;
  if (robots && fixedRobotId && !robots.some((r) => r.id === fixedRobotId))
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <Header title="순찰 경로 편집" onBack={onMissing} />
        <View style={s.padded}>
          <Text variant="13-regular" color="error">
            이 로봇은 더 이상 공원에 배정되어 있지 않아요. 뒤로 돌아가 로봇 목록을 다시 확인해 주세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {!robots || error ? (
        <>
          {fixedRobotId ? <Header title="순찰 경로 편집" onBack={onMissing} /> : null}
          <View style={s.padded}>
            <Text variant="13-regular" color={error ? 'error' : 'textSub'}>
              {error?.message ?? '배정된 로봇을 불러오고 있어요…'}
            </Text>
            {error ? <Button label="다시 불러오기" onPress={reload} /> : null}
          </View>
        </>
      ) : (
        <>
          {robots.length > 0 && !fixedRobotId ? (
            <View style={s.padded}>
              <Text variant="13-regular">설정할 로봇</Text>
              <ScrollView horizontal contentContainerStyle={s.robots}>
                {robots.map((robot) => (
                  <Button
                    key={robot.id}
                    label={robot.name}
                    disabled={busy}
                    variant={robot.id === robotId ? 'primary' : 'soft'}
                    onPress={() => setSelected(robot.id)}
                  />
                ))}
              </ScrollView>
              {robots.length > 1 ? (
                <Text variant="13-regular" color="textSub">
                  로봇을 바꾸면 저장하지 않은 내용은 초기화돼요. 분리수거장 위치는 모든 로봇이 공유해요.
                </Text>
              ) : null}
            </View>
          ) : null}
          <Fragment key={robotId ?? 'draft'}>{children(robotId, setBusy)}</Fragment>
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { padding: layout.screenPadding, gap: space[8] },
  robots: { gap: space[8] },
});
