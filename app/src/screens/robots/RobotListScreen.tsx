// 로봇 목록. 배정된 로봇별 편집으로 연결해요. Page 5 디자인 대조는 대기 중이에요.
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Header, Icon, Text } from '@/components';
import { usePatrolRobots } from '@/hooks/useRoute';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, space } from '@/theme';

const STATUS = {
  idle: '대기',
  working: '순찰 중',
  emptying: '비우는 중',
  offline: '연결 끊김',
  error: '오류',
};

export function RobotListScreen({ navigation }: NativeStackScreenProps<RootParams, 'RobotList'>) {
  const { data: robots, error, reload } = usePatrolRobots();
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="로봇 목록" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.content}>
        <Text variant="17-bold">배정된 로봇 {robots?.length ?? 0}대</Text>
        {error ? (
          <>
            <Text variant="13-regular" color="error">
              {error.message}
            </Text>
            <Button label="다시 불러오기" onPress={reload} />
          </>
        ) : !robots ? (
          <Text variant="13-regular">로봇을 불러오고 있어요…</Text>
        ) : robots.length === 0 ? (
          <Text variant="13-regular" color="textSub">
            배정된 로봇이 없어요. 총관리자에게 로봇 배정을 요청해 주세요.
          </Text>
        ) : (
          robots.map((robot) => (
            <Card key={robot.id} style={s.card}>
              <View style={s.row}>
                <Icon source={icons.bot} size={28} />
                <View style={s.info}>
                  <Text variant="18-bold">{robot.name}</Text>
                  <Text variant="12-regular" color="textSub">
                    {robot.serialNo}
                  </Text>
                </View>
                <Text variant="12-semibold" color="brandText">
                  {STATUS[robot.status]}
                </Text>
              </View>
              <Text variant="12-regular" color="textSub">
                {robot.batteryVoltage == null
                  ? '배터리 정보 수신 대기'
                  : `배터리 전압 ${robot.batteryVoltage.toFixed(1)} V`}
              </Text>
              <Button
                label="편집"
                variant="soft"
                onPress={() => navigation.navigate('RobotEdit', { robotId: robot.id })}
              />
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPadding, gap: space[16] },
  card: { padding: space[20], gap: space[16] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  info: { flex: 1, gap: space[4] },
});
