# 로봇 통신·제어 API

DB `20261123_0015`와 [로봇-서버 통신 문서](https://kdt-3team-finalterm.atlassian.net/wiki/x/AYC9)를 기준으로 구현했어요. 이번 변경에 추가 DB 마이그레이션은 없어요.

## 기존 API 변경

- 로봇 상태는 `idle`, `working`, `returning`, `emptying`, `offline`, `error`를 응답해요.
- 기존 로봇 조회에 `slamYaw`, `updatedAt`, `tokenIssuedAt`을 추가했어요. 배터리는 `batteryVoltage`만 제공하며 비율을 임의로 만들지 않아요.
- `POST /admin/robots`는 기존 로봇 응답에 `authToken`을 추가해요. 이 등록 응답에서만 원문을 볼 수 있어요.
- `POST /admin/robots/{robot_id}/token`은 `{robotId, authToken, tokenIssuedAt}`을 반환해요. 총관리자만 호출할 수 있고 기존 토큰과 연결은 만료돼요.
- 토큰 발급 응답은 `Cache-Control: no-store`예요. DB에는 SHA-256 해시만 저장하고 일반 로봇 조회에서는 원문·해시를 내보내지 않아요.

## 관리자용 API

사용자 JWT Bearer 인증이 필요해요. 하위관리자는 승인된 담당 공원의 로봇만, 총관리자는 전체 로봇을 조회·제어할 수 있어요.

| 메서드 | 경로 | 내용 |
|---|---|---|
| GET | `/robots/{robot_id}/state` | 기존 로봇 정보, currentTaskId, processedPoints |
| GET | `/robots/{robot_id}/tasks` | 작업 종류·경로·시작 이유·시각·결과 |
| GET | `/robots/{robot_id}/detections` | 탐지 UUID·분류·신뢰도·좌표·수거 결과 |
| GET | `/robots/{robot_id}/errors` | 오류 코드·행동·좌표·설명·시각 |
| GET | `/robots/{robot_id}/tasks/{task_id}/points` | 순찰 지점별 도착·건너뜀 기록 |
| POST | `/robots/{robot_id}/patrol/start` | 활성 경로로 순찰 시작 요청 |
| POST | `/robots/{robot_id}/patrol/stop` | 진행 중 순찰 중지 후 복귀 요청 |
| PUT | `/park/anchors` | 내 공원의 좌표 기준점 설정 |
| PUT | `/admin/parks/{park_id}/anchors` | 총관리자의 좌표 기준점 설정 |

목록은 `limit` 1~100(기본 20), `offset` 0 이상을 사용해요. ID는 응답에서 문자열이에요. 사진은 기존 `GET /detections/{id}/photo`로 임시 URL을 받아요. 담당 관리자와 총관리자만 조회할 수 있어요.

기준점 요청은 `{ "anchorPoints": [{"name":"기준점", "lat":37.5, "lng":127.0, "slam_x":0.0, "slam_y":0.0}, ...] }`예요. 서로 다른 두 위치가 필요하고 최대 20개까지 저장해요. 현재 변환은 앞의 두 점을 사용하며, 순찰 중에는 변경할 수 없어요.

시작 응답은 작업 기록과 로봇 응답의 `accepted`, `reason`을 포함해요. 연결이 없거나 대기 상태가 아니면 `result: missed`인 작업과 관리자 알림을 남겨요. 중지는 `accepted: true`일 때 상태만 `returning`으로 바꾸며 실제 종료는 로봇의 `patrol_end`를 기다려요.

명령의 ack를 시간 안에 못 받으면 504 `robot_command_timeout`을 반환해요. 실제 로봇은 이미 출발했을 수 있으므로 시작 작업을 자동으로 missed로 바꾸거나 다시 명령하지 않아요. 진행 중 기록은 이후 hello/status/종료 기록으로 대조해요. 진행 중 기록이 있는 로봇은 offline이어도 재배정·회수하지 못해요.

## 로봇 WebSocket

`/ws/robots`에 다음 헤더로 접속해요.

```http
X-Robot-Id: 22
Authorization: Bearer <발급받은 로봇 토큰>
```

사용자 로그인 JWT가 아닌 로봇 토큰이에요. 인증 실패는 종료 코드 4401, 기존 연결 교체는 4001, 토큰 재발급은 4003이에요. 교체된 연결은 재접속하지 않아야 해요.

- 첫 메시지는 `hello`예요. message_id와 request_id는 UUID, occurred_at은 시간대가 있는 ISO 8601이에요.
- `hello`, `status`로 상태·SLAM 좌표·방향·전압을 갱신해요. offline은 로봇이 보낼 수 없어요.
- `point_arrived`, `patrol_end`, `detection`, `pick_result`, `error`를 저장하고 ack(ok)를 보내요. status에는 ack를 보내지 않아요.
- 결과 기록과 message_id 수신 기록은 같이 커밋해 재전송을 중복 저장하지 않아요. hello는 재접속 시 같은 UUID로 재전송돼도 최신 상태를 다시 반영해요.
- 과거 오류를 재전송하면 기록과 알림은 남기되 더 최신인 상태를 덮어쓰지 않아요.
- 로봇이 보낸 순찰 ID와 지점 순서를 실제 소유 로봇·경로에 대조해요. 클라이언트가 임의의 robot_id를 메시지에 넣으면 검증 오류예요.
- JPEG를 검증한 뒤 `detections/{client_detection_id}.jpg`로 R2에 올려요. 저장에 실패하면 성공 ack를 보내지 않아요.
- 유효한 메시지가 10초간 없으면 연결을 닫고 offline으로 저장해요. 잘못된 메시지만 보내서 연결을 유지할 수는 없어요.
- 좌표 기준점이 없어도 hello/status의 SLAM 좌표는 저장해요. 위경도가 필수인 탐지·오류와 순찰 명령에는 기준점 설정이 필요해요.
- 잘못된 메시지에는 `{status,message,code}` 오류를 보내며 원문 사진·토큰은 오류에 포함하지 않아요.

## 실행 설정

```dotenv
ROBOT_COMMAND_TIMEOUT_SECONDS=5
ROBOT_HEARTBEAT_TIMEOUT_SECONDS=10
ROBOT_SCHEDULE_ENABLED=false
```

자동 순찰은 마지막 설정을 true로 바꾸고 서버를 재시작하면 켜져요. 한국 시간의 반복 요일과 시각을 5초마다 확인하고, 같은 로봇·분의 schedule 작업이 있으면 중복 실행하지 않아요. 실제 로봇에 명령을 보내므로 개발 기본값은 false예요.

연결은 프로세스 메모리에 있어 **Uvicorn worker 한 개**로 실행해야 해요. 여러 worker나 여러 서버 인스턴스에서 운영하려면 외부 연결 라우팅과 분산 실행 조정이 먼저 필요해요. 프록시에도 WebSocket upgrade 전달이 필요해요.

오류·순찰 누락의 알림과 푸시 대기열은 생성하지만, 실제 푸시 전송은 기존 Expo 설정과 `python -m app.scripts.send_notification_pushes --watch` 워커를 사용해요.

## 검증 범위

테스트용 SQLite와 모의 WebSocket 로봇·R2를 사용해요. 공용 DB의 로봇 토큰을 발급하거나 실물 로봇을 움직이는 테스트는 하지 않아요. 실물 시연 전 좌표 기준점, R2, 로봇 인증 헤더와 메시지 형식을 맞춰야 해요.
