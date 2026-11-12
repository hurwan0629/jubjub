// C-02 설정 [확장]. A-01 홈의 설정 버튼으로 들어와요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logout, updateNotificationSettings } from '@/api/account';
import type { NotificationSettings } from '@/api/types';
import { Button, Header, Icon, Text, Toggle } from '@/components';
import { useNotificationSettings, useProfile } from '@/hooks/useAccount';
import { icons } from '@/icons';
import type { HomeStackParams, RootParams, TabParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';

type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParams, 'Settings'>,
  CompositeScreenProps<BottomTabScreenProps<TabParams>, NativeStackScreenProps<RootParams>>
>;

const NOTIFY_ROWS: { key: keyof NotificationSettings; label: string }[] = [
  { key: 'unpickable', label: '집기 불가 쓰레기' },
  { key: 'dailyReport', label: '일일 보고' },
];

export function SettingsScreen({ navigation }: Props) {
  const { data: profile } = useProfile();
  const { data: settings, reload } = useNotificationSettings();
  const [confirmPark, setConfirmPark] = useState(false);

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

  const handleChangePark = () => {
    setConfirmPark(false);
    navigation.popToTop(); // 경로 설정을 마치고 돌아오면 홈이 보이도록
    navigation.navigate('RouteSetup');
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
        <LinkCard label="공원 변경하기" onPress={() => setConfirmPark(true)} />
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

      {/* 공원 변경 확인 창 */}
      <Modal visible={confirmPark} transparent animationType="fade" onRequestClose={() => setConfirmPark(false)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.warnBadge}>
              <Icon source={icons.alertTriangleRed} size={28} />
            </View>
            <View style={s.dialogText}>
              <Text variant="18-bold">기존 모든 설정이 지워집니다.</Text>
              <Text variant="13-regular" color="textSub" lineHeight="normal">
                계속하시겠습니까?
              </Text>
            </View>
            <View style={s.dialogActions}>
              <View style={s.flex1}>
                <Button label="취소" variant="soft" onPress={() => setConfirmPark(false)} />
              </View>
              <View style={s.flex1}>
                <Button label="확인" variant="danger" onPress={handleChangePark} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
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
  dim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space[24] },
  dialog: {
    width: 310,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingTop: 28,
    paddingBottom: space[24],
    paddingHorizontal: space[24],
    alignItems: 'center',
    gap: space[16],
    ...softShadow,
  },
  warnBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.bgError,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogText: { alignItems: 'center', gap: space[8] },
  dialogActions: { alignSelf: 'stretch', flexDirection: 'row', gap: space[8], marginTop: space[4] },
});
