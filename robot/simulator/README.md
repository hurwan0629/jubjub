# 로봇 시뮬레이터

실제 로봇 없이 서버의 로봇 접속(`/ws/robots`)을 시험하는 스크립트예요. 규칙은 Confluence "로봇 - 서버" 문서를 따라요.
지금은 **연결 단계만** 해요: 접속(토큰 인증) → hello → 3초마다 status → 끊기면 재접속.
순찰 명령(`patrol_start` 등)이 오면 `rejected / not_supported`로 답해요.

hurwan 브랜치 `robot/test_server/client_script/client6`의 WebSocket 구조를 참고했어요. 실제 로봇 코드로 옮길 때는 `FakeRobot` 부분만 ROS 토픽 값(위치·배터리)으로 바꾸면 돼요. 로봇(Python 3.10)에서도 돌도록 3.10 문법만 써요.

## 실행

1) 서버를 켜요 (`server/README.md` 참고).

```bash
cd server && .venv/Scripts/uvicorn app.main:app --reload --host 0.0.0.0
```

2) 로봇 토큰을 발급해요. 총관리자 API `POST /admin/robots/{id}/token`을 써도 되고, 화면 없이 아래 스크립트로 해도 돼요. **공용 DB에 바로 저장되니 팀에 알리고** 해요. 토큰은 한 번만 보여줘요.

```bash
cd server && .venv/Scripts/python scripts/robot_token.py --list
```

```bash
cd server && .venv/Scripts/python scripts/robot_token.py --robot-id 1
```

시뮬레이터용 로봇을 따로 만들려면 `--create "시뮬레이터 1" --serial SIM-001`을 써요.

3) 시뮬레이터를 켜요. `websockets` 라이브러리가 필요한데 서버 가상환경에 이미 있어요.

```bash
server/.venv/Scripts/python robot/simulator/robot_sim.py --robot-id 1 --token <발급받은 토큰>
```

다른 PC의 서버에 붙을 때는 `--server ws://<서버 PC IP>:8000/ws/robots`을 붙여요.

## 확인할 수 있는 것

| 상황 | 시뮬레이터 | 서버 |
|---|---|---|
| 정상 접속 | `← ack {'result': 'ok'}` 후 3초마다 `→ status` | `robot_states`의 status·위치·배터리·last_seen_at 갱신 |
| 토큰이 틀림 | `멈춤: 인증 실패 (HTTP 403)`, 재시도 안 함 | 접속 거절 로그 |
| 같은 id로 하나 더 켬 | 먼저 켠 쪽이 `멈춤: … 교체됐어요` (종료 코드 4001) | 새 연결만 유지 |
| 토큰 재발급 | `멈춤: 토큰이 바뀌었거나…` (4003·4401) | 예전 토큰 연결을 끊음 |
| 시뮬레이터를 끔 (Ctrl+C) | | `robot_states.status`가 `offline` |
| 서버를 끔 | 1 → 2 → 4 … 최대 30초 간격으로 재접속 | 다시 켜면 자동으로 붙음 |
| 10초 넘게 소식 없음 | 서버가 끊음 (4000) → 재접속 | `offline`으로 바꾸고 연결 정리 |

## 서버 쪽 코드

- `server/app/routers/robot_protocol.py`: `/ws/robots` 접속·인증·메시지 처리, 순찰 시작·중지·토큰 재발급 API
- `server/app/services/robot_protocol.py`: 메시지별 저장 (hello·status·지점 도착·탐지·오류 등)
- `server/app/services/robot_connections.py`: 접속 중인 로봇 연결 보관 (메모리)
- `server/app/services/robot_tokens.py`, `server/scripts/robot_token.py`: 토큰 발급
- 자세한 규칙: `server/ROBOT_PROTOCOL_API.md`
