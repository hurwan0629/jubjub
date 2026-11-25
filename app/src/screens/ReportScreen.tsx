// A-10 보고 (오늘 · 이번 주 · 이번 달 · 직접 선택). Figma "7. 보고 · 통계"
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import type { MaterialKey, PeriodReport } from '@/api/reports';
import { BottomSheet, Button, Card, FilterChip, Header, Icon, StatRow, Text } from '@/components';
import { usePeriodReport } from '@/hooks/usePeriodReport';
import { icons } from '@/icons';
import type { TabParams } from '@/navigation';
import { colors, radius, space } from '@/theme';

type Period = 'day' | 'week' | 'month' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'custom', label: '직접 선택' },
];
const NOUN: Record<Period, string> = { day: '오늘', week: '이번 주', month: '이번 달', custom: '선택한 기간' };
const PREV: Record<Period, string> = { day: '전날', week: '지난주', month: '지난달 같은 기간', custom: '앞 기간' };

const MATERIAL: Record<MaterialKey, { name: string; color: string }> = {
  pet: { name: '페트', color: colors.data.pet },
  can: { name: '캔', color: colors.data.can },
  glass: { name: '유리', color: colors.data.paper },
  general: { name: '일반', color: colors.data.general },
};

const ERROR_TEXT: Record<PeriodReport['errors'][number]['code'], string> = {
  path_blocked: '길이 막혀 멈췄어요',
  pick_failed_repeatedly: '여러 번 줍지 못해 멈췄어요',
  low_battery: '배터리가 부족해 멈췄어요',
  return_failed: '분리수거장으로 돌아가지 못했어요',
  device_failure: '장치에 문제가 생겼어요',
};

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_MS = 86400000;
const MAX_DAYS = 92; // 최대 3개월
const BAR_MAX = 110;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mmdd = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
const md = (d: Date) => `${mmdd(d)} (${DAYS[d.getDay()]})`;

/** 기간과 기준일 → [시작, 끝(미포함)] */
function rangeOf(period: Period, anchor: Date, custom: [Date, Date]): [Date, Date] {
  const a = startOfDay(anchor);
  if (period === 'day') return [a, addDays(a, 1)];
  if (period === 'week') {
    const start = addDays(a, -a.getDay()); // 일요일 시작
    return [start, addDays(start, 7)];
  }
  if (period === 'month')
    return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)];
  return [custom[0], addDays(custom[1], 1)];
}

function rangeTitle(period: Period, [from, to]: [Date, Date], today: Date) {
  const last = addDays(to, -1);
  if (period === 'day')
    return `${from.getFullYear()}년 ${from.getMonth() + 1}월 ${from.getDate()}일 (${DAYS[from.getDay()]})`;
  if (period === 'week') {
    const thisWeek = today >= from && today < to;
    return `${mmdd(from)} – ${mmdd(last)}${thisWeek ? ' (이번 주)' : ''}`;
  }
  if (period === 'month')
    return `${from.getFullYear()}년 ${from.getMonth() + 1}월 (${from.getDate()}일 – ${last.getDate()}일)`;
  return `${md(from)} – ${md(last)}`;
}

/** 재질별 도넛 그래프 */
function Donut({
  items,
  total,
  size = 142,
  ring = 24,
}: {
  items: PeriodReport['byMaterial'];
  total: number;
  size?: number;
  ring?: number;
}) {
  const r = (size - ring) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {total === 0 ? (
          <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.bgDisabled} strokeWidth={ring} />
        ) : (
          items.map((m) => {
            const len = (m.count / total) * c;
            const el = (
              <Circle
                key={m.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={MATERIAL[m.key].color}
                strokeWidth={ring}
                strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })
        )}
      </Svg>
      <View style={s.donutCenter}>
        <Text variant="25-bold">{total}개</Text>
        <Text variant="11-regular" color="textSub">
          총 수거량
        </Text>
      </View>
    </View>
  );
}

