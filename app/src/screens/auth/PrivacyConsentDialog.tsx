// C-04 회원가입 > 개인정보 수집 · 이용 동의 "보기" 창
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, radius, softShadow, space } from '@/theme';

import { PRIVACY_CONSENT } from './privacyConsent';

type Props = {
  visible: boolean;
  /** 동의하기: 체크박스를 켜고 창을 닫아요 */
  onAgree: () => void;
  /** 닫기 · 뒤로 가기: 동의 상태는 그대로 두고 창만 닫아요 */
  onClose: () => void;
};

/** 동의서 전문을 보여 주는 가운데 창. 내용이 길어서 본문만 스크롤돼요 */
export function PrivacyConsentDialog({ visible, onAgree, onClose }: Props) {
  const c = PRIVACY_CONSENT;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.dim}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Text variant="18-bold" style={s.title} accessibilityRole="header">
            {c.title}
          </Text>

          <ScrollView style={s.scroll} contentContainerStyle={s.body}>
            {c.sections.map((sec) => (
              <View key={sec.title} style={s.section}>
                <Text variant="14-bold">{sec.title}</Text>
                {sec.body ? (
                  <Text variant="13-regular" lineHeight="relaxed">
                    {sec.body}
                  </Text>
                ) : null}
                {sec.table ? (
                  <View style={s.table}>
                    <View style={s.tableHead}>
                      <Text variant="12-semibold" color="textSub" style={s.center}>
                        {sec.table.head}
                      </Text>
                    </View>
                    <Text variant="13-regular" style={s.tableBody}>
                      {sec.table.items}
                    </Text>
                  </View>
                ) : null}
                {sec.note ? (
                  <Text variant="12-regular" color="textSub" lineHeight="loose">
                    ※ {sec.note}
                  </Text>
                ) : null}
              </View>
            ))}
            <Text variant="12-regular" color="textSub" lineHeight="loose">
              ※ {c.footnote}
            </Text>
            <Text variant="13-regular" lineHeight="relaxed">
              {c.pledge}
            </Text>
          </ScrollView>

          <View style={s.buttons}>
            <View style={s.flex}>
              <Button label="닫기" variant="soft" onPress={onClose} />
            </View>
            <View style={s.flex}>
              <Button label="동의하기" onPress={onAgree} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[24],
  },
  dialog: {
    width: 342,
    maxWidth: '100%',
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingTop: space[24],
    paddingBottom: space[20],
    paddingHorizontal: space[20],
    gap: space[16],
    ...softShadow,
  },
  title: { textAlign: 'center' },
  scroll: { flexGrow: 0 },
  body: { gap: space[20], paddingBottom: space[4] },
  section: { gap: space[8] },
  table: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  tableHead: { backgroundColor: colors.bgPhoto, paddingVertical: 6 },
  tableBody: { paddingVertical: space[8], paddingHorizontal: space[4] },
  center: { textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: space[8] },
  flex: { flex: 1 },
});
