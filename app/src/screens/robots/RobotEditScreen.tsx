// 로봇 편집. 선택한 로봇의 이름과 순찰 설정을 각각 수정해요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { renamePatrolRobot } from '@/api/route';
import type { AssignedRobot } from '@/api/types';
import { Button, Card, Header, Text } from '@/components';
import { usePatrolRobot } from '@/hooks/useRoute';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, space, typography } from '@/theme';

type Props = NativeStackScreenProps<RootParams, 'RobotEdit'>;

export function RobotEditScreen({ route, navigation }: Props) {
  const { data: robot, error, reload } = usePatrolRobot(route.params.robotId);
  if (robot?.id === route.params.robotId && !error)
    return <RobotEditor key={robot.id} robot={robot} navigation={navigation} onSaved={reload} />;
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="로봇 편집" onBack={() => navigation.goBack()} />
      <View style={s.content}>
        <Text variant="13-regular" color={error ? 'error' : 'textSub'}>
          {error?.message ?? '로봇 정보를 불러오고 있어요…'}
        </Text>
        {error ? <Button label="다시 불러오기" onPress={reload} /> : null}
      </View>
    </SafeAreaView>
  );
}

function RobotEditor({
  robot,
  navigation,
  onSaved,
}: {
  robot: AssignedRobot;
  navigation: Props['navigation'];
  onSaved: () => void;
}) {
  const [name, setName] = useState(robot.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const trimmed = name.trim();
  const saveName = async () => {
    if (saving || !trimmed || trimmed.length > 100) return;
    setSaving(true);
    setError(undefined);
    setSaved(false);
    try {
      const updated = await renamePatrolRobot(robot.id, trimmed);
      setName(updated.name);
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '이름을 저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header
        title="로봇 편집"
        onBack={() => {
          if (!saving) navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text variant="18-bold">{robot.name}</Text>
        <Text variant="12-regular" color="textSub">
          {robot.serialNo}
        </Text>
        <Card style={s.card}>
          <Text variant="17-bold">이름 수정</Text>
          <TextInput
            accessibilityLabel="로봇 이름"
            value={name}
            editable={!saving}
            maxLength={100}
            onChangeText={(value) => {
              setName(value);
              setSaved(false);
              setError(undefined);
            }}
            style={s.input}
            placeholder="로봇 이름을 입력해 주세요"
            placeholderTextColor={colors.textDisabled}
          />
          <Text variant="12-regular" color="textSub">
            이름을 1~100자로 입력해 주세요. 앞뒤 공백은 제외해요.
          </Text>
          {error ? (
            <Text variant="13-regular" color="error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          {saved ? (
            <Text variant="13-regular" color="brandText" accessibilityLiveRegion="polite">
              이름을 저장했어요.
            </Text>
          ) : null}
          <Button
            label={saving ? '저장 중…' : '이름 저장'}
            disabled={saving || !trimmed || trimmed === robot.name}
            onPress={saveName}
          />
        </Card>
        <Card style={s.card}>
          <Text variant="17-bold">순찰 설정</Text>
          <Text variant="13-regular" color="textSub">
            이 로봇의 순찰 지점과 시간표를 수정해요.
          </Text>
          <Button
            label="경로 편집"
            variant="soft"
            disabled={saving}
            onPress={() => navigation.navigate('RouteEdit', { robotId: robot.id })}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: layout.screenPadding, gap: space[16] },
  card: { padding: space[20], gap: space[16] },
  input: {
    ...typography['15-regular'],
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius[16],
    minHeight: 52,
    paddingHorizontal: space[16],
  },
});
