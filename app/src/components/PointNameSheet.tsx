import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radius, space, typography } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { FilterChip } from './FilterChip';
import { Text } from './Text';

const QUICK_NAMES = ['정문', '화장실 앞', '놀이터'];

type PointNameSheetProps = {
  visible: boolean;
  /** 몇 번째 지점인지 (제목에 써요) */
  order: number;
  onCancel: () => void;
  onSubmit: (name: string) => void;
};

/** 지도에서 찍은 순찰 지점의 이름 정하기 (Figma "지점 이름 시트") */
export function PointNameSheet({ visible, order, onCancel, onSubmit }: PointNameSheetProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const close = () => {
    setName('');
    onCancel();
  };

  return (
    <BottomSheet
      visible={visible}
      title={`${order}번째 지점의 이름을 정해요`}
      description="알림과 기록에 이 이름으로 보여요"
      onClose={close}
    >
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="예: 벤치 쉼터"
        placeholderTextColor={colors.textDisabled}
        style={s.input}
        autoFocus
        maxLength={12}
        multiline={false}
        numberOfLines={1}
        scrollEnabled={false}
        accessibilityLabel="지점 이름"
      />
      <Text variant="14-bold">자주 쓰는 이름</Text>
      <View style={s.chips}>
        {QUICK_NAMES.map((n) => (
          <FilterChip key={n} label={n} selected={name === n} onPress={() => setName(n)} />
        ))}
      </View>
      <View style={s.actions}>
        <View style={s.flex}>
          <Button label="취소" variant="soft" onPress={close} />
        </View>
        <View style={s.flex}>
          <Button
            label="지점 추가"
            disabled={!trimmed}
            onPress={() => {
              onSubmit(trimmed);
              setName('');
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  // Figma "지점 이름 입력": 높이 56 · 글자 20 굵게.
  // 안드로이드 입력칸의 위아래 기본 여백 · 글꼴 여백을 빼야 20 글자가 56 칸에 들어가요.
  input: {
    ...typography['20-bold'],
    backgroundColor: colors.bgBrandSoft,
    borderRadius: radius[16],
    paddingHorizontal: space[16],
    paddingVertical: 0,
    height: 56,
    color: colors.brandText,
    includeFontPadding: false,
    textAlignVertical: 'center',
    outlineStyle: 'none',
  } as object,
  chips: { flexDirection: 'row', gap: space[8], flexWrap: 'wrap' },
  actions: { flexDirection: 'row', gap: 10, marginTop: space[4] },
  flex: { flex: 1 },
});
