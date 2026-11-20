// A-12 운영 설정. 기준: Figma Page 5 "A-12 운영 설정"
// 로봇이 충전 · 분리수거장으로 갈 기준과 에이전트 일시 정지를 정해요. 저장하기를 눌러야 반영돼요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveOperationSettings } from '@/api/account';
import { ApiError } from '@/api/client';
import type { OperationSettings } from '@/api/types';
import { Button, Header, Icon, Slider, Text, Toggle } from '@/components';
import { useOperationSettings } from '@/hooks/useAccount';
import { useStations } from '@/hooks/useStations';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, space } from '@/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParams, 'OperationSettings'>,
  CompositeScreenProps<BottomTabScreenProps<TabParams>, NativeStackScreenProps<RootParams>>
>;

export function OperationSettingsScreen({ navigation }: Props) {
  const { data: saved } = useOperationSettings();
  const { data: stations } = useStations();
  // 고친 값만 따로 들고 있다가 저장할 때 보내요 (안 고친 값은 서버 값 그대로)
  const [draft, setDraft] = useState<Partial<OperationSettings>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();

  if (!saved) {
    return (
      <SafeAreaView style={s.screen} edges={['top']}>
        <Header title="운영 설정" onBack={() => navigation.goBack()} />
      </SafeAreaView>
    );
  }

  const value: OperationSettings = { ...saved, ...draft };
  const set = (patch: Partial<OperationSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(undefined);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveOperationSettings(value);
      setDraft({});
      setMessage({ text: '운영 설정을 저장했어요' });
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? e.message : '잠시 후 다시 시도해 주세요', error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="운영 설정" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.section}>
          <Text variant="16-bold">로봇 기준</Text>
          <View style={[s.card, s.sliders]}>
            <SliderRow label="충전하러 갈 배터리" value={value.chargeAt} onChange={(chargeAt) => set({ chargeAt })} />
            <View style={s.divider} />
            <SliderRow
              label="분리수거장에 갈 칸 적재율"
              value={value.emptyAt}
              onChange={(emptyAt) => set({ emptyAt })}
            />
          </View>
        </View>

        <View style={s.section}>
          <Text variant="16-bold">분리수거장</Text>
          <Pressable
            style={[s.card, s.station]}
            onPress={() => navigation.navigate('StationList')}
            accessibilityRole="button"
            accessibilityLabel="분리수거장 관리"
          >
            <View style={s.stationRow}>
              <Text style={s.flex1}>분리수거장</Text>
              <Text variant="13-semibold" color="brandText">
                {stations ? `${stations.length}곳` : ''}
              </Text>
              <Icon source={icons.chevronRight} size={18} />
            </View>
            <Text variant="12-regular" color="textBody">
              페트·캔·종이·일반
            </Text>
          </Pressable>
        </View>

        <View style={s.pauseCard}>
          <View style={s.pauseRow}>
            <Text variant="14-bold" style={s.flex1}>
              에이전트 일시 정지
            </Text>
            <Toggle
              value={value.agentPaused}
              onChange={(agentPaused) => set({ agentPaused })}
              accessibilityLabel="에이전트 일시 정지"
            />
          </View>
          <Text variant="12-regular" color="textWarn" lineHeight="loose">
            켜면 로봇이 대기 상태로 멈춰요
          </Text>
        </View>

        {message ? (
          <Text variant="12-regular" color={message.error ? 'error' : 'textDone'} accessibilityRole="alert">
            {message.text}
          </Text>
        ) : null}
      </ScrollView>

      <View style={s.saveArea}>
        <Button label={saving ? '저장하는 중…' : '저장하기'} onPress={handleSave} disabled={saving} />
      </View>
    </SafeAreaView>
  );
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.sliderRow}>
      <View style={s.sliderHead}>
        <Text variant="13-medium" style={s.flex1}>
          {label}
        </Text>
        <Text variant="14-bold" color="brandText">
          {value}%
        </Text>
      </View>
      <Slider value={value} onChange={onChange} accessibilityLabel={label} />
      <View style={s.scale}>
        <Text variant="10-regular" color="textBody">
          0%
        </Text>
        <Text variant="10-regular" color="textBody">
          100%
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space[20], paddingBottom: 28, gap: space[24] },
  flex1: { flex: 1 },
  section: { gap: space[12] },
  card: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[16] },
  sliders: { gap: space[20] },
  divider: { height: 1, backgroundColor: colors.bgPhoto },
  sliderRow: { gap: space[12] },
  sliderHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  station: { gap: 6 },
  stationRow: { minHeight: layout.touchMin, flexDirection: 'row', alignItems: 'center', gap: space[8] },
  pauseCard: { backgroundColor: colors.bgWarn, borderRadius: radius[20], padding: space[16], gap: 10 },
  pauseRow: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  saveArea: { backgroundColor: colors.card, paddingHorizontal: layout.screenPadding, paddingVertical: space[12] },
});
