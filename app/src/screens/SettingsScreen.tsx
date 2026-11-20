// C-02 설정 [확장]. A-01 홈의 설정 버튼으로 들어와요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelParkChange, logout, updateNotificationSettings } from '@/api/account';
import type { NotificationSettings } from '@/api/types';
import { Header, Icon, Text, Toggle } from '@/components';
import { useNotificationSettings, useParkChangeRequest, useProfile } from '@/hooks/useAccount';
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
  const { data: profile } = useProfile();
  const { data: settings, reload } = useNotificationSettings();
  const { data: parkChange, reload: reloadParkChange } = useParkChangeRequest();
  const [canceling, setCanceling] = useState(false);

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

  // 공원 변경 요청 화면에서 돌아오면 확인 중 카드가 보이도록 다시 불러요
  useFocusReload(navigation, reloadParkChange);

  const handleCancelParkChange = async () => {
    if (!parkChange) return;
    setCanceling(true);
    try {
      await cancelParkChange(parkChange.id);
      reloadParkChange();
    } finally {
      setCanceling(false);
    }
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

        {/* 공원 변경: 확인 중인 요청이 있으면 상태 카드, 없으면 바로가기 */}
        {parkChange?.status === 'pending' ? (
          <View style={s.pendingCard}>
            <View style={s.pendingHead}>
              <View style={s.pendingBadge}>
                <Text variant="12-bold" color="orangeText">
                  확인 중
                </Text>
              </View>
              <Text variant="12-regular" color="textBody" style={s.pendingDate}>
                {requestedAt(parkChange.createdAt)} 요청
              </Text>
            </View>
            <Text variant="17-bold">
              {parkChange.fromPark} → {parkChange.toPark}
            </Text>
            <Text variant="13-regular" color="textBody">
              총관리자가 확인하고 있어요. 승인되면 알림으로 알려 드리고, 그때 공원과 로봇이 같이 바뀌어요.
            </Text>
            <Pressable
              style={s.cancelButton}
              onPress={handleCancelParkChange}
              disabled={canceling}
              accessibilityRole="button"
            >
              <Text variant="16-bold" color="brandText">
                {canceling ? '취소하는 중…' : '요청 취소'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <LinkCard
            label="공원 변경하기"
            sub="총관리자가 승인하면 바뀌어요"
            onPress={() => navigation.navigate('ParkChange')}
          />
        )}
        <LinkCard label="분리수거장 관리" onPress={() => navigation.navigate('StationList')} />
        <LinkCard label="운영 설정" onPress={() => navigation.navigate('OperationSettings')} />

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
function LinkCard({ label, sub, onPress }: { label: string; sub?: string; onPress?: () => void }) {
  return (
    <Pressable style={[s.card, s.linkCard]} onPress={onPress} disabled={!onPress} accessibilityRole="button">
      <View style={s.linkRow}>
        <Text style={s.flex1}>{label}</Text>
        <Icon source={icons.chevronRight} size={18} />
      </View>
      {sub ? (
        <Text variant="12-regular" color="textBody">
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

const two = (n: number) => String(n).padStart(2, '0');
/** '11월 18일 16:50' */
const requestedAt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** 화면에 다시 돌아올 때마다 불러요 */
function useFocusReload(navigation: Props['navigation'], reload: () => void) {
  useEffect(() => navigation.addListener('focus', reload), [navigation, reload]);
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
  linkCard: { paddingVertical: space[8], minHeight: 60, justifyContent: 'center', gap: 6 },
  linkRow: { minHeight: layout.touchMin, flexDirection: 'row', alignItems: 'center', gap: space[8] },
  pendingCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    borderRadius: radius[20],
    padding: space[16],
    gap: 10,
  },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: space[8] },
  pendingBadge: {
    backgroundColor: colors.bgOrange,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingDate: { flex: 1, textAlign: 'right' },
  cancelButton: {
    height: layout.touchMin,
    borderRadius: 14,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appInfo: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[4] },
  flex1: { flex: 1 },
});
