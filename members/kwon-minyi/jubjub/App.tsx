import { Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_600SemiBold, NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation';
import { colors } from './src/theme';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

export default function App() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_600SemiBold,
    NotoSansKR_700Bold,
    Fredoka_700Bold,
  });
  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