export function ReportScreen({ navigation }: BottomTabScreenProps<TabParams, 'Report'>) {
  const today = startOfDay(new Date());
  const [period, setPeriod] = useState<Period>('day');
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState<[Date, Date]>([addDays(today, -6), today]);
  const [picking, setPicking] = useState(false);
  const range = rangeOf(period, anchor, custom);
  const { data: report, error, loading, reload } = usePeriodReport(range[0], range[1]);

  /** ‹ › : 오늘은 하루, 이번 주는 한 주, 이번 달은 한 달씩 움직여요 */
  const shift = (dir: -1 | 1) => {
    if (period === 'day') setAnchor((d) => addDays(d, dir));
    else if (period === 'week') setAnchor((d) => addDays(d, dir * 7));
    else if (period === 'month') setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
    else {
      const len = Math.round((custom[1].getTime() - custom[0].getTime()) / DAY_MS) + 1;
      setCustom(([a, b]) => [addDays(a, dir * len), addDays(b, dir * len)]);
    }
  };
  const nextDisabled = range[1] > today;

  const change =
    report && report.previousPickups > 0
      ? Math.round(((report.pickups - report.previousPickups) / report.previousPickups) * 100)
      : null;
  const totalMaterial = report?.byMaterial.reduce((n, m) => n + m.count, 0) ?? 0;
  const pointTotal = report?.byPoint.reduce((n, p) => n + p.count, 0) ?? 0;
  const maxHour = Math.max(1, ...(report?.hourly.map((h) => h.count) ?? [1]));

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <Header title="보고" onBack={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 기간 선택 */}
        <View style={s.chips}>
          {PERIODS.map((p) => (
            <FilterChip
              key={p.key}
              label={p.label}
              selected={period === p.key}
              onPress={() => {
                if (p.key === 'custom') setPicking(true);
                else {
                  setPeriod(p.key);
                  setAnchor(today);
                }
              }}
            />
          ))}
        </View>

        <View style={s.dateRow}>
          <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="이전 기간">
            <Icon source={icons.datePrev} size={20} />
          </Pressable>
          <Text variant="14-bold">{rangeTitle(period, range, today)}</Text>
          <Pressable
            onPress={() => shift(1)}
            disabled={nextDisabled}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="다음 기간"
            style={{ opacity: nextDisabled ? 0.3 : 1 }}
          >
            <Icon source={icons.dateNext} size={20} />
          </Pressable>
        </View>

        {error ? (
          <View style={s.gap12}>
            <Text variant="13-regular" color="error">
              {error.message}
            </Text>
            <Button label="다시 불러오기" onPress={reload} />
          </View>
        ) : !report ? (
          <Text variant="13-regular" color="textSub">
            {loading ? '보고를 만들고 있어요…' : ''}
          </Text>
        ) : (
          <>
            {/* 수거량 */}
            <View style={s.hero}>
              <Text variant="13-semibold">{NOUN[period]} 수거량</Text>
              <Text variant="30-bold" color="brandText">
                {report.pickups}개
              </Text>
              <Text variant="13-regular" lineHeight="relaxed">
                {change == null
                  ? `${PREV[period]} 기록이 없어요`
                  : change === 0
                    ? `${PREV[period]}과 같아요`
                    : `${PREV[period]}보다 ${Math.abs(change)}% ${change > 0 ? '늘었어요' : '줄었어요'}`}
              </Text>
            </View>

            <StatRow
              compact
              items={[
                { label: '집기 성공률', value: report.pickSuccessRate == null ? '—' : `${report.pickSuccessRate}%` },
                { label: '순찰', value: `${report.patrols}회` },
                { label: '분리수거장', value: `${report.stationVisits}회` },
              ]}
            />

            {/* 재질별 수거량 */}
            <Card style={s.gap20}>
              <Text variant="16-bold">재질별 수거량</Text>
              <View style={s.donutRow}>
                <Donut items={report.byMaterial} total={totalMaterial} />
                <View style={s.flexGap16}>
                  {report.byMaterial.map((m) => (
                    <View key={m.key} style={s.legendRow}>
                      <View style={[s.dot, { backgroundColor: MATERIAL[m.key].color }]} />
                      <Text variant="12-regular" color="textSub" style={s.flex}>
                        {MATERIAL[m.key].name}
                      </Text>
                      <Text variant="12-semibold">{m.count}개</Text>
                    </View>
                  ))}
                </View>
              </View>
            </Card>

            {/* 순찰 지점별 비율 */}
            <Card style={s.gap12}>
              <Text variant="16-bold">순찰 지점별 비율</Text>
              {pointTotal === 0 ? (
                <Text variant="12-regular" color="textSub">
                  이 기간에 순찰 지점 근처에서 찾은 쓰레기가 없어요
                </Text>
              ) : (
                report.byPoint.slice(0, 5).map((p) => {
                  const pct = Math.round((p.count / pointTotal) * 100);
                  return (
                    <View key={p.name} style={s.gap6}>
                      <View style={s.rowBetween}>
                        <Text variant="13-semibold">{p.name}</Text>
                        <Text variant="12-semibold" color="brandText">
                          {pct}%
                        </Text>
                      </View>
                      <View style={s.track}>
                        <View style={[s.fill, { width: `${pct}%` }]} />
                      </View>
                    </View>
                  );
                })
              )}
            </Card>

            {/* 시간대별 수거량 */}
            <Card style={s.gap16}>
              <View style={s.rowBetween}>
                <Text variant="16-bold">시간대별 수거량</Text>
                <Text variant="11-regular" color="textSub">
                  단위: 개
                </Text>
              </View>
              <View style={s.bars}>
                {report.hourly.map((h) => (
                  <View key={h.range} style={s.barCol}>
                    <Text variant="11-semibold" color="brandText">
                      {h.count}
                    </Text>
                    <View style={[s.bar, { height: Math.max(2, (h.count / maxHour) * BAR_MAX) }]} />
                    <Text variant="10-regular" color="textSub">
                      {h.range}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* 처리 못 한 일 */}
            <View style={s.gap12}>
              <Text variant="16-bold">처리 못 한 일</Text>
              {report.unpickable === 0 && report.errors.length === 0 && report.missedPatrols === 0 ? (
                <Text variant="13-regular" color="textSub">
                  처리 못 한 일이 없어요
                </Text>
              ) : null}
              {report.unpickable > 0 ? (
                <View style={s.todo}>
                  <Icon source={icons.reportHand} size={22} />
                  <View style={s.flexGap6}>
                    <Text variant="14-bold">자동 수거 제외 쓰레기 {report.unpickable}개</Text>
                    <Text variant="12-regular" color="textSub" lineHeight="loose">
                      집기 불가 대상은 관리자님의 현장 확인과 직접 처리가 필요해요.
                    </Text>
                  </View>
                </View>
              ) : null}
              {report.errors.length > 0 ? (
                <View style={s.todo}>
                  <Icon source={icons.reportAlert} size={22} />
                  <View style={s.flexGap6}>
                    <Text variant="14-bold">로봇 오류 {report.errors.length}번</Text>
                    <Text variant="12-regular" color="textSub" lineHeight="loose">
                      {report.errors
                        .slice(0, 3)
                        .map((e) => `${e.robotName} · ${ERROR_TEXT[e.code]}`)
                        .join('\n')}
                    </Text>
                  </View>
                </View>
              ) : null}
              {report.missedPatrols > 0 ? (
                <View style={s.todo}>
                  <Icon source={icons.reportRoute} size={22} />
                  <View style={s.flexGap6}>
                    <Text variant="14-bold">시작하지 못한 순찰 {report.missedPatrols}번</Text>
                    <Text variant="12-regular" color="textSub" lineHeight="loose">
                      연결 상태와 로봇 상태를 확인해 주세요.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <RangeSheet
        visible={picking}
        today={today}
        initial={custom}
        onClose={() => setPicking(false)}
        onApply={(r) => {
          setCustom(r);
          setPeriod('custom');
          setPicking(false);
        }}
      />
    </SafeAreaView>
  );
}

/** A-10 보고 - 직접 선택: 빠른 선택 + 달력에서 시작 · 끝 날짜 고르기 (최대 3개월) */
function RangeSheet({
  visible,
  today,
  initial,
  onClose,
  onApply,
}: {
  visible: boolean;
  today: Date;
  initial: [Date, Date];
  onClose: () => void;
  onApply: (range: [Date, Date]) => void;
}) {
  const [start, setStart] = useState<Date>(initial[0]);
  const [end, setEnd] = useState<Date | null>(initial[1]);
  const [month, setMonth] = useState(new Date(initial[1].getFullYear(), initial[1].getMonth(), 1));
  const first = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  const tooLong = end ? (end.getTime() - start.getTime()) / DAY_MS + 1 > MAX_DAYS : false;

  /** 기간이 다 정해져 있거나 시작보다 앞 날짜면 새 시작일, 아니면 끝 날짜로 정해요 */
  const pick = (d: Date) => {
    if (end || d < start) {
      setStart(d);
      setEnd(null);
    } else setEnd(d);
  };
  const quick = (from: Date, to: Date) => {
    setStart(from);
    setEnd(to);
    setMonth(new Date(to.getFullYear(), to.getMonth(), 1));
  };

  return (
    <BottomSheet visible={visible} title="기간을 선택해요" description="최대 3개월까지 볼 수 있어요" onClose={onClose}>
      <Text variant="13-bold">빠른 선택</Text>
      <View style={s.chips}>
        <FilterChip label="최근 7일" selected={false} onPress={() => quick(addDays(today, -6), today)} />
        <FilterChip label="최근 30일" selected={false} onPress={() => quick(addDays(today, -29), today)} />
        <FilterChip
          label="지난달"
          selected={false}
          onPress={() =>
            quick(
              new Date(today.getFullYear(), today.getMonth() - 1, 1),
              new Date(today.getFullYear(), today.getMonth(), 0),
            )
          }
        />
      </View>
      <View style={s.rangeBox}>
        <Text variant="18-bold" color="brandText">
          {md(start)} – {end ? md(end) : '끝 날짜를 골라요'}
        </Text>
      </View>
      <View style={s.rowBetween}>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} hitSlop={10}>
          <Icon source={icons.datePrev} size={18} />
        </Pressable>
        <Text variant="14-bold">
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </Text>
        <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} hitSlop={10}>
          <Icon source={icons.dateNext} size={18} />
        </Pressable>
      </View>
      <View style={s.week}>
        {DAYS.map((d) => (
          <Text key={d} variant="11-regular" color="textSub" style={s.cellText}>
            {d}
          </Text>
        ))}
      </View>
      <View style={s.calendar}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={s.cell} />;
          const future = d > today;
          const edge = d.getTime() === start.getTime() || (end && d.getTime() === end.getTime());
          const inside = end && d > start && d < end;
          return (
            <Pressable
              key={d.toISOString()}
              style={[s.cell, inside ? s.cellIn : null, edge ? s.cellEdge : null]}
              onPress={() => pick(d)}
              disabled={future}
              accessibilityRole="button"
              accessibilityLabel={`${d.getMonth() + 1}월 ${d.getDate()}일`}
            >
              <Text
                variant="13-semibold"
                color={edge ? 'card' : future ? 'textDisabled' : inside ? 'brandText' : 'text'}
                style={s.cellText}
              >
                {d.getDate()}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tooLong ? (
        <Text variant="12-regular" color="error">
          최대 3개월까지 고를 수 있어요
        </Text>
      ) : null}
      <View style={s.actions}>
        <View style={s.flex}>
          <Button label="취소" variant="soft" onPress={onClose} />
        </View>
        <View style={s.flex}>
          <Button label="적용하기" disabled={!end || tooLong} onPress={() => end && onApply([start, end])} />
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  gap6: { gap: 6 },
  gap12: { gap: space[12] },
  gap16: { gap: space[16] },
  gap20: { gap: space[20] },
  flexGap16: { flex: 1, gap: space[16] },
  flexGap6: { flex: 1, gap: 6 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[24], paddingTop: space[16], paddingBottom: 28, gap: space[20] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
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
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.bgPhoto, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 4, backgroundColor: colors.brandText },
  bars: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  bar: {
    width: 22,
    backgroundColor: colors.brandText,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  todo: {
    backgroundColor: colors.card,
    borderRadius: radius[16],
    padding: space[16],
    flexDirection: 'row',
    gap: space[12],
  },
  rangeBox: { backgroundColor: colors.bgBrandSoft, borderRadius: 14, padding: space[16] },
  week: { flexDirection: 'row' },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  cellIn: { backgroundColor: colors.bgBrandSoft },
  cellEdge: { backgroundColor: colors.brand },
  cellText: { flex: 1, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space[8] },
});
