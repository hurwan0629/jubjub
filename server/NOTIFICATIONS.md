# 알림·Expo Push API

프론트와 로봇 통신은 변경하지 않아요. 배정 승인·반려 등 서버 업무로 생성된 알림을 조회하고 기기 토큰을 관리해요.

## API

승인된 하위관리자와 총관리자가 자신의 Bearer 토큰으로 호출해요. 총관리자도 타인의 알림을 조회하거나 읽음 처리할 수 없어요. ID는 JSON에서 문자열이에요.

| Method | Path | 성공 응답 |
| --- | --- | --- |
| GET | /notifications | 200 내 알림 배열 |
| GET | /notifications/unread-count | 200 `{"count": 2}` |
| GET | /notifications/{notification_id} | 200 내 알림 객체 |
| PATCH | /notifications/{notification_id}/read | 200 읽음 처리한 알림 객체 |
| PUT | /push-tokens | 200 등록·갱신한 기기 정보 |
| DELETE | /push-tokens | 204 본문 없음 |

목록 query는 `type`(선택, 1~100자), `isRead`(선택, true/false), `limit`(기본 20, 1~100), `offset`(기본 0, 0~9223372036854775807)이에요. 최신 occurredAt·id 순서로 반환하고 결과가 없으면 `[]`예요. 미확인 개수는 페이지·필터와 관계없는 내 전체 미확인 수예요. Path ID는 1~9223372036854775807이에요.

```json
{
  "id": "41",
  "type": "robotAssignmentApproved",
  "title": "로봇 배정이 완료되었어요",
  "body": "예시공원에 로봇 2대를 배정했어요",
  "parkId": "5",
  "robotId": null,
  "position": null,
  "occurredAt": "2026-11-18T07:00:00Z",
  "isRead": false
}
```

position이 있으면 `{latitude, longitude}`예요. 일반 조회는 읽음 상태를 바꾸지 않아요. PATCH 읽음 처리는 본문 없이 호출하며 반복해도 같은 결과이고 발생 시각은 유지해요. 타인의 알림과 없는 알림은 모두 `404 notification_not_found`예요. 현재 프론트의 new/acked/resolved 상태와 다른 계약이며, 이번 변경은 프론트를 수정하지 않아요. 처리 완료·로봇 재확인 API는 포함하지 않아요.

## Expo 토큰 등록·해제

```json
{
  "token": "ExpoPushToken[device-token]",
  "platform": "android"
}
```

PUT 요청이에요. token은 ExpoPushToken 또는 ExponentPushToken 형식만 받고 platform은 android/ios예요. token은 최대 4096자이고 userId 같은 추가 입력은 거부해요. 같은 token을 upsert하며 등록 시각은 유지하고 마지막 갱신 시각·현재 소유자·플랫폼·활성 상태를 갱신해요. 한 사용자는 여러 기기를 등록할 수 있고 같은 토큰은 한 사용자에게만 연결해요.

```json
{
  "id": "7",
  "platform": "android",
  "isActive": true,
  "createdAt": "2026-11-18T07:00:00Z",
  "updatedAt": "2026-11-18T07:05:00Z"
}
```

응답에 토큰 원문·다른 사용자 정보는 넣지 않아요. DELETE는 아래 본문으로 현재 소유자의 토큰만 비활성화해요. 없거나 다른 사용자 소유여도 204를 반환하므로 소유권을 노출하지 않아요. 재등록하면 다시 활성화해요.

```json
{
  "token": "ExpoPushToken[device-token]"
}
```

앱 연결 시 로그인 후 PUT, 로그아웃할 때는 인증 토큰을 지우기 전에 DELETE를 호출해야 해요. 현재 백엔드는 이 API만 제공하고 로그인 요청에서 기기 토큰을 자동 추측하지 않아요.

## 발송·실패 재시도

- 배정 승인·반려의 notification과 기기별 notification_push_deliveries를 같은 트랜잭션에서 저장해요. 배정이 롤백되면 알림·대기열도 사라져요.
- 배정 API 커밋 후 BackgroundTasks가 발송을 시작해요. 실제 발송은 별도 DB 세션이므로 Expo 장애가 배정 결과를 되돌리지 않아요.
- 등록 당시 활성 기기에 대해 대기열을 만들어요. 기기가 없으면 앱 내 알림만 저장하고, 나중에 등록한 기기에 과거 알림을 일괄 푸시하지 않아요.
- 전송 직전 토큰의 현재 소유자·활성 상태·수신자의 가입 승인을 확인해요. 계정이 바뀌거나 해제된 토큰의 대기 작업은 취소해요.
- 잠금 화면에는 공원 이름·반려 사유 대신 JUBJUB의 일반 안내만 보내요. data.notificationId로 자신의 상세 API를 조회해야 내용을 볼 수 있어요.
- Expo 접수 티켓을 저장하고 15분 뒤 영수증을 확인해요. submitted는 Expo 접수 상태, delivered는 FCM/APNs 처리 성공이며 사용자가 읽었다는 뜻이 아니에요.
- 네트워크·429·5xx 오류는 지수 간격으로 최대 5회 전송을 시도해요. 접수된 티켓은 영수증 조회만 재시도해 불필요한 재발송을 줄여요. 영수증 확인은 최대 24시간이에요.
- DeviceNotRegistered 응답은 토큰을 비활성화해요. InvalidCredentials 등 설정 오류는 영구 실패로 기록해요. 실제 사용자 알림은 삭제하지 않아요.
- 여러 워커는 SKIP LOCKED로 같은 행의 동시 처리를 피하고 기기별 성공·실패를 따로 보존해요. 외부 서비스 접수 직후 프로세스가 중단되면 중복 전송 가능성이 있어 정확히 한 번 전송을 보장하지는 않아요.

## 서버 설정·워커

`.env.example`의 다음 값을 운영 `.env`에 설정해요.

```dotenv
EXPO_PUSH_ENABLED=true
EXPO_PUSH_BASE_URL=https://exp.host/--/api/v2/push
EXPO_PUSH_ACCESS_TOKEN=
EXPO_PUSH_TIMEOUT_SECONDS=10
```

기본값은 enabled=false예요. Expo 프로젝트에서 FCM/APNs 자격 증명을 준비하고 앱에서 Expo 토큰을 발급받아 등록해야 실제 수신할 수 있어요. enhanced push security를 사용하면 서버 액세스 토큰도 넣어요. 키와 기기 토큰은 로그·문서에 노출하지 않아요.

재시도·영수증 확인은 주기 워커가 필요해요. 서버 디렉터리에서 실행해요.

```sh
python -m app.scripts.send_notification_pushes --watch --interval 30 --limit 50
```

한 번만 처리하려면 --watch를 생략해요. enabled=false에서는 DB·외부 네트워크에 접근하지 않아요. 별도의 공개 푸시 발송 API는 제공하지 않아요.

마이그레이션 `20261118_0011`이 기존 push_tokens에 is_active를 추가하고 발송 대기열을 생성해요. 기존 토큰은 활성 상태로 보존하고 대기열에 RLS·중복 방지·상태 제약을 적용해요.

입력 오류는 `422 validation_error`, DB 처리 실패는 `503 notifications_unavailable`이며 기존 공통 인증 오류를 유지해요.

공식 발송·영수증 계약: https://docs.expo.dev/push-notifications/sending-notifications/
