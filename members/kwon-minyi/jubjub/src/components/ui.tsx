import { Image, ImageSource } from 'expo-image';
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { icons } from '../icons';
import { colors, font, radius, softShadow, space } from '../theme';

type Weight = keyof typeof font;

export function Txt({
  size = 14,
  weight = 'regular',
  color = colors.text,
  lineHeight,
  style,
  ...rest
}: TextProps & { size?: number; weight?: Weight; color?: string; lineHeight?: number; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      {...rest}
      style={[
        { fontSize: size, fontFamily: font[weight], color },
        lineHeight ? { lineHeight: size * lineHeight } : null,
        style,
      ]}
    />
  );
}

export function Icon({ source, size, width, height, style }: { source: ImageSource; size?: number; width?: number; height?: number; style?: StyleProp<ViewStyle> }) {
  return <Image source={source} style={[{ width: width ?? size, height: height ?? size }, style as object]} contentFit="contain" />;
}

/** 상단 바: 뒤로 가기 · 제목 · 추가 행동(비어 있음) */
export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <View style={s.topBar}>
      <Pressable style={s.iconButton} onPress={onBack} accessibilityRole="button" accessibilityLabel="뒤로 가기">
        <Icon source={icons.chevronLeft} size={22} />
      </Pressable>
      <Txt size={17} weight="bold" style={s.topBarTitle} numberOfLines={1}>
        {title}
      </Txt>
      <View style={s.iconButton} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action, size = 17, onPress }: { title: string; action?: string; size?: number; onPress?: () => void }) {
  return (
    <Pressable style={s.sectionHeader} onPress={onPress} disabled={!onPress}>
      <Txt size={size} weight="bold">
        {title}
      </Txt>
      {action ? (
        <Txt size={12} color={colors.brandText}>
          {action}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/** 필터 칩 (선택 시 체크 아이콘) */
export function FilterChip({ label, selected, onPress, minWidth }: { label: string; selected: boolean; onPress: () => void; minWidth?: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected ? s.chipOn : s.chipOff, minWidth ? { minWidth } : null]}
    >
      {selected ? <Icon source={icons.check} size={16} /> : null}
      <Txt size={13} weight="semibold" color={selected ? colors.card : colors.textSub}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <View style={s.filterBar}>{children}</View>;
}

/** 알림 카드 (A-01 미확인 알림 배너, A-05 알림 카드) */
export function AlertCard({
  icon,
  tone,
  title,
  body,
  meta,
  unread,
  bodySize = 11,
  onPress,
}: {
  icon: ImageSource;
  tone: 'error' | 'brand';
  title: string;
  body: string;
  meta: string;
  unread?: boolean;
  bodySize?: number;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.alertCard, { borderColor: unread ? colors.bgSelected : colors.border }]}>
      <View style={[s.iconCircle36, { backgroundColor: tone === 'error' ? colors.bgError : colors.bgBrandSoft }]}>
        <Icon source={icon} size={22} />
      </View>
      <View style={s.alertBody}>
        <View style={s.alertTitleRow}>
          <Txt size={13} weight={unread ? 'bold' : 'medium'} style={s.flex1}>
            {title}
          </Txt>
          {unread ? <Icon source={icons.unreadDot} size={6} /> : null}
        </View>
        <Txt size={bodySize} lineHeight={1.4} color={colors.textSub}>
          {body}
        </Txt>
        <Txt size={10} color={colors.textSub}>
          {meta}
        </Txt>
      </View>
    </Pressable>
  );
}

export function Button({
  label,
  variant = 'primary',
  icon,
  disabled,
  onPress,
}: {
  label: string;
  variant?: 'primary' | 'soft';
  icon?: ImageSource;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const primary = variant === 'primary';
  const bg = disabled ? colors.bgDisabled : primary ? colors.brand : colors.bgBrandSoft;
  const fg = disabled ? colors.textDisabled : primary ? colors.card : colors.brandText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.button, { backgroundColor: bg, opacity: pressed ? 0.85 : 1 }]}
    >
      {icon ? <Icon source={icon} size={19} /> : null}
      <Txt size={15} weight="bold" color={fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** 요약 수치 (오늘 요약, 운영 통계) */
export function StatRow({ items, paddingH = 12, paddingV = 20 }: { items: { label: string; value: string }[]; paddingH?: number; paddingV?: number }) {
  return (
    <View style={[s.statRow, { paddingHorizontal: paddingH, paddingVertical: paddingV }]}>
      {items.map((it) => (
        <View key={it.label} style={s.statItem}>
          <Txt size={12} color={colors.textSub}>
            {it.label}
          </Txt>
          <Txt size={22} weight="bold" color={colors.brandText}>
            {it.value}
          </Txt>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  topBar: {
    height: 64,
    backgroundColor: colors.card,
    borderRadius: radius[16],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[8],
    gap: space[8],
  },
  topBarTitle: { flex: 1, textAlign: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[16], overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  filterBar: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    height: 44,
    minWidth: 78,
    paddingHorizontal: space[16],
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipOff: { backgroundColor: colors.card, borderColor: colors.border },
  alertCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radius[16],
    padding: 14,
    minHeight: 81,
    flexDirection: 'row',
    gap: 10,
  },
  iconCircle36: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  alertBody: { flex: 1, gap: 5 },
  alertTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  button: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[8],
  },
  statRow: { backgroundColor: colors.card, borderRadius: radius[20], flexDirection: 'row', gap: 8 },
  statItem: { flex: 1, alignItems: 'center', gap: 8 },
  shadow: softShadow,
});
