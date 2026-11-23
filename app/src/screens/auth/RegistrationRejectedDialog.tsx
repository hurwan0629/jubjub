// C-01 로그인 > 가입 신청 반려 안내
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, radius, softShadow, space } from '@/theme';

export function RegistrationRejectedDialog({
  reason,
  onReapply,
  onClose,
}: {
  reason: string | null;
  onReapply: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={reason !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.dim}>
        <View style={s.dialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.symbol}>
              <Text variant="25-bold" color="error">
                ×
              </Text>
            </View>
            <Text variant="18-bold" style={s.center} accessibilityRole="header">
              가입 신청이 반려되었어요
            </Text>
            <Text variant="13-regular" color="textSub" style={s.center} lineHeight="relaxed">
              {'총관리자가 남긴 사유를 확인하고\n정보를 고쳐 다시 신청해 주세요.'}
            </Text>
            <View style={s.reason}>
              <Text variant="12-bold" color="error">
                반려 사유
              </Text>
              <Text variant="13-regular" lineHeight="relaxed">
                {reason || '총관리자에게 반려 사유를 확인해 주세요.'}
              </Text>
            </View>
          </ScrollView>
          <Button label="정보 고쳐 다시 신청하기" onPress={onReapply} />
          <Button label="닫기" variant="soft" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space[24] },
  dialog: {
    width: 342,
    maxWidth: '100%',
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    padding: space[24],
    gap: space[12],
    ...softShadow,
  },
  content: { gap: space[12], paddingBottom: space[8] },
  center: { textAlign: 'center' },
  symbol: {
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.bgError,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reason: { backgroundColor: colors.bg, padding: space[16], borderRadius: radius[16], gap: space[8] },
});
