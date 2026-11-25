import { Pressable, StyleSheet, View } from 'react-native';

import { icons } from '@/icons';
import { colors, radius } from '@/theme';

import { Icon } from './Icon';

type ToggleProps = {
  value: boolean;
  onChange?: (value: boolean) => void;
  /** 항상 켜짐: 끌 수 없는 항목 (자물쇠 손잡이) */
  locked?: boolean;
  accessibilityLabel: string;
};

/** 토글 (Figma 토글: 켜짐 · 꺼짐 · 항상 켜짐). 44 × 26, 손잡이 20 */
export function Toggle({ value, onChange, locked, accessibilityLabel }: ToggleProps) {
  const on = locked || value;
  return (
    <Pressable
      onPress={() => onChange?.(!value)}
      disabled={locked}
      hitSlop={9}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!locked }}
      aria-checked={on}
      accessibilityLabel={accessibilityLabel}
      style={[
        s.track,
        { backgroundColor: locked ? colors.bgSelected : on ? colors.brand : colors.bgDisabled },
        { justifyContent: on ? 'flex-end' : 'flex-start' },
      ]}
    >
      {locked ? (
        <View style={s.lockKnob}>
          <Icon source={icons.lockSmall} size={11} />
        </View>
      ) : (
        <Icon source={icons.toggleKnob} size={20} />
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  track: { width: 44, height: 26, padding: 3, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center' },
  lockKnob: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
