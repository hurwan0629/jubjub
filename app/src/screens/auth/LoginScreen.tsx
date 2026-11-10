import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { View } from 'react-native';

import { takeFirstLoginRouteSetup } from '@/api/auth';
import { LinkRow, TextField, Button, Icon, Txt } from '@/components';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors } from '@/theme';

import { AuthLayout } from './AuthLayout';

/** C-01 로그인 */
export function LoginScreen({ navigation }: NativeStackScreenProps<RootParams, 'Login'>) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');

  return (
    <AuthLayout title={'공원을 돌보는 하루,\nJubi와 함께해요'} subtitle="관리자 계정으로 로그인해 주세요.">
      {/* 로그인 양식 */}
      <View style={{ gap: 20 }}>
        <TextField
          label="아이디"
          icon={icons.userRound}
          placeholder="아이디를 입력해 주세요"
          value={id}
          onChangeText={setId}
          autoCapitalize="none"
        />
        <TextField
          label="비밀번호"
          icon={icons.lockKeyhole}
          placeholder="비밀번호를 입력해 주세요"
          value={pw}
          onChangeText={setPw}
          secure
        />
        <Button
          label="로그인"
          onPress={async () => {
            // 가입 후 첫 로그인일 때만 순찰 경로 처음 설정(C-03)으로 가요
            const first = await takeFirstLoginRouteSetup(id);
            navigation.replace(first ? 'RouteSetup' : 'Main');
          }}
        />
        <LinkRow lead="아직 계정이 없나요?" action="회원가입" onPress={() => navigation.navigate('SignUp')} />
      </View>

      {/* 계정 도움말 */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <Icon source={icons.circleHelp} size={16} />
        <Txt size={12} color={colors.textSub}>
          계정이 기억나지 않으면 담당자에게 문의해 주세요.
        </Txt>
      </View>
    </AuthLayout>
  );
}
