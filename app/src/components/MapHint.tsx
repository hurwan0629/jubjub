import { StyleSheet, View } from 'react-native';

import { icons } from '@/icons';
import { colors, layout, radius, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type MapHintProps = {
  text: string;
  /** error: 갈 수 없는 위치 같은 경고 (Figma 빨간 안내) */
  tone?: 'brand' | 'error';
  center?: boolean;
};

/** 지도 바로 아래 안내 띠 (지도를 꾹 눌러 … 해요) */
export function MapHint({ text, tone = 'brand', center }: MapHintProps) {
  if (tone === 'error') {
    return (
      <View style={s.errorWrap} accessibilityLiveRegion="polite">
        <View style={s.error}>
          <View style={s.bang}>
            <Text variant="12-bold" color="error">
              !
            </Text>
          </View>
          <Text variant="13-regular" color="card" style={s.flexShrink}>
            {text}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={[s.hint, center ? s.center : null]}>
      <Icon source={icons.mousePointer} size={18} />
      <Text variant="13-regular" color="brandText" lineHeight="relaxed" style={s.flexShrink}>
        {text}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hint: {
    backgroundColor: colors.bgBrandSoft,
    minHeight: 48,
    paddingHorizontal: layout.screenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  center: { justifyContent: 'center' },
  flexShrink: { flexShrink: 1 },
  errorWrap: {
    backgroundColor: colors.bgBrandSoft,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[4],
  },
  error: {
    minHeight: 44,
    borderRadius: radius[16],
    backgroundColor: colors.error,
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  bang: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
