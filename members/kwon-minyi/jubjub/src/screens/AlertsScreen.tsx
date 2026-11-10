import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCard, Icon, TopBar, Txt } from '../components/ui';
import { FilterChip } from '../components/ui';
import { AlertItem, AlertKind, alerts } from '../data';
import { icons } from '../icons';
import type { TabParams } from '../navigation';
import { colors } from '../theme';

const FILTERS: { key: 'all' | AlertKind; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'robot', label: '로봇 오류' },
  { key: 'pickup', label: '집기 불가' },
  { key: 'battery', label: '배터리 부족' },
  { key: 'report', label: '보고' },
];

const KIND_ICON = {
  robot: { icon: icons.alertTriangleRed, tone: 'error' },
  pickup: { icon: icons.hand, tone: 'error' },
  battery: { icon: icons.alertTriangleRed, tone: 'error' },
  report: { icon: icons.chartBrand, tone: 'brand' },
} as const;

function Item({ a }: { a: AlertItem }) {
  const k = KIND_ICON[a.kind];
  return <AlertCard icon={k.icon} tone={k.tone} title={a.title} body={a.place} meta={a.meta} unread={a.unread} />;
}

export function AlertsScreen({ navigation }: BottomTabScreenProps<TabParams, 'Alerts'>) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const list = alerts.filter((a) => filter === 'all' || a.kind === filter);
  const pinned = list.filter((a) => a.pinned);
  const recent = list.filter((a) => !a.pinned);
  const unreadCount = list.filter((a) => a.unread).length;

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <TopBar title="알림" onBack={() => navigation.navigate('Home')} />

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
              <Txt size={12} weight="semibold" color={colors.error}>
                먼저 확인해 주세요
              </Txt>
            </View>
            {pinned.map((a) => (
              <Item key={a.id} a={a} />
            ))}
          </>
        ) : null}

        <View style={s.listTitle}>
          <Txt size={15} weight="bold">
            최근 알림
          </Txt>
          {unreadCount > 0 ? (
            <Txt size={12} color={colors.brandText}>
              미확인 {unreadCount}개
            </Txt>
          ) : null}
        </View>
        {recent.length > 0 ? (
          recent.map((a) => <Item key={a.id} a={a} />)
        ) : (
          <Txt size={13} color={colors.textSub} style={s.empty}>
            해당하는 알림이 없어요
          </Txt>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  filterViewport: { backgroundColor: colors.card, height: 68 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 12 },
  pinnedLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listTitle: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 2 },
  empty: { textAlign: 'center', paddingVertical: 32 },
});
