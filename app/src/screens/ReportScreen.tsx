// A-10 보고. 기준: Figma Page 5 "A-10 보고" (오늘 · 이번 주 · 이번 달 · 직접 선택)
// 기간을 고르면 수거량 · 운영 통계 · 재질별 수거량 · 순찰 지점별 비율 · 처리 못 한 일을 그 기간으로 보여 줘요.
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import type { PeriodReport } from '@/api/types';
import { Card, Header, Icon, StatRow, Text } from '@/components';
import { useReport } from '@/hooks/useReport';
import { icons } from '@/icons';
import type { ReportStackParams, TabParams } from '@/navigation';
import { RangeSheet } from '@/screens/report/RangeSheet';
import { colors, layout, radius, space } from '@/theme';
import { SLOT_LABEL } from '@/utils/labels';
import { canGoNext, changeText, clampToToday, heroTitle, periodLabel, periodOf, shiftPeriod } from '@/utils/period';
import type { Period, PeriodKind } from '@/utils/period';

type Props = CompositeScreenProps<
  NativeStackScreenProps<ReportStackParams, 'ReportMain'>,
  BottomTabScreenProps<TabParams>
>;

const PERIODS: { kind: PeriodKind; label: string }[] = [
  { kind: 'day', label: '오늘' },
  { kind: 'week', label: '이번 주' },
  { kind: 'month', label: '이번 달' },
  { kind: 'range', label: '직접 선택' },
];

const TODO_ICON: Record<PeriodReport['unresolved'][number]['kind'], ImageSource> = {
  unpickable: icons.reportHand,
  robotError: icons.reportAlert,
  missedPoint: icons.reportRoute,
};

const percent = (n: number | null) => (n === null ? '–' : `${n}%`);

