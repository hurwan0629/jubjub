// 총관리자 전용 관리 UI가 추가되기 전의 진입 안내 화면.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { logout } from '@/api/account';
import { Button, Header, Text } from '@/components';
import type { RootParams } from '@/navigation';
import { colors, layout, radius, space } from '@/theme';

export function ParkApprovalScreen({ navigation }: NativeStackScreenProps<RootParams, 'ParkApproval'>) {
  const exit = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      <Header title="총관리자" />
      <View style={s.content}>
        <View style={s.card}>
          <Text variant="18-bold">총관리자 계정이에요</Text>
          <Text variant="13-regular" color="textSub" lineHeight="relaxed">
            회원가입 신청 관리 화면은 준비 중이에요. 현재는 총관리자 API에서 신청자 정보와 담당 공원을 확인해
            승인·반려할 수 있어요.
          </Text>
          <Button label="로그인 화면으로" variant="soft" onPress={exit} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: layout.screenPadding },
  card: { backgroundColor: colors.card, borderRadius: radius[20], padding: space[24], gap: space[16] },
});
