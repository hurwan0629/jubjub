import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCard, Card, Icon, SectionHeader, StatRow, Txt } from '../components/ui';
import { alerts, decisions, loads } from '../data';
import { icons } from '../icons';
import { colors, font, radius, softShadow } from '../theme';
import type { TabParams } from '../navigation';

const WARN_AT = 80;

export function HomeScreen({ navigation }: BottomTabScreenProps<TabParams, 'Home'>) {
  const unread = alerts.filter((a) => a.unread);
  const latest = unread.find((a) => !a.pinned) ?? unread[0];

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {/* 홈 헤더 */}
      <View style={s.header}>
        <View style={{ gap: 6 }}>
          <View style={s.brand}>
            <Icon source={icons.jubjub} size={32} />
            <Txt size={22} weight="brand" color={colors.brandDeep} style={{ letterSpacing: 0.88 }}>
              JUBJUB
            </Txt>
          </View>
          <Txt size={13} weight="semibold">
            한강공원
          </Txt>
        </View>
        <Pressable style={s.iconButton} accessibilityLabel="설정">
          <Icon source={icons.settings} size={22} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Txt size={24} weight="bold">
          {'안녕하세요!\n공원 관리자님'}
        </Txt>

        {/* 로봇 상태 카드 */}
        <Pressable style={s.robotCard} onPress={() => navigation.navigate('Map')}>
          <View style={s.robotTop}>
            <View style={s.iconCircle44}>
              <Icon source={icons.bot} size={22} />
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Txt size={18} weight="bold">
                Jubi가 순찰 중이에요
              </Txt>
              <Txt size={12} color={colors.textSub}>
                공원 수거 로봇 · 잔디광장을 돌고 있어요
              </Txt>
            </View>
          </View>
          <View style={s.robotInfo}>
            <View style={{ gap: 3 }}>
              <Txt size={10} color={colors.textSub}>
                배터리
              </Txt>
              <View style={s.valueUnit}>
                <Txt size={22} weight="bold">
                  72
                </Txt>
                <Txt size={11}>%</Txt>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={s.statusBadge}>
                <Txt size={10} weight="semibold" color={colors.textDone}>
                  정상
                </Txt>
              </View>
              <Txt size={10} color={colors.textSub}>
                다음 지점 · 공연장 앞
              </Txt>
            </View>
          </View>
        </Pressable>

        {/* 미확인 알림 배너 */}
        {latest ? (
          <AlertCard
            icon={icons.hand}
            tone="error"
            title={`확인 안 한 알림 ${unread.length}개`}
            body={latest.title}
            bodySize={13}
            meta={latest.meta.split(' · ')[0] + ' · ' + latest.place}
            unread
            onPress={() => navigation.navigate('Alerts')}
          />
        ) : null}

        {/* 오늘 요약 */}
        <View style={s.section12}>
          <SectionHeader title="오늘 요약" />
          <StatRow
            items={[
              { label: '수거', value: '24개' },
              { label: '분리수거장', value: '3회' },
              { label: '순찰', value: '4/6회' },
            ]}
          />
        </View>

        {/* 칸별 적재율 */}
        <View style={{ gap: 16 }}>
          <SectionHeader title="칸별 적재율" action="실시간" />
          <Card style={{ gap: 18 }}>
            {loads.map((l) => {
              const warn = l.percent >= WARN_AT;
              return (
                <View key={l.name} style={{ gap: 7 }}>
                  <View style={s.loadRow}>
                    <Txt size={14} weight="semibold" style={{ flex: 1 }}>
                      {l.name}
                    </Txt>
                    {warn ? <Icon source={icons.triangleAlert} size={13} /> : null}
                    <Txt size={13} weight="bold" color={warn ? colors.textWarn : colors.brandText}>
                      {l.percent}%
                    </Txt>
                    <Txt size={12} color={colors.textSub} style={s.loadCount}>
                      ({l.count}개)
                    </Txt>
                  </View>
                  <View style={s.track}>
                    <View style={[s.fill, { width: `${l.percent}%`, backgroundColor: warn ? colors.warn : colors.brand }]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        {/* 작업 대기열 */}
        <View style={s.section12}>
          <SectionHeader title="작업 대기열" action="3개 예정" />
          <Card style={{ gap: 16 }}>
            {[
              { icon: icons.recycle, label: '분리수거장 비우기', time: '14:20' },
              { icon: icons.route, label: '순찰 이어서 하기', time: '14:40' },
              { icon: icons.batteryCharging, label: '충전', time: '15:30' },
            ].map((t) => (
              <View key={t.label} style={s.taskRow}>
                <Icon source={t.icon} size={20} />
                <Txt size={14} style={{ flex: 1 }}>
                  {t.label}
                </Txt>
                <Txt size={13} weight="semibold" color={colors.brandText}>
                  {t.time}
                </Txt>
              </View>
            ))}
          </Card>
        </View>

        {/* 에이전트가 방금 한 일 */}
        <View style={s.section12}>
          <SectionHeader title="에이전트가 방금 한 일" action="더보기" />
          <Txt size={12} color={colors.textSub}>
            최근 판단 {decisions.length}개
          </Txt>
          {decisions.map((d) => (
            <Card key={d.time} style={s.logCard}>
              <Icon source={icons.timeline} width={12} height={94} />
              <View style={{ flex: 1, gap: 8 }}>
                <Txt size={11} weight="semibold" color={colors.brandText}>
                  {d.time}
                </Txt>
                <Txt size={15} weight="bold">
                  {d.title}
                </Txt>
                <Txt size={13} lineHeight={1.6} color={colors.textSub}>
                  {d.lines.join('\n')}
                </Txt>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { height: 76, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 24 },
  robotCard: {
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: 18,
    paddingBottom: 34,
    gap: 14,
    ...softShadow,
  },
  robotTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle44: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgBrandSoft, alignItems: 'center', justifyContent: 'center' },
  robotInfo: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  valueUnit: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statusBadge: { backgroundColor: colors.bgBrandSoft, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  section12: { gap: 12 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  loadCount: { width: 67, textAlign: 'right', fontFamily: font.regular },
  track: { height: 6, borderRadius: 4, backgroundColor: colors.bgPhoto, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logCard: { flexDirection: 'row', gap: 12, minHeight: 142 },
});
