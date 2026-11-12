import type { ImageSource } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { TextInputProps, ViewProps } from 'react-native';

import { icons } from '@/icons';
import { colors, space, typography } from '@/theme';

import { Icon } from './Icon';
import { Text } from './Text';

type TextFieldProps = TextInputProps & {
  label: string;
  icon: ImageSource;
  /** 비밀번호처럼 가려서 보여 줘요 (눈 아이콘으로 보기 · 숨기기) */
  secure?: boolean;
  /** 있으면 칸 테두리를 빨갛게 하고 칸 아래에 보여 줘요 */
  error?: string;
  /** 항목 전체(이름표 포함)의 위치 · 크기. 키보드가 올라올 때 이 칸까지 스크롤하는 데 써요 */
  onFieldLayout?: ViewProps['onLayout'];
};

/** 입력 항목: 이름표 + 입력창 (+ 오류 안내) (Figma C-01 · C-04 입력 항목) */
export function TextField({ label, icon, secure, error, onFieldLayout, ...input }: TextFieldProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <View style={s.field} onLayout={onFieldLayout}>
      <Text variant="14-bold">{label}</Text>
      <View style={[s.box, error ? s.boxError : null]}>
        <Icon source={icon} size={20} />
        <TextInput
          {...input}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={colors.textDisabled}
          style={s.input}
          accessibilityLabel={label}
          aria-invalid={!!error}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? '비밀번호 보기' : '비밀번호 숨기기'}
          >
            <Icon source={hidden ? icons.eyeOff : icons.eye} size={20} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="12-regular" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
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

/** 안내 + 링크 한 줄 (회원가입 안내, 로그인 안내) */
export function LinkRow({ lead, action, onPress }: { lead: string; action: string; onPress: () => void }) {
  return (
    <View style={s.linkRow}>
      <Text variant="12-regular" color="textSub">
        {lead}
      </Text>
      <Pressable onPress={onPress} hitSlop={8} accessibilityRole="link">
        <Text variant="12-bold" color="brandText" style={s.underline}>
          {action}
        </Text>
      </Pressable>
    </View>
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
    paddingHorizontal: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
  },
  boxError: { borderColor: colors.error, borderWidth: 1.5 },
  input: {
    flex: 1,
    height: '100%',
    ...typography['14-regular'],
    color: colors.text,
    outlineStyle: 'none',
  } as object,
  check: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.brand },
  checkOff: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space[4],
  },
  underline: { textDecorationLine: 'underline' },
});
