import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon, Text } from '@/components';
import { icons } from '@/icons';
import type { RootParams } from '@/navigation';
import { colors, space } from '@/theme';

const SHOW_MS = 3000;

/** C-00 시작화면: 앱을 켜면 3초 보여 준 뒤 로그인으로 가요. 눌러도 바로 넘어가요 (Figma 프로토타입과 같아요) */
export function SplashScreen({ navigation }: NativeStackScreenProps<RootParams, 'Splash'>) {
  useEffect(() => {
    const t = setTimeout(() => navigation.replace('Login'), SHOW_MS);
    return () => clearTimeout(t);
  }, [navigation]);

  return (
    <Pressable style={s.screen} onPress={() => navigation.replace('Login')} accessibilityLabel="JUBJUB 시작화면">
      <StatusBar style="light" />
      <Icon source={icons.jubjubSplash} size={140} />
      <Text variant="logo-52" color="card">
        JUBJUB
      </Text>
      <Text variant="15-regular" color="card" style={s.tagline}>
        공원 로봇 Jubi와 깨끗한 하루를 함께해요
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', gap: space[20] },
  tagline: { opacity: 0.85, textAlign: 'center' },
});
