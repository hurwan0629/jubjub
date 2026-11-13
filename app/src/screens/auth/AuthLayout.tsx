import { useEffect, useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { icons } from '@/icons';
import { colors, layout, space } from '@/theme';

/** 로그인 · 회원가입 공통 틀: 서비스 소개 + 본문 + 하단 서비스 원칙 (Figma C-01 · C-04) */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  // 키보드가 올라오면 그 높이만큼 화면 아래를 비우고, 입력 양식이 화면 위쪽에 오도록 스크롤해요.
  // (안드로이드 edge-to-edge에서는 KeyboardAvoidingView가 동작하지 않아 직접 계산해요)
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const keyboardSpace = Math.max(0, keyboardHeight - insets.bottom);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [formY, setFormY] = useState<number>();

  useEffect(() => {
    if (keyboardHeight > 0 && formY !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, formY - space[16]), animated: true });
    }
  }, [keyboardHeight, formY]);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <View style={[s.flex, { paddingBottom: keyboardSpace }]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 서비스 소개 */}
          <View style={s.intro}>
            <View style={s.brand}>
              <View style={s.appIcon}>
                <Icon source={icons.jubjubOnBrand} size={46} />
              </View>
              <Text variant="logo-40" color="brandDeep">
                JUBJUB
              </Text>
            </View>
            <View style={s.titles}>
              <Text variant="25-bold">{title}</Text>
              <Text variant="14-regular" color="textSub">
                {subtitle}
              </Text>
            </View>
          </View>

          {/* 입력 양식 · 안내 (키보드가 올라오면 여기까지 스크롤해요) */}
          <View style={s.body} onLayout={(e) => setFormY(e.nativeEvent.layout.y)}>
            {children}
          </View>

          {/* 서비스 원칙 */}
          <View style={s.footer}>
            <Text variant="12-regular" color="textSub">
              작은 순찰, 깨끗한 공원
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 100, // Figma 상단 여백 (고정)
    paddingBottom: space[24],
    gap: 44, // Figma 소개 ↔ 양식 간격 (토큰 없음)
  },
  intro: { gap: space[24] },
  body: { gap: 44 }, // 양식 ↔ 안내 간격 (content의 gap과 같아요)
  titles: { gap: space[12] },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space[12] },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 18, // 앱 아이콘 모양 (고정)
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: space[24] },
});
