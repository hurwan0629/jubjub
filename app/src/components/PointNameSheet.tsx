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
  /** 분리수거장처럼 다른 것의 이름을 정할 때 (기본: 순찰 지점) */
  kind?: 'point' | 'station';
  /** 저장 중이면 버튼을 막아요 */
  sending?: boolean;
};

const STATION_NAMES = ['남문 분리수거장', '북문 분리수거장', '동문 분리수거장'];

/** 지도에서 찍은 순찰 지점의 이름 정하기 (Figma "지점 이름 시트") */
export function PointNameSheet({ visible, order, onCancel, onSubmit, kind = 'point', sending }: PointNameSheetProps) {
  const station = kind === 'station';
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const close = () => {
    setName('');
    onCancel();
  };

  return (
    <BottomSheet
      visible={visible}
      title={station ? `${order}번째 분리수거장의 이름을 정해요` : `${order}번째 지점의 이름을 정해요`}
      description={station ? '모든 로봇이 같이 쓰는 이름이에요' : '알림과 기록에 이 이름으로 보여요'}
      onClose={close}
    >
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={station ? '예: 남문 분리수거장' : '예: 벤치 쉼터'}
        placeholderTextColor={colors.textDisabled}
        style={s.input}
        autoFocus
        maxLength={station ? 20 : 12}
        multiline={false}
        numberOfLines={1}
        scrollEnabled={false}
        accessibilityLabel={station ? '분리수거장 이름' : '지점 이름'}
      />
      <Text variant="14-bold">자주 쓰는 이름</Text>
      <View style={s.chips}>
        {(station ? STATION_NAMES : QUICK_NAMES).map((n) => (
          <FilterChip key={n} label={n} selected={name === n} onPress={() => setName(n)} />
        ))}
      </View>
      <View style={s.actions}>
        <View style={s.flex}>
          <Button label="취소" variant="soft" onPress={close} />
        </View>
        <View style={s.flex}>
          <Button
            label={sending ? '저장 중…' : station ? '분리수거장 추가' : '지점 추가'}
            disabled={!trimmed || sending}
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
