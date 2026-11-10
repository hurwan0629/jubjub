import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Txt } from '@/components';
import { icons } from '@/icons';
import { colors } from '@/theme';

/** 로그인 · 회원가입 공통 틀: 서비스 소개 + 본문 + 하단 서비스 원칙 (Figma C-01 · C-04) */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 서비스 소개 */}
          <View style={{ gap: 24 }}>
            <View style={s.brand}>
              <View style={s.appIcon}>
                <Icon source={icons.jubjubOnBrand} size={46} />
              </View>
              <Txt size={40} weight="brand" color={colors.brandDeep} style={{ letterSpacing: 1.6 }}>
                JUBJUB
              </Txt>
            </View>
            <View style={{ gap: 12 }}>
              <Txt size={25} weight="bold" lineHeight={1.2} style={{ letterSpacing: -0.7 }}>
                {title}
              </Txt>
              <Txt size={14} color={colors.textSub}>
                {subtitle}
              </Txt>
            </View>
          </View>

          {children}

          {/* 서비스 원칙 */}
          <View style={s.footer}>
            <Txt size={12} color={colors.textSub}>
              작은 순찰, 깨끗한 공원
            </Txt>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 100, paddingBottom: 24, gap: 44 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingTop: 24 },
});
