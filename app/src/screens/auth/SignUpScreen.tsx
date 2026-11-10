import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { LinkRow, SignUpMethodButton } from '@/components';
import type { RootParams } from '@/navigation';

import { AuthLayout } from './AuthLayout';

/** C-04 회원가입 · 가입 방법 선택 */
export function SignUpScreen({ navigation }: NativeStackScreenProps<RootParams, 'SignUp'>) {
  return (
    <AuthLayout title={'JUBJUB와 함께\n공원을 돌봐요'} subtitle="가입 방법을 골라 주세요.">
      <View style={{ gap: 12 }}>
        {/* 카카오 · 구글 가입은 아직 연결된 화면이 없어요 */}
        <SignUpMethodButton kind="kakao" label="카카오톡으로 가입하기" />
        <SignUpMethodButton kind="google" label="구글로 가입하기" />
        <SignUpMethodButton kind="email" label="이메일로 가입하기" onPress={() => navigation.navigate('SignUpEmail')} />
      </View>
      <LinkRow lead="이미 계정이 있나요?" action="로그인" onPress={() => navigation.goBack()} />
    </AuthLayout>
  );
}
