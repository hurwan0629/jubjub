// app.json 위에 환경 변수로 정하는 설정을 더해요.
// 네이버 지도 Client ID는 git에 올리지 않도록 .env 의 NAVER_MAP_CLIENT_ID 에서 읽어요 (.env.example 참고).
import type { ConfigContext, ExpoConfig } from 'expo/config';

const naverMapClientId = process.env.NAVER_MAP_CLIENT_ID;

if (!naverMapClientId) {
  console.warn('[app.config] NAVER_MAP_CLIENT_ID 가 비어 있어요. 네이버 지도가 인증 오류로 뜨지 않아요.');
}

// Expo 설정 파일은 기본 내보내기(export default)만 읽어요. (화면 코드의 named export 규칙의 예외)
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    // 네이버 지도 SDK (개발용 빌드에서만 동작해요. Expo Go에서는 안 떠요)
    ['@mj-studio/react-native-naver-map', { client_id: naverMapClientId ?? '' }],
  ],
});
