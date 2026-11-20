import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { LatLng } from '@/api/types';
import { TabBar } from '@/components';
import { useUnreadCount } from '@/hooks/useNotifications';
import { AlertDetailScreen } from '@/screens/alerts/AlertDetailScreen';
import { AlertsScreen } from '@/screens/AlertsScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { ParkApprovalScreen } from '@/screens/auth/ParkApprovalScreen';
import { SignUpEmailScreen } from '@/screens/auth/SignUpEmailScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { DecisionDetailScreen } from '@/screens/logs/DecisionDetailScreen';
import { DecisionLogScreen } from '@/screens/logs/DecisionLogScreen';
import { MapScreen } from '@/screens/MapScreen';
import { ReportScreen } from '@/screens/ReportScreen';
import { RobotListScreen } from '@/screens/robots/RobotListScreen';
import { RouteEditScreen } from '@/screens/route-edit/RouteEditScreen';
import { RouteSetupScreen } from '@/screens/route-setup/RouteSetupScreen';
import { OperationSettingsScreen } from '@/screens/settings/OperationSettingsScreen';
import { ParkChangeScreen } from '@/screens/settings/ParkChangeScreen';
import { StationEditScreen } from '@/screens/settings/StationEditScreen';
import { StationListScreen } from '@/screens/settings/StationListScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { SplashScreen } from '@/screens/SplashScreen';

/** 홈 탭 안의 화면들. 설정에서도 하단 탭이 그대로 보여요 (Figma C-02) */
export type HomeStackParams = {
  HomeMain: undefined; // A-01 홈
  Settings: undefined; // C-02 설정 [확장]
  OperationSettings: undefined; // A-12 운영 설정
};

/** 보고 탭 안의 화면들. 판단 로그도 하단 탭이 그대로 보여요 (Figma A-08) */
export type ReportStackParams = {
  ReportMain: undefined; // A-10 보고
  DecisionLog: undefined; // A-08 판단 로그
};

export type TabParams = {
  Home: NavigatorScreenParams<HomeStackParams> | undefined;
  Map: undefined;
  Alerts: undefined;
  Report: NavigatorScreenParams<ReportStackParams> | undefined;
};

export type RootParams = {
  Splash: undefined; // C-00 시작화면 (3초)
  Login: undefined; // C-01 로그인
  SignUpEmail: undefined; // C-04 회원가입 - 계정 정보
  ParkApproval: undefined; // 총관리자 전용 관리 화면 준비 안내
  RouteSetup: undefined; // C-03 공원 승인 후 순찰 경로 처음 설정
  RouteEdit: undefined; // A-04 순찰 경로 편집 (A-02 지도 > 경로 편집)
  RobotList: undefined; // A-13 로봇 목록 (A-01 홈 > 로봇 목록)
  AlertDetail: { id: string }; // A-06 알림 상세
  DecisionDetail: { id: string }; // A-09 판단 로그 상세
  ParkChange: undefined; // C-02 공원 변경 요청
  StationList: undefined; // C-02 분리수거장 관리
  StationEdit: { id?: string; position?: LatLng }; // C-02 분리수거장 편집 (id 없으면 추가)
  Main: NavigatorScreenParams<TabParams> | undefined; // 하단 탭
};

const Tab = createBottomTabNavigator<TabParams>();
const Stack = createNativeStackNavigator<RootParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();
const ReportStack = createNativeStackNavigator<ReportStackParams>();

function ReportTab() {
  return (
    <ReportStack.Navigator screenOptions={{ headerShown: false }}>
      <ReportStack.Screen name="ReportMain" component={ReportScreen} />
      <ReportStack.Screen name="DecisionLog" component={DecisionLogScreen} />
    </ReportStack.Navigator>
  );
}

function HomeTab() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Settings" component={SettingsScreen} />
      <HomeStack.Screen name="OperationSettings" component={OperationSettingsScreen} />
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
      <Tab.Screen name="Report" component={ReportTab} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} options={{ animation: 'none' }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="SignUpEmail" component={SignUpEmailScreen} />
      <Stack.Screen name="ParkApproval" component={ParkApprovalScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="RouteSetup" component={RouteSetupScreen} />
      <Stack.Screen name="RouteEdit" component={RouteEditScreen} />
      <Stack.Screen name="RobotList" component={RobotListScreen} />
      <Stack.Screen name="AlertDetail" component={AlertDetailScreen} />
      <Stack.Screen name="DecisionDetail" component={DecisionDetailScreen} />
      <Stack.Screen name="ParkChange" component={ParkChangeScreen} />
      <Stack.Screen name="StationList" component={StationListScreen} />
      <Stack.Screen name="StationEdit" component={StationEditScreen} />
      <Stack.Screen name="Main" component={MainTabs} />
    </Stack.Navigator>
  );
}
