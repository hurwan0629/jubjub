// C-04 회원가입 - 계정 정보 및 입력 오류. 다음 단계에서 공원을 선택해요.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { signUp } from '@/api/auth';
import { ApiError } from '@/api/client';
import type { Park } from '@/api/types';
import { Button, Checkbox, Header, Text, TextField } from '@/components';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import type { RootParams } from '@/navigation';
import { colors, layout, space } from '@/theme';
import { digitsOnly, formatPhone, INVALID, PASSWORD_MISMATCH, RULES } from '@/utils/validation';

import { PrivacyConsentDialog } from './PrivacyConsentDialog';
import { StepPark } from '../route-setup/steps';

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

/** C-04 가입 정보 → 공원 선택 → 가입 신청. 승인 전에는 로그인하지 않아요. */
export function SignUpEmailScreen({ navigation }: NativeStackScreenProps<RootParams, 'SignUpEmail'>) {
  const [form, setForm] = useState<Form>(EMPTY);
  // 칸을 벗어났거나 가입하기를 눌렀을 때부터 오류를 보여 줘요
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'form' | 'park' | 'done'>('form');
  const [park, setPark] = useState<Park | null>(null);
  const submission = useRef<AbortController | null>(null);
  useEffect(() => () => submission.current?.abort(), []);

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
    editable: !busy,
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

  const next = () => {
    setTouched({ loginId: true, password: true, password2: true, name: true, email: true, phone: true });
    if (!agreed || Object.values(errors).some(Boolean)) return;
    setFormError(undefined);
    setStage('park');
  };

  const submit = async () => {
    if (busy) return;
    setTouched({ loginId: true, password: true, password2: true, name: true, email: true, phone: true });
    if (!park || !agreed || Object.values(errors).some(Boolean)) return;
    const controller = new AbortController();
    submission.current = controller;
    setBusy(true);
    setFormError(undefined);
    try {
      await signUp({
        loginId: form.loginId,
        password: form.password,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: digitsOnly(form.phone),
        catalogId: park.id,
      });
      if (controller.signal.aborted) return;
      setForm(EMPTY);
      setStage('done');
    } catch (e) {
      if (controller.signal.aborted) return;
      if (!(e instanceof ApiError)) {
        setFormError('가입하지 못했어요. 잠시 후 다시 시도해 주세요');
      } else if (e.code === 'account_exists') {
        // 서버는 아이디 · 이메일 중 어느 쪽이 겹치는지 알려 주지 않아서 두 칸에 모두 보여 줘요
        setServerErrors({ loginId: e.message, email: e.message });
        setStage('form');
        setFormError('이미 제출한 가입 신청이 있다면 승인 후 로그인해 주세요.');
      } else if (e.status === 422 && e.details?.length) {
        // details[].field = "body.loginId" → 해당 칸 아래에 오류를 보여 줘요
        const fields = e.details.map((d) => d.field.split('.').pop()).filter((f): f is Field => !!f && f in EMPTY);
        if (fields.length) {
          setServerErrors(Object.fromEntries(fields.map((f) => [f, INVALID])));
          setStage('form');
        } else setFormError(e.message);
      } else {
        setFormError(e.message);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  if (stage === 'done')
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <Header title="회원가입" />
        <View style={s.confirmation}>
          <Text variant="18-bold">총관리자에게 회원가입 승인을 요청했습니다.</Text>
          <Text variant="15-bold" color="brandText">
            {park?.name}
          </Text>
          <Text variant="13-regular" color="textSub" lineHeight="relaxed">
            {'가입 정보와 담당 공원이 함께 제출되었어요.\n총관리자가 승인한 뒤 로그인할 수 있어요.'}
          </Text>
          <Button label="확인" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })} />
        </View>
      </SafeAreaView>
    );
  if (stage === 'park')
    return (
      <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
        <Header title="회원가입" onBack={busy ? undefined : () => setStage('form')} />
        <View style={s.flex} pointerEvents={busy ? 'none' : 'auto'}>
          <StepPark park={park} onPick={setPark} />
        </View>
        <View style={s.bottom}>
          {formError ? (
            <Text variant="12-regular" color="error" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <Button label={busy ? '가입 신청 중…' : '이 공원으로 정할게요'} disabled={!park || busy} onPress={submit} />
          <Button label="이전" variant="soft" disabled={busy} onPress={() => setStage('form')} />
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="회원가입" onBack={busy ? undefined : () => navigation.goBack()} />
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
          <View style={s.consent}>
            <Pressable
              style={s.consentCheck}
              onPress={() => setAgreed((a) => !a)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
            >
              <Checkbox checked={agreed} />
              <Text variant="13-regular" style={s.flex}>
                [필수] 개인정보 수집 · 이용 동의
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setConsentOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="개인정보 수집 및 이용 동의서 보기"
            >
              <Text variant="12-regular" color="textSub" style={s.underline}>
                보기
              </Text>
            </Pressable>
          </View>

          {formError ? (
            <Text variant="12-regular" color="error" accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={s.bottom}>
          <Button label="다음" disabled={!canSubmit} onPress={next} />
        </View>
      </View>

      <PrivacyConsentDialog
        visible={consentOpen}
        onAgree={() => {
          setAgreed(true);
          setConsentOpen(false);
        }}
        onClose={() => setConsentOpen(false)}
      />
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
  consentCheck: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  bottom: { paddingHorizontal: layout.screenPadding, paddingVertical: space[12], gap: space[8] },
  confirmation: { flex: 1, justifyContent: 'center', padding: layout.screenPadding, gap: space[16] },
});
