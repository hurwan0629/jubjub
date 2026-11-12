import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar } from '@/components';
import { useUnreadCount } from '@/hooks/useNotifications';
import { AlertsScreen } from '@/screens/AlertsScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignUpEmailScreen } from '@/screens/auth/SignUpEmailScreen';
import { SignUpScreen } from '@/screens/auth/SignUpScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { MapScreen } from '@/screens/MapScreen';
import { ReportScreen } from '@/screens/ReportScreen';
import { RouteEditScreen } from '@/screens/route-edit/RouteEditScreen';
import { RouteSetupScreen } from '@/screens/route-setup/RouteSetupScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SplashScreen } from '@/screens/SplashScreen';

/** 홈 탭 안의 화면들. 설정에서도 하단 탭이 그대로 보여요 (Figma C-02) */
export type HomeStackParams = {
  HomeMain: undefined; // A-01 홈
  Settings: undefined; // C-02 설정 [확장]
};

export type TabParams = {
  Home: NavigatorScreenParams<HomeStackParams> | undefined;
  Map: undefined;
  Alerts: undefined;
  Report: undefined;
};

export type RootParams = {
  Splash: undefined; // C-00 시작화면 (3초)
  Login: undefined; // C-01 로그인
  SignUp: undefined; // C-04 회원가입
  SignUpEmail: undefined; // C-04 회원가입 - 이메일 (+ 완료 창)
  RouteSetup: undefined; // C-03 순찰 경로 처음 설정 (가입 후 첫 로그인)
  RouteEdit: undefined; // A-04 순찰 경로 편집 (A-02 지도 > 경로 편집)
  Main: undefined; // 하단 탭
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();

function HomeTab() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
    </HomeStack.Navigator>
  );
}

function MainTabs() {
  const unreadCount = useUnreadCount();
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} unreadCount={unreadCount} />}
    >
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Report" component={ReportScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'none' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="SignUpEmail" component={SignUpEmailScreen} />
      <Stack.Screen name="RouteSetup" component={RouteSetupScreen} />
      <Stack.Screen name="RouteEdit" component={RouteEditScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
}
