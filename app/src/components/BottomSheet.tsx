import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { colors, layout, space } from '@/theme';

import { Text } from './Text';

type BottomSheetProps = {
  visible: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

// 시트 위로 남겨 둘 어두운 막 높이 (뒤를 눌러 닫을 수 있게)
const TOP_GAP = 48;
// 키보드가 있을 때 시트 맨 아래 여백. 삼성 키보드처럼 위에 도구 줄이 붙는 키보드는
// 알려 주는 높이에 그 줄이 빠져 있을 때가 있어서, 끝까지 스크롤하면 버튼이 그 줄 위로 오게 넉넉히 둬요.
const KEYBOARD_BOTTOM_ROOM = 72;

/**
 * 아래에서 올라오는 시트 (지점 이름 정하기 · 순찰 시간 추가). 뒤를 누르면 닫혀요.
 * 키보드가 올라오면 시트도 키보드 위로 올라가고, 키보드 위 공간이 모자라면 시트 안을 스크롤해서
 * 아래쪽 버튼(지점 추가 · 추가)까지 볼 수 있어요.
 */
export function BottomSheet({ visible, title, description, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();
  const keyboardOpen = keyboardHeight > 0;
  // 키보드 위에 들어갈 수 있는 시트 최대 높이
  const maxHeight = windowHeight - keyboardHeight - insets.top - TOP_GAP;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.flex}>
        <Pressable style={s.dim} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[s.sheet, { marginBottom: keyboardHeight, maxHeight }]} accessibilityViewIsModal>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={keyboardOpen}
            contentContainerStyle={[
              s.content,
              // 키보드가 있으면 키보드 바로 위에, 없으면 홈 인디케이터 위에 놓아요
              { paddingBottom: keyboardOpen ? KEYBOARD_BOTTOM_ROOM : Math.max(insets.bottom, space[24]) },
            ]}
          >
            <Text variant="18-bold">{title}</Text>
            {description ? (
              <Text variant="13-regular" color="textSub">
                {description}
              </Text>
            ) : null}
            {children}
          </ScrollView>
        </View>
        {/* 시트 아래(키보드 뒤) 빈 곳도 시트 색으로 채워 틈이 보이지 않게 해요 */}
        {keyboardOpen ? <View style={[s.keyboardFill, { height: keyboardHeight }]} /> : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  dim: { flex: 1, backgroundColor: colors.overlaySoft },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: space[24], gap: 14 },
  keyboardFill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.card },
});
