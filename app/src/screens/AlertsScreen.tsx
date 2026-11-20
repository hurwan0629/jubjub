// A-05 알림 목록. 기준: Figma Page 5 "A-05 알림 목록" (기본 · 빈 상태 · 공원 변경 반려)
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppNotification, NotificationType } from '@/api/types';
import { AlertCard, FilterChip, Header, Icon, Text } from '@/components';
import { useNotifications } from '@/hooks/useNotifications';
import { icons } from '@/icons';
import type { RootParams, TabParams } from '@/navigation';
import { colors, space } from '@/theme';
import type { Tone } from '@/theme';
import { NOTIFICATION_FILTERS, NOTIFICATION_TYPE_LABEL } from '@/utils/labels';

type Filter = 'all' | NotificationType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '전체' },
  ...NOTIFICATION_FILTERS.map((key) => ({ key, label: NOTIFICATION_TYPE_LABEL[key] })),
];

const TYPE_ICON: Record<NotificationType, { icon: ImageSource; tone: Tone }> = {
  robotError: { icon: icons.alertTriangleRed, tone: 'error' },
  unpickable: { icon: icons.hand, tone: 'error' },
  lowBattery: { icon: icons.alertTriangleRed, tone: 'error' },
  dailyReport: { icon: icons.chartBrand, tone: 'brand' },
  parkChange: { icon: icons.alertParkChange, tone: 'orange' },
};

type Props = CompositeScreenProps<BottomTabScreenProps<TabParams, 'Alerts'>, NativeStackScreenProps<RootParams>>;

function Item({ a, onPress }: { a: AppNotification; onPress: () => void }) {
  const k = TYPE_ICON[a.type];
  const meta = a.note ? `${a.time} · ${a.note}` : a.time;
  const unread = a.status === 'new';
  return (
    <AlertCard
      icon={k.icon}
      tone={k.tone}
      framed={a.type === 'parkChange'}
      // 공원 변경 반려는 안 읽었을 때 옅은 빨간 테두리로 눈에 띄게 해요
      borderColor={a.type === 'parkChange' && unread ? 'rejectBorder' : undefined}
      title={a.title}
      body={a.place}
      meta={meta}
      unread={unread}
      onPress={onPress}
    />
  );
}

export function AlertsScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const { data: list = [], loading } = useNotifications(filter === 'all' ? undefined : filter);
  const pinned = list.filter((a) => a.pinned);
  const recent = list.filter((a) => !a.pinned);
  const unreadCount = list.filter((a) => a.status === 'new').length;

  // 보고 알림은 보고 탭으로, 나머지는 알림 상세(A-06)로 가요
  const open = (a: AppNotification) =>
    a.type === 'dailyReport' ? navigation.navigate('Report') : navigation.navigate('AlertDetail', { id: a.id });

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="알림" onBack={() => navigation.navigate('Home')} />

      {/* 가로 필터 */}
      <View style={s.filterViewport}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
          {FILTERS.map((f) => (
            <FilterChip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>

      {/* 빈 안내는 불러오기가 끝난 뒤에만 보여 줘요 (불러오는 중에 깜빡이지 않게) */}
      {!loading && list.length === 0 ? (
        <View style={s.emptyArea}>
          <View style={s.emptyArt}>
            <Icon source={icons.bellEmpty} width={30} height={31} />
            <View style={s.emptyCheck}>
              <Icon source={icons.checkEmpty} size={16} />
            </View>
          </View>
          <View style={s.emptyText}>
            <Text variant="18-bold">확인할 알림이 없어요</Text>
            <Text variant="13-regular" color="textBody" lineHeight="relaxed">
              로봇이 잘 일하고 있어요
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {pinned.length > 0 ? (
            <>
              <View style={s.pinnedLabel}>
                <Icon source={icons.pin} size={14} />
                <Text variant="12-semibold" color="error">
                  먼저 확인해 주세요
                </Text>
              </View>
              {pinned.map((a) => (
                <Item key={a.id} a={a} onPress={() => open(a)} />
              ))}
            </>
          ) : null}

          {recent.length > 0 ? (
            <View style={s.listTitle}>
              <Text variant="15-bold">최근 알림</Text>
              {unreadCount > 0 ? (
                <Text variant="12-regular" color="brandText">
                  미확인 {unreadCount}개
                </Text>
              ) : null}
            </View>
          ) : null}
          {recent.map((a) => (
            <Item key={a.id} a={a} onPress={() => open(a)} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filterViewport: { backgroundColor: colors.card, height: 68 },
  filterContent: { paddingHorizontal: space[16], paddingVertical: space[12], gap: space[8] },
  content: { paddingHorizontal: space[24], paddingTop: space[20], paddingBottom: space[24], gap: space[12] },
  pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listTitle: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: space[8], paddingBottom: 2 },
  emptyArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[16], padding: space[24] },
  emptyArt: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.bgBrandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  emptyCheck: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.done,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { alignItems: 'center', gap: space[8] },
});
