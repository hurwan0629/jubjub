// A-10 보고 "직접 선택" 기간 시트. 기준: Figma Page 5 "A-10 보고 - 직접 선택"
// 시작일 → 끝날 순서로 눌러요. 최대 3개월까지, 오늘 이후는 고를 수 없어요.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, FilterChip, Text } from '@/components';
import { colors, space } from '@/theme';
import { daysBetween, MAX_RANGE_DAYS, mdWithDay, periodOf, sameDay } from '@/utils/period';
import type { Period } from '@/utils/period';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
type Quick = 'last7' | 'last30' | 'lastMonth';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function quickRange(q: Quick): { from: Date; to: Date } {
  const today = startOfDay(new Date());
  if (q === 'last7') return { from: addDays(today, -6), to: today };
  if (q === 'last30') return { from: addDays(today, -29), to: today };
  const last = periodOf('month', new Date(today.getFullYear(), today.getMonth() - 1, 1));
  return { from: last.from, to: last.to };
}

type Props = {
  visible: boolean;
  initial: Period;
  onClose: () => void;
  onApply: (p: Period) => void;
};

export function RangeSheet({ visible, initial, onClose, onApply }: Props) {
  // 열 때마다 지금 기간에서 시작해요
  return visible ? (
    <Body key={`${initial.from.getTime()}-${initial.to.getTime()}`} {...{ visible, initial, onClose, onApply }} />
  ) : null;
}

function Body({ visible, initial, onClose, onApply }: Props) {
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState<Date | null>(initial.to);
  const [month, setMonth] = useState(() => new Date(initial.to.getFullYear(), initial.to.getMonth(), 1));
  const today = startOfDay(new Date());

  const pick = (day: Date) => {
    // 끝날까지 고른 상태거나 시작일보다 앞을 누르면 새로 시작해요
    if (to || day < from) {
      setFrom(day);
      setTo(null);
    } else {
      setTo(daysBetween(from, day) > MAX_RANGE_DAYS ? addDays(from, MAX_RANGE_DAYS - 1) : day);
    }
  };
  const applyQuick = (q: Quick) => {
    const r = quickRange(q);
    setFrom(r.from);
    setTo(r.to);
    setMonth(new Date(r.to.getFullYear(), r.to.getMonth(), 1));
  };

  const year = month.getFullYear();
  const m = month.getMonth();
  const cells: (Date | null)[] = [
    ...Array(new Date(year, m, 1).getDay()).fill(null),
    ...Array.from({ length: new Date(year, m + 1, 0).getDate() }, (_, i) => new Date(year, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const end = to ?? from;

  return (
    <BottomSheet
      visible={visible}
      title="기간을 선택해요"
      description="최대 3개월까지 볼 수 있어요"
      descriptionColor="textBody"
      onClose={onClose}
    >
      <Text variant="14-bold">빠른 선택</Text>
      <View style={s.row8}>
        {(
          [
            ['last7', '최근 7일'],
            ['last30', '최근 30일'],
            ['lastMonth', '지난달'],
          ] as [Quick, string][]
        ).map(([q, label]) => {
          const r = quickRange(q);
          const on = to !== null && sameDay(r.from, from) && sameDay(r.to, to);
          return (
            <View key={q} style={s.flex1}>
              <FilterChip label={label} selected={on} onPress={() => applyQuick(q)} />
            </View>
          );
        })}
      </View>

      <Text variant="14-bold">날짜</Text>
      <View style={s.rangeBox}>
        <Text variant="22-bold" color="brandText">
          {mdWithDay(from)} – {to ? mdWithDay(to) : '끝날 선택'}
        </Text>
      </View>

      <View style={s.monthRow}>
        <Pressable onPress={() => setMonth(new Date(year, m - 1, 1))} hitSlop={10} accessibilityLabel="이전 달">
          <Text variant="16-bold" color="brandText">
            ‹
          </Text>
        </Pressable>
        <Text variant="14-bold">
          {year}년 {m + 1}월
        </Text>
        <Pressable
          onPress={() => setMonth(new Date(year, m + 1, 1))}
          disabled={new Date(year, m + 1, 1) > today}
          hitSlop={10}
          accessibilityLabel="다음 달"
        >
          <Text variant="16-bold" color={new Date(year, m + 1, 1) > today ? 'textPlaceholder' : 'brandText'}>
            ›
          </Text>
        </Pressable>
      </View>

      <View style={s.calendar}>
        <View style={s.week}>
          {DAYS.map((d) => (
            <View key={d} style={s.cell}>
              <Text variant="13-regular" color="textBody">
                {d}
              </Text>
            </View>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={s.week}>
            {week.map((day, i) => {
              if (!day) return <View key={i} style={s.cell} />;
              const future = day > today;
              const edge = sameDay(day, from) || (to !== null && sameDay(day, to));
              const inside = day > from && day < end;
              return (
                <Pressable
                  key={i}
                  onPress={() => pick(day)}
                  disabled={future}
                  style={[s.cell, edge ? s.edge : inside ? s.inside : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: edge || inside, disabled: future }}
                  accessibilityLabel={`${day.getMonth() + 1}월 ${day.getDate()}일`}
                >
                  <Text
                    variant="13-regular"
                    color={edge ? 'card' : inside ? 'brandText' : future ? 'textDisabled' : 'text'}
                    style={future ? s.future : null}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={s.row10}>
        <View style={s.flex1}>
          <Button label="취소" variant="soft" onPress={onClose} />
        </View>
        <View style={s.flex1}>
          <Button label="적용하기" onPress={() => onApply({ kind: 'range', from, to: end })} />
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  row8: { flexDirection: 'row', gap: space[8] },
  row10: { flexDirection: 'row', gap: 10 },
  rangeBox: { backgroundColor: colors.bgBrandSoft, borderRadius: 16, padding: space[16] },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
  },
  calendar: { gap: space[4] },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { width: 44, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  edge: { backgroundColor: colors.brand },
  inside: { backgroundColor: colors.bgSelected },
  future: { opacity: 0.5 },
});
