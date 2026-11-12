// C-01 로그인
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { login } from '@/api/auth';
import { ApiError } from '@/api/client';
import { Button, Icon, LinkRow, Text, TextField } from '@/components';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { space } from '@/theme';

import { AuthLayout } from './AuthLayout';

/** C-01 로그인 → 가입 후 첫 로그인이면 C-03 순찰 경로 처음 설정, 아니면 A-01 홈 */
export function LoginScreen({ navigation }: NativeStackScreenProps<RootParams, 'Login'>) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const canSubmit = id.trim().length > 0 && pw.length > 0 && !busy;

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const { isFirstLogin } = await login({ loginId: id.trim(), password: pw });
      // 뒤로 가기로 로그인 화면에 돌아오지 않게 바꿔 끼워요. Main의 첫 탭이 A-01 홈이에요.
      navigation.replace(isFirstLogin ? 'RouteSetup' : 'Main');
    } catch (e) {
      // 401 아이디 · 비밀번호 틀림, 0 서버 연결 실패, 503 서버 설정 문제: 서버가 보낸 문구를 그대로 보여 줘요
      setError(e instanceof ApiError ? e.message : '로그인하지 못했어요. 잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  };

  const change = (set: (v: string) => void) => (v: string) => {
    set(v);
    setError(undefined);
  };

  return (
    <AuthLayout title={'공원을 돌보는 하루,\nJubi와 함께해요'} subtitle="관리자 계정으로 로그인해 주세요.">
      {/* 로그인 양식 */}
      <View style={s.form}>
        <TextField
          label="아이디"
          icon={icons.userRound}
          placeholder="아이디를 입력해 주세요"
          value={id}
          onChangeText={change(setId)}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
        />
        <TextField
          label="비밀번호"
          icon={icons.lockKeyhole}
          placeholder="비밀번호를 입력해 주세요"
          value={pw}
          onChangeText={change(setPw)}
          secure
          autoComplete="current-password"
          onSubmitEditing={() => canSubmit && submit()}
          error={error}
        />
        <Button label={busy ? '로그인하는 중…' : '로그인'} disabled={!canSubmit} onPress={submit} />
        <LinkRow lead="아직 계정이 없나요?" action="회원가입" onPress={() => navigation.navigate('SignUpEmail')} />
      </View>

      {/* 계정 도움말 */}
      <View style={s.help}>
        <Icon source={icons.circleHelp} size={16} />
        <Text variant="12-regular" color="textSub">
          계정이 기억나지 않으면 담당자에게 문의해 주세요.
        </Text>
      </View>
    </AuthLayout>
  );
}

const s = StyleSheet.create({
  form: { gap: space[20] },
  help: { flexDirection: 'row', justifyContent: 'center', gap: space[8] },
});
