import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Button, Card, Icon, StatRow, TopBar, Txt } from '../components/ui';
import { icons } from '../icons';
import type { TabParams } from '../navigation';
import { colors, radius } from '../theme';

const MATERIALS = [
  { name: '페트', count: 10, color: colors.data.pet },
  { name: '캔', count: 7, color: colors.data.can },
  { name: '종이', count: 5, color: colors.data.paper },
  { name: '일반', count: 2, color: colors.data.general },
];

const HOURLY = [
  { range: '08–10', count: 3 },
  { range: '10–12', count: 5 },
  { range: '12–14', count: 7 },
  { range: '14–16', count: 6 },
  { range: '16–18', count: 3 },
];
const BAR_PER_ITEM = 14; // 막대 1개당 14px (Figma: 7개 = 98px)

const TODOS = [
  { icon: icons.reportHand, title: '자동 수거 제외 쓰레기', body: '집기 불가 대상은 관리자님의 현장 확인과 직접 처리가 필요해요.' },
  { icon: icons.reportAlert, title: '로봇 오류 1번', body: '벤치 쉼터 근처에서 뒤집혀 13:58부터 22분 동안 멈췄어요.' },
  { icon: icons.reportRoute, title: '돌지 못한 순찰 지점 1곳', body: '로봇 오류 때문에 오후 순찰에서 벤치 쉼터를 건너뛰었어요.' },
];

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const formatDate = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`;

/** 재질별 도넛 그래프 */
function Donut({ size = 142, ring = 24 }: { size?: number; ring?: number }) {
  const total = MATERIALS.reduce((n, m) => n + m.count, 0);
  const r = (size - ring) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {MATERIALS.map((m) => {
          const len = (m.count / total) * c;
          const el = (
            <Circle
              key={m.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={m.color}
              strokeWidth={ring}
              strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
      </Svg>
      <View style={s.donutCenter}>
        <Txt size={25} weight="bold" lineHeight={1.2} style={{ letterSpacing: -0.7 }}>
          {total}개
        </Txt>
        <Txt size={11} color={colors.textSub}>
          총 수거량
        </Txt>
      </View>
    </View>
  );
}

export function ReportScreen({ navigation }: BottomTabScreenProps<TabParams, 'Report'>) {
  const [date, setDate] = useState(new Date(2026, 10, 6));
  const shift = (days: number) => setDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
  const total = HOURLY.reduce((n, h) => n + h.count, 0);

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <TopBar title="일일 보고" onBack={() => navigation.navigate('Home')} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* 보고 날짜 */}
        <View style={s.dateRow}>
          <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityLabel="이전 날">
            <Icon source={icons.datePrev} size={20} />
          </Pressable>
          <Txt size={14} weight="bold">
            {formatDate(date)}
          </Txt>
          <Pressable onPress={() => shift(1)} hitSlop={12} accessibilityLabel="다음 날">
            <Icon source={icons.dateNext} size={20} />
          </Pressable>
        </View>

        {/* 오늘의 수거량 */}
        <View style={s.hero}>
          <Txt size={13} weight="semibold">
            오늘의 수거량
          </Txt>
          <Txt size={30} weight="bold" color={colors.brandText}>
            24개
          </Txt>
          <Txt size={13} lineHeight={1.5}>
            전날보다 12% 늘었어요
          </Txt>
        </View>

        {/* 에이전트 요약 */}
        <View style={{ gap: 10 }}>
          <Txt size={16} weight="bold">
            에이전트의 하루 요약
          </Txt>
          <Txt size={13} lineHeight={1.6} color={colors.textSub}>
            오늘은 6번 순찰하며 쓰레기 24개를 수거했어요. 분리수거장에 3번 다녀왔고, 공연장 앞에서 쓰레기가 가장 많았어요.
          </Txt>
        </View>

        {/* 운영 통계 */}
        <StatRow
          paddingH={8}
          paddingV={18}
          items={[
            { label: '집기 성공률', value: '87%' },
            { label: '순찰', value: '6회' },
            { label: '분리수거장', value: '3회' },
          ]}
        />

        {/* 재질별 수거량 */}
        <Card style={{ gap: 20 }}>
          <Txt size={16} weight="bold">
            재질별 수거량
          </Txt>
          <View style={s.donutRow}>
            <Donut />
            <View style={{ flex: 1, gap: 16 }}>
              {MATERIALS.map((m) => (
                <View key={m.name} style={s.legendRow}>
                  <View style={[s.dot, { backgroundColor: m.color }]} />
                  <Txt size={12} color={colors.textSub} style={{ flex: 1 }}>
                    {m.name}
                  </Txt>
                  <Txt size={12} weight="semibold">
                    {m.count}개
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        </Card>

        {/* 시간대별 수거량 */}
        <Card style={{ gap: 16 }}>
          <View style={s.cardTitleRow}>
            <Txt size={16} weight="bold">
              시간대별 수거량
            </Txt>
            <Txt size={11} color={colors.textSub}>
              단위: 개
            </Txt>
          </View>
          <View style={s.bars}>
            {HOURLY.map((h) => (
              <View key={h.range} style={s.barCol}>
                <Txt size={12} weight="semibold" color={colors.brandText}>
                  {h.count}
                </Txt>
                <View style={[s.bar, { height: h.count * BAR_PER_ITEM }]} />
                <Txt size={10} color={colors.textSub}>
                  {h.range}
                </Txt>
              </View>
            ))}
          </View>
          <Txt size={11} color={colors.textSub}>
            08–18시 · 총 {total}개
          </Txt>
        </Card>

        {/* 처리 못 한 일 */}
        <View style={{ gap: 12 }}>
          <Txt size={16} weight="bold">
            처리 못 한 일
          </Txt>
          {TODOS.map((t) => (
            <View key={t.title} style={s.todo}>
              <Icon source={t.icon} size={22} />
              <View style={{ flex: 1, gap: 6 }}>
                <Txt size={14} weight="bold">
                  {t.title}
                </Txt>
                <Txt size={12} lineHeight={1.6} color={colors.textSub}>
                  {t.body}
                </Txt>
              </View>
            </View>
          ))}
        </View>

        {/* 인사이트 */}
        <View style={s.insight}>
          <Txt size={12} weight="semibold" color={colors.brandText}>
            오늘의 인사이트
          </Txt>
          <Txt size={13} lineHeight={1.6}>
            오늘은 공연장 앞에서 쓰레기가 가장 많았어요
          </Txt>
        </View>

        <Button label="발생 통계 보기 (확장)" variant="soft" icon={icons.buttonRoute} />

        <Txt size={11} color={colors.textSub} style={{ textAlign: 'center' }}>
          2026.11.06 22:00 작성
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 28, gap: 20 },
  dateRow: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { backgroundColor: colors.bgBrandSoft, borderRadius: radius[20], padding: 20, gap: 8 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bars: { height: 155, flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  barCol: { flex: 1, alignItems: 'center', gap: 8 },
  bar: { width: 32, backgroundColor: colors.brandText, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  todo: { backgroundColor: colors.card, borderRadius: radius[16], padding: 16, flexDirection: 'row', gap: 12 },
  insight: { backgroundColor: colors.bgBrandSoft, borderRadius: radius[20], padding: 16, gap: 8 },
});
