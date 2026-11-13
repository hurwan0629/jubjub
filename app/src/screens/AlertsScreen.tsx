import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppNotification, NotificationType } from '@/api/types';
import { AlertCard, FilterChip, Header, Icon, Text } from '@/components';
import { useNotifications } from '@/hooks/useNotifications';
import { icons } from '@/icons';
import type { TabParams } from '@/navigation';
import { colors, space } from '@/theme';
import type { Tone } from '@/theme';
import { NOTIFICATION_TYPE_LABEL } from '@/utils/labels';

const FILTERS: { key: 'all' | NotificationType; label: string }[] = [
  { key: 'all', label: '전체' },
  ...(Object.keys(NOTIFICATION_TYPE_LABEL) as NotificationType[]).map((key) => ({
    key,
    label: NOTIFICATION_TYPE_LABEL[key],
  })),
];

const TYPE_ICON: Record<NotificationType, { icon: ImageSource; tone: Tone }> = {
  robotError: { icon: icons.alertTriangleRed, tone: 'error' },
  unpickable: { icon: icons.hand, tone: 'error' },
  lowBattery: { icon: icons.alertTriangleRed, tone: 'error' },
  dailyReport: { icon: icons.chartBrand, tone: 'brand' },
};

function Item({ a }: { a: AppNotification }) {
  const k = TYPE_ICON[a.type];
  const meta = a.note ? `${a.time} · ${a.note}` : a.time;
  return (
    <AlertCard icon={k.icon} tone={k.tone} title={a.title} body={a.place} meta={meta} unread={a.status === 'new'} />
  );
}

export function AlertsScreen({ navigation }: BottomTabScreenProps<TabParams, 'Alerts'>) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const { data: list = [], loading } = useNotifications(filter === 'all' ? undefined : filter);
  const pinned = list.filter((a) => a.pinned);
  const recent = list.filter((a) => !a.pinned);
  const unreadCount = list.filter((a) => a.status === 'new').length;

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
              <Item key={a.id} a={a} />
            ))}
          </>
        ) : null}

        <View style={s.listTitle}>
          <Text variant="15-bold">최근 알림</Text>
          {unreadCount > 0 ? (
            <Text variant="12-regular" color="brandText">
              미확인 {unreadCount}개
            </Text>
          ) : null}
        </View>
        {recent.map((a) => (
          <Item key={a.id} a={a} />
        ))}
        {/* 빈 안내는 불러오기가 끝난 뒤에만 보여 줘요 (불러오는 중에 깜빡이지 않게) */}
        {!loading && recent.length === 0 ? (
          <Text variant="13-regular" color="textSub" style={s.empty}>
            해당하는 알림이 없어요
          </Text>
        ) : null}
      </ScrollView>
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
  empty: { textAlign: 'center', paddingVertical: space[32] },
});
