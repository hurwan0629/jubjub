import type { ImageSource } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { icons } from '@/icons';
import { colors, radius, tones } from '@/theme';
import type { Tone } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type AlertCardProps = {
  icon: ImageSource;
  tone: Tone;
  title: string;
  body: string;
  meta: string;
  unread?: boolean;
  /** 홈 배너처럼 본문을 크게 보여 줄 때 */
  large?: boolean;
  onPress?: () => void;
};

/** 알림 카드 (A-01 미확인 알림 배너, A-05 알림 카드) */
export function AlertCard({ icon, tone, title, body, meta, unread, large, onPress }: AlertCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[s.card, { borderColor: unread ? colors.bgSelected : colors.border }]}
    >
      <View style={[s.iconCircle, { backgroundColor: colors[tones[tone].bg] }]}>
        <Icon source={icon} size={22} />
      </View>
      <View style={s.body}>
        <View style={s.titleRow}>
          <Text variant={unread ? '13-bold' : '13-medium'} style={s.flex1}>
            {title}
          </Text>
          {unread ? <Icon source={icons.unreadDot} size={6} /> : null}
        </View>
        <Text variant={large ? '13-regular' : '11-regular'} color="textSub" lineHeight="normal">
          {body}
        </Text>
        <Text variant="10-regular" color="textSub">
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radius[16],
    padding: 14,
    minHeight: 81,
    flexDirection: 'row',
    gap: 10,
  },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
