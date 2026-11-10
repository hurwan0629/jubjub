import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { markNeedsRouteSetup } from '../../auth';
import { Checkbox, TextField } from '../../components/form';
import { Button, Icon, TopBar, Txt } from '../../components/ui';
import { icons } from '../../icons';
import type { RootParams } from '../../navigation';
import { colors, radius, softShadow } from '../../theme';

const ID_RULE = /^[A-Za-z0-9]{4,16}$/;
const PW_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** C-04 회원가입 - 이메일 → 가입 완료 창 */
export function SignUpEmailScreen({ navigation }: NativeStackScreenProps<RootParams, 'SignUpEmail'>) {
  const [form, setForm] = useState({ name: '', id: '', pw: '', pw2: '', email: '' });
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // 입력이 있을 때만 형식 오류를 보여 줘요
  const errors = {
    id: form.id && !ID_RULE.test(form.id) ? '영문, 숫자 4~16자로 입력해 주세요' : undefined,
    pw: form.pw && !PW_RULE.test(form.pw) ? '영문과 숫자를 넣어 8자 이상으로 입력해 주세요' : undefined,
    pw2: form.pw2 && form.pw2 !== form.pw ? '비밀번호가 서로 달라요' : undefined,
    email: form.email && !EMAIL_RULE.test(form.email) ? '이메일 형식을 확인해 주세요' : undefined,
  };
  const filled = Object.values(form).every((v) => v.trim().length > 0);
  const valid = filled && agreed && !Object.values(errors).some(Boolean);

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <TopBar title="이메일로 가입하기" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TextField label="이름" icon={icons.userRound} placeholder="이름을 입력해 주세요" value={form.name} onChangeText={set('name')} />
          <TextField
            label="아이디"
            icon={icons.atSign}
            placeholder="영문, 숫자 4~16자"
            value={form.id}
            onChangeText={set('id')}
            autoCapitalize="none"
            error={errors.id}
          />
          <TextField label="비밀번호" icon={icons.lockKeyhole} placeholder="영문, 숫자 포함 8자 이상" value={form.pw} onChangeText={set('pw')} secure error={errors.pw} />
          <TextField
            label="비밀번호 확인"
            icon={icons.lockKeyhole}
            placeholder="비밀번호를 한 번 더 입력해 주세요"
            value={form.pw2}
            onChangeText={set('pw2')}
            secure
            error={errors.pw2}
          />
          <TextField
            label="이메일"
            icon={icons.mailInput}
            placeholder="example@email.com"
            value={form.email}
            onChangeText={set('email')}
            autoCapitalize="none"
            keyboardType="email-address"
            error={errors.email}
          />

          {/* 개인정보 동의 */}
          <Pressable
            style={s.consent}
            onPress={() => setAgreed((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Checkbox checked={agreed} />
            <Txt size={13} style={{ flex: 1 }}>
              [필수] 개인정보 수집·이용에 동의해요
            </Txt>
            <Txt size={12} color={colors.textSub} style={{ textDecorationLine: 'underline' }}>
              보기
            </Txt>
          </Pressable>
        </ScrollView>

        <View style={s.bottom}>
          <Button
            label="가입하기"
            disabled={!valid}
            onPress={async () => {
              await markNeedsRouteSetup(form.id);
              setDone(true);
            }}
          />
        </View>
      </KeyboardAvoidingView>

      {/* 가입 완료 창 */}
      <Modal visible={done} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDone(false)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.doneBadge}>
              <Icon source={icons.checkDone} size={28} />
            </View>
            <View style={{ gap: 8, alignItems: 'center' }}>
              <Txt size={18} weight="bold">
                가입되었습니다
              </Txt>
              <Txt size={13} lineHeight={1.4} color={colors.textSub} style={{ textAlign: 'center' }}>
                {'JUBJUB 계정이 만들어졌어요.\n로그인하고 공원 관리를 시작해 보세요.'}
              </Txt>
            </View>
            <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
              <Button
                label="홈으로 가기"
                onPress={() => {
                  setDone(false);
                  navigation.popTo('Login');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 16 },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  bottom: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12 },
  dim: { flex: 1, backgroundColor: 'rgba(34, 46, 69, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: {
    width: 310,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 16,
    ...softShadow,
  },
  doneBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgDone, alignItems: 'center', justifyContent: 'center' },
});
