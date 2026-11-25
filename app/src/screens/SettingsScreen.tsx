// C-02 설정 [확장]. A-01 홈의 설정 버튼으로 들어와요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logout, updateNotificationSettings } from '@/api/account';
import type { NotificationSettings } from '@/api/types';
import { Header, Icon, Text, Toggle } from '@/components';
import { useNotificationSettings, useProfile } from '@/hooks/useAccount';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, space } from '@/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParams, 'Settings'>,
  CompositeScreenProps<BottomTabScreenProps<TabParams>, NativeStackScreenProps<RootParams>>
>;

const NOTIFY_ROWS: { key: keyof NotificationSettings; label: string }[] = [
  { key: 'unpickable', label: '집기 불가 쓰레기' },
  { key: 'dailyReport', label: '일일 보고' },
];

export function SettingsScreen({ navigation }: Props) {
  const { data: profile, reload: reloadProfile } = useProfile();
  const { data: settings, reload } = useNotificationSettings();
  useFocusEffect(
    useCallback(() => {
      reloadProfile();
    }, [reloadProfile]),
  );

  const handleToggle = async (key: keyof NotificationSettings, value: boolean) => {
    await updateNotificationSettings({ [key]: value });
    reload();
  };

  const handleLogout = async () => {
    await logout();
    // 설정(홈 스택) → 하단 탭 → 전체 스택 순서로 올라가 로그인만 남겨요
    navigation
      .getParent()
      ?.getParent()
      ?.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="설정" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 계정 */}
        <View style={s.section}>
          <Text variant="16-bold">계정</Text>
          <View style={[s.card, s.accountCard]}>
            <View style={s.profile}>
              <View style={s.avatar}>
                <Icon source={icons.profileUser} size={24} />
              </View>
              <View style={s.profileText}>
                <Text variant="15-bold">{profile?.name ?? ' '}</Text>
                <Text variant="12-regular" color="textSub">
                  {profile?.email ?? ' '}
                </Text>
              </View>
            </View>
            <Pressable style={s.logout} onPress={handleLogout} accessibilityRole="button">
              <Text variant="15-bold" color="brandText">
                로그아웃
              </Text>
            </Pressable>
          </View>
        </View>

        {/* 알림 설정 */}
        <View style={s.section}>
          <Text variant="16-bold">알림 설정</Text>
          <View style={s.card}>
            <View style={[s.notifyRow, s.notifyRowTall]}>
              <View style={s.notifyInfo}>
                <View style={s.notifyTitle}>
                  <Text>로봇 오류</Text>
                  <Text variant="11-regular" color="textDisabled">
                    항상 켜짐
                  </Text>
                </View>
                <Text variant="12-regular" color="textSub">
                  안전을 위해 항상 받아요
                </Text>
              </View>
              <Toggle value locked accessibilityLabel="로봇 오류 알림 (항상 켜짐)" />
            </View>
            {NOTIFY_ROWS.map((row) => (
              <View key={row.key}>
                <View style={s.divider} />
                <View style={s.notifyRow}>
                  <Text style={s.notifyInfo}>{row.label}</Text>
                  <Toggle
                    value={settings?.[row.key] ?? true}
                    onChange={(v) => handleToggle(row.key, v)}
                    accessibilityLabel={`${row.label} 알림`}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 바로가기 */}
        <LinkCard label="공원 변경하기" onPress={() => navigation.navigate('ParkChange')} />
        <LinkCard label="분리수거장 관리" onPress={() => navigation.navigate('Stations')} />
        {/* A-12 운영 설정은 아직 앱에 없어요 */}
        <LinkCard label="운영 설정" />

        <View style={s.appInfo}>
          <Text variant="12-regular" color="textSub">
            앱 정보
          </Text>
          <Text variant="12-regular" color="textSub">
            v1.0.0
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** 설정 항목 바로가기 카드 (글자 + 오른쪽 화살표) */
function LinkCard({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable style={[s.card, s.linkCard]} onPress={onPress} disabled={!onPress} accessibilityRole="button">
      <Text style={s.flex1}>{label}</Text>
      <Icon source={icons.chevronRight} size={18} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, paddingVertical: space[20], gap: space[16] },
  section: { gap: space[12] },
  card: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[16] },
  accountCard: { gap: space[8] },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: { flex: 1, gap: 6 },
  logout: {
    height: layout.touchMin,
    borderRadius: 14, // Figma 버튼 모서리 14
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifyRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  notifyRowTall: { minHeight: 70 },
  notifyInfo: { flex: 1, gap: 6 },
  notifyTitle: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  divider: { height: 1, backgroundColor: colors.bgPhoto },
  linkCard: {
    paddingVertical: space[8],
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  appInfo: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4] },
  flex1: { flex: 1 },
});
