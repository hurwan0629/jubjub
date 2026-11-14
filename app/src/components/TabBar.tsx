import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { icons } from '@/icons';
import { colors, radius, softShadow, space } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

const TABS = {
  Home: { label: '홈', icon: icons.tab.home },
  Map: { label: '지도', icon: icons.tab.map },
  Alerts: { label: '알림', icon: icons.tab.alerts },
  Report: { label: '보고', icon: icons.tab.report },
} as const;

/** 고정 하단 탭 */
export function TabBar({ state, navigation, unreadCount }: BottomTabBarProps & { unreadCount: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name as keyof typeof TABS];
        const focused = state.index === index;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={s.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
          >
            <View style={[s.pill, { backgroundColor: focused ? colors.bgBrandSoft : colors.card }]}>
              <Icon source={focused ? tab.icon.on : tab.icon.off} size={21} />
              {route.name === 'Alerts' && unreadCount > 0 ? (
                <View style={s.badge}>
                  <Text variant="10-bold-digits" color="card" style={s.badgeText}>
                    {unreadCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant={focused ? '11-bold' : '11-medium'} color={focused ? 'brandText' : 'textSub'}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingTop: space[8],
    ...softShadow,
  },
  tab: { flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pill: { width: 46, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    left: 30,
    top: -3,
    height: 18,
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.card,
    backgroundColor: colors.brandText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 숫자만 들어가므로 Inter를 쓰고, 줄 높이를 고정해 폰에서도 배지 안 가운데에 오도록 해요.
  // (Noto Sans KR은 위아래 여백이 커서 안드로이드에서 숫자가 아래로 밀려요)
  badgeText: {
    lineHeight: 12,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