export function ReportScreen({ navigation }: Props) {
  const [period, setPeriod] = useState<Period>(() => periodOf('day'));
  const [rangeSheet, setRangeSheet] = useState(false);
  // 이번 주 · 이번 달은 오늘까지만 집계해요
  const query = clampToToday(period);
  const { data: report } = useReport(query.from, query.to);

  const choose = (kind: PeriodKind) => (kind === 'range' ? setRangeSheet(true) : setPeriod(periodOf(kind)));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="보고" onBack={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 기간 필터 */}
        <View style={s.periods}>
          {PERIODS.map((p) => {
            const on = period.kind === p.kind;
            return (
              <Pressable
                key={p.kind}
                style={[s.periodChip, on ? s.periodOn : s.periodOff]}
                onPress={() => choose(p.kind)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text variant="13-semibold" color={on ? 'card' : 'textBody'}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 보고 기간 */}
        <View style={s.dateRow}>
          <Pressable onPress={() => setPeriod((p) => shiftPeriod(p, -1))} hitSlop={12} accessibilityLabel="이전 기간">
            <Icon source={icons.datePrev} size={20} />
          </Pressable>
          <Text variant="14-bold">{periodLabel(period)}</Text>
          <Pressable
            onPress={() => setPeriod((p) => shiftPeriod(p, 1))}
            disabled={!canGoNext(period)}
            hitSlop={12}
            accessibilityLabel="다음 기간"
            style={canGoNext(period) ? null : s.disabled}
          >
            <Icon source={icons.dateNext} size={20} />
          </Pressable>
        </View>

        {report ? (
          <>
            {/* 수거량 */}
            <View style={s.hero}>
              <Text variant="13-semibold">{heroTitle(period)}</Text>
              <Text variant="30-bold" color="brandText">
                {report.pickups}개
              </Text>
              <Text variant="13-regular" lineHeight="relaxed">
                {changeText(period, report.changePercent)}
              </Text>
            </View>

            <StatRow
              compact
              items={[
                { label: '집기 성공률', value: percent(report.pickSuccessRate) },
                { label: '순찰', value: `${report.patrols}회` },
                { label: '분리수거장', value: `${report.stationVisits}회` },
              ]}
            />

            {/* 재질별 수거량 */}
            <Card style={s.gap20}>
              <Text variant="16-bold">재질별 수거량</Text>
              <View style={s.donutRow}>
                <Donut items={report.byMaterial} />
                <View style={s.legend}>
                  {report.byMaterial.map((m) => (
                    <View key={m.slot} style={s.legendRow}>
                      <View style={[s.dot, { backgroundColor: colors.data[m.slot] }]} />
                      <Text variant="12-regular" color="textBody" style={s.flex1}>
                        {SLOT_LABEL[m.slot]}
                      </Text>
                      <Text variant="12-semibold">{m.count}개</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            {/* 순찰 지점별 비율 */}
            {report.byPoint.length > 0 ? (
              <Card style={s.gap16}>
                <Text variant="16-bold">순찰 지점별 비율</Text>
                {report.byPoint.map((p) => (
                  <View key={p.name} style={s.gap8}>
                    <View style={s.pointRow}>
                      <Text variant="13-semibold">{p.name}</Text>
                      <Text variant="12-semibold" color="brandText">
                        {p.percent}%
                      </Text>
                    </View>
                    <View style={s.track}>
                      <View style={[s.fill, { width: `${p.percent}%` }]} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* 처리 못 한 일 */}
            {report.unresolved.length > 0 ? (
              <View style={s.gap12}>
                <Text variant="16-bold">처리 못 한 일</Text>
                {report.unresolved.map((t) => (
                  <View key={t.title} style={s.todo}>
                    <Icon source={TODO_ICON[t.kind]} size={22} />
                    <View style={s.todoText}>
                      <Text variant="14-bold">{t.title}</Text>
                      <Text variant="12-regular" color="textBody" lineHeight="loose">
                        {t.body}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <RangeSheet
        visible={rangeSheet}
        initial={query}
        onClose={() => setRangeSheet(false)}
        onApply={(p) => {
          setPeriod(p);
          setRangeSheet(false);
        }}
      />
    </SafeAreaView>
  );
}

/** 재질별 도넛 그래프 (Figma "재질별 도넛 그래프" 142 · 두께 24) */
function Donut({ items, size = 142, ring = 24 }: { items: PeriodReport['byMaterial']; size?: number; ring?: number }) {
  const total = items.reduce((n, m) => n + m.count, 0);
  const r = (size - ring) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 ? 2 : 0;
  const starts = items.reduce<number[]>(
    (acc, m, i) => [...acc, i === 0 ? 0 : acc[i - 1] + (items[i - 1].count / total) * c],
    [],
  );
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.bgPhoto} strokeWidth={ring} />
        {total > 0
          ? items.map((m, i) => (
              <Circle
                key={m.slot}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colors.data[m.slot]}
                strokeWidth={ring}
                strokeDasharray={`${Math.max((m.count / total) * c - gap, 0)} ${c}`}
                strokeDashoffset={-starts[i]}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            ))
          : null}
      </Svg>
      <View style={s.donutCenter}>
        <Text variant="25-bold">{total}개</Text>
        <Text variant="11-regular" color="textBody">
          총 수거량
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[24], paddingTop: space[16], paddingBottom: 28, gap: space[20] },
  flex1: { flex: 1 },
  gap8: { gap: space[8] },
  gap12: { gap: space[12] },
  gap16: { gap: space[16] },
  gap20: { gap: space[20] },
  disabled: { opacity: 0.3 },
  periods: { flexDirection: 'row', gap: space[8] },
  periodChip: {
    flex: 1,
    height: layout.touchMin,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[8],
  },
  periodOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  periodOff: { backgroundColor: colors.card, borderColor: colors.border },
  dateRow: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { backgroundColor: colors.bgBrandSoft, borderRadius: radius[20], padding: space[20], gap: space[8] },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: space[24] },
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
  },
  legend: { flex: 1, gap: space[16] },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pointRow: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.bgPhoto, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.brandText },
  todo: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[16],
    flexDirection: 'row',
    gap: space[12],
  },
  todoText: { flex: 1, gap: 6 },
});
