// C-04 회원가입 - 이메일 (+ C-04 회원가입 - 완료 · 입력 오류)
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { signUp } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button, Checkbox, Header, Icon, Text, TextField } from '@/components';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, softShadow, space } from '@/theme';
import { digitsOnly, formatPhone, INVALID, PASSWORD_MISMATCH, RULES } from '@/utils/validation';

type Field = 'loginId' | 'password' | 'password2' | 'name' | 'email' | 'phone';
type Form = Record<Field, string>;

const EMPTY: Form = { loginId: '', password: '', password2: '', name: '', email: '', phone: '' };

/** 칸마다 오류 문구 (없으면 undefined) */
function validate(f: Form): Partial<Record<Field, string>> {
  return {
    loginId: RULES.loginId.test(f.loginId) ? undefined : INVALID,
    password: RULES.password.test(f.password) ? undefined : INVALID,
    password2: f.password2 === f.password ? undefined : PASSWORD_MISMATCH,
    name: RULES.name.test(f.name.trim()) ? undefined : INVALID,
    email: RULES.email.test(f.email.trim()) ? undefined : INVALID,
    phone: RULES.phone.test(digitsOnly(f.phone)) ? undefined : INVALID,
  };
}

/** C-04 회원가입 - 이메일 → 가입 완료 창 */
export function SignUpEmailScreen({ navigation }: NativeStackScreenProps<RootParams, 'SignUpEmail'>) {
  const [form, setForm] = useState<Form>(EMPTY);
  // 칸을 벗어났거나 가입하기를 눌렀을 때부터 오류를 보여 줘요
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // 키보드가 올라오면 그 높이만큼 화면 아래를 비워서, 입력칸이 키보드에 가리지 않고 끝까지 스크롤돼요.
  // (안드로이드 edge-to-edge에서는 KeyboardAvoidingView가 동작하지 않아 직접 계산해요)
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const keyboardSpace = Math.max(0, keyboardHeight - insets.bottom);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [fieldY, setFieldY] = useState<Partial<Record<Field, number>>>({});
  const [focused, setFocused] = useState<Field | null>(null);

  // 키보드가 다 올라온 뒤(화면이 줄어든 뒤)나 키보드가 떠 있는 채로 다른 칸을 누르면,
  // 입력 중인 칸이 보이도록 그 칸을 화면 위쪽으로 올려요
  const focusedY = focused ? fieldY[focused] : undefined;
  useEffect(() => {
    if (keyboardHeight > 0 && focusedY !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, focusedY - space[16]), animated: true });
    }
  }, [keyboardHeight, focusedY]);

  const errors = validate(form);
  const errorOf = (k: Field) => serverErrors[k] ?? (touched[k] ? errors[k] : undefined);

  const set = (k: Field) => (v: string) => {
    setForm((f) => ({ ...f, [k]: k === 'phone' ? formatPhone(v) : v }));
    setServerErrors((e) => ({ ...e, [k]: undefined }));
    setFormError(undefined);
  };
  /** 칸마다 같은 연결: 값 · 입력 · 포커스 · 오류 · 위치 */
  const bind = (k: Field) => ({
    value: form[k],
    onChangeText: set(k),
    onFocus: () => setFocused(k),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    error: errorOf(k),
    onFieldLayout: (e: LayoutChangeEvent) => {
      const { y } = e.nativeEvent.layout;
      setFieldY((p) => (p[k] === y ? p : { ...p, [k]: y }));
    },
  });

  const filled = Object.values(form).every((v) => v.trim().length > 0);
  const canSubmit = filled && agreed && !busy;

  const submit = async () => {
    setTouched({ loginId: true, password: true, password2: true, name: true, email: true, phone: true });
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      await signUp({
        loginId: form.loginId,
        password: form.password,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: digitsOnly(form.phone),
      });
      setDone(true);
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setFormError('가입하지 못했어요. 잠시 후 다시 시도해 주세요');
      } else if (e.code === 'account_exists') {
        // 서버는 아이디 · 이메일 중 어느 쪽이 겹치는지 알려 주지 않아서 두 칸에 모두 보여 줘요
        setServerErrors({ loginId: e.message, email: e.message });
      } else if (e.status === 422 && e.details?.length) {
        // details[].field = "body.loginId" → 해당 칸 아래에 오류를 보여 줘요
        const fields = e.details.map((d) => d.field.split('.').pop()).filter((f): f is Field => !!f && f in EMPTY);
        if (fields.length) setServerErrors(Object.fromEntries(fields.map((f) => [f, INVALID])));
        else setFormError(e.message);
      } else {
        setFormError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="회원가입하기" onBack={() => navigation.goBack()} />
      <View style={[s.flex, { paddingBottom: keyboardSpace }]}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="아이디"
            placeholder="영문, 숫자 4~16자"
            {...bind('loginId')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
          />
          <TextField
            label="비밀번호"
            placeholder="영문, 숫자 포함 8자 이상"
            {...bind('password')}
            secure
            revealToggle={false}
            autoComplete="new-password"
          />
          <TextField
            label="비밀번호 확인"
            placeholder="비밀번호를 한 번 더 입력해 주세요"
            {...bind('password2')}
            secure
            revealToggle={false}
            autoComplete="new-password"
          />
          <TextField label="이름" placeholder="이름을 입력해 주세요" {...bind('name')} autoComplete="name" />
          <TextField
            label="이메일"
            placeholder="example@email.com"
            {...bind('email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
          <TextField
            label="전화번호"
            placeholder="010-1234-5678"
            {...bind('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={13}
          />

          {/* 개인정보 수집 · 이용 동의 */}
          <Pressable
            style={s.consent}
            onPress={() => setAgreed((a) => !a)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <Checkbox checked={agreed} />
            <Text variant="13-regular" style={s.flex}>
              [필수] 개인정보 수집 · 이용 동의
            </Text>
            <Text variant="12-regular" color="textSub" style={s.underline}>
              보기
            </Text>
          </Pressable>

          {formError ? (
            <Text variant="12-regular" color="error" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={s.bottom}>
          <Button label={busy ? '가입하는 중…' : '가입하기'} disabled={!canSubmit} onPress={submit} />
        </View>
      </View>

      {/* C-04 회원가입 - 완료 */}
      <Modal visible={done} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDone(false)}>
        <View style={s.dim}>
          <View style={s.dialog} accessibilityViewIsModal>
            <View style={s.doneBadge}>
              <Icon source={icons.checkDone} size={28} />
            </View>
            <View style={s.dialogText}>
              <Text variant="18-bold">가입되었습니다</Text>
              <Text variant="13-regular" color="textSub" lineHeight="normal" style={s.center}>
                {'JUBJUB 계정이 만들어졌어요.\n로그인하고 공원 관리를 시작해 보세요.'}
              </Text>
            </View>
            <View style={s.dialogButton}>
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
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[20],
    paddingBottom: space[24],
    gap: space[16],
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: space[16],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  underline: { textDecorationLine: 'underline' },
  bottom: { paddingHorizontal: layout.screenPadding, paddingVertical: space[12] },
  dim: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[24],
  },
  dialog: {
    width: 310,
    maxWidth: '100%',
    backgroundColor: colors.card,
    borderRadius: radius[20],
    paddingTop: 28,
    paddingBottom: space[24],
    paddingHorizontal: space[24],
    alignItems: 'center',
    gap: space[16],
    ...softShadow,
  },
  dialogText: { gap: space[8], alignItems: 'center' },
  center: { textAlign: 'center' },
  dialogButton: { alignSelf: 'stretch', marginTop: space[4] },
  doneBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgDone,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
