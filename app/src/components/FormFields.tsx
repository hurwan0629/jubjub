import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';

import { icons } from '@/icons';
import { colors, font } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

/** 입력 항목: 이름표 + 입력창 (Figma C-01 · C-04 입력 항목) */
export function TextField({
  label,
  icon,
  secure,
  error,
  ...input
}: TextInputProps & { label: string; icon: ImageSource; secure?: boolean; error?: string }) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={s.field}>
      <Txt size={14} weight="bold">
        {label}
      </Txt>
      <View style={[s.box, error ? { borderColor: colors.error } : null]}>
        <Icon source={icon} size={20} />
        <TextInput
          {...input}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={colors.textDisabled}
          style={s.input}
          accessibilityLabel={label}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityLabel={hidden ? '비밀번호 보기' : '비밀번호 숨기기'}
          >
            <Icon source={hidden ? icons.eyeOff : icons.eye} size={20} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Txt size={12} color={colors.error}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

/** 체크박스 (Figma 체크박스: 상태=선택/기본) */
export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[s.check, checked ? s.checkOn : s.checkOff]}>
      {checked ? <Icon source={icons.check} size={14} /> : null}
    </View>
  );
}

/** 이름표 + 안내 + 링크 한 줄 (회원가입 안내, 로그인 안내) */
export function LinkRow({ lead, action, onPress }: { lead: string; action: string; onPress: () => void }) {
  return (
    <View style={s.linkRow}>
      <Txt size={12} color={colors.textSub}>
        {lead}
      </Txt>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
        <Txt size={12} weight="bold" color={colors.brandText} style={{ textDecorationLine: 'underline' }}>
          {action}
        </Txt>
      </Pressable>
    </View>
  );
}

const SOCIAL = {
  kakao: { bg: colors.kakao, fg: colors.kakaoText, icon: icons.kakao, border: undefined },
  google: { bg: colors.card, fg: colors.text, icon: icons.google, border: colors.border },
  email: { bg: colors.brand, fg: colors.card, icon: icons.mailWhite, border: undefined },
} as const;

/** 가입 방법 버튼 (Figma 가입 방법 버튼: 방식=카카오/구글/이메일) */
export function SignUpMethodButton({
  kind,
  label,
  onPress,
}: {
  kind: keyof typeof SOCIAL;
  label: string;
  onPress?: () => void;
}) {
  const v = SOCIAL[kind];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.method,
        { backgroundColor: v.bg, opacity: pressed ? 0.85 : 1 },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
      ]}
    >
      <Icon source={v.icon} size={20} />
      <Txt size={15} weight="bold" color={v.fg}>
        {label}
      </Txt>
    </Pressable>
  );
}

const s = StyleSheet.create({
  field: { gap: 9 },
  box: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    fontFamily: font.regular,
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  check: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand },
  checkOff: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 4 },
  method: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
