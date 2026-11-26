# 운영 에이전트 설계 (초안)

| 항목 | 내용 |
|---|---|
| 상태 | 초안 (개인 설계, 팀 검토 전) |
| 작성일 | 2026-11-26 |
| 관련 문서 | Confluence 요구사항 정의서 v0.7 (AGT), 로봇 - 서버 통신 v14, DB 설계서 / `server/ROBOT_PROTOCOL_API.md` |
| Jira | KAN-13 운영 에이전트 (KAN-125 ~ KAN-136) |

구현은 세 단계로 나눠요. 표와 목록의 **[1차]·[2차]·[3차]** 표시가 그 단계예요. 단계별 범위는 15장에 정리했어요.

| 단계 | 목표 | 한 줄 요약 |
|---|---|---|
| **1차** | 시연 필수 | 일일 보고 + 정규 순찰 제안 에이전트 + 판단 로그 |
| **2차** | 있으면 좋음 | 순찰 직전 순서 재조정 + 시간 예측 정교화 + 제안 종류 확장 |
| **3차** | 확장 | 커버리지 지도 + 탐색 순찰 제안 |

---

## 1. 개요

### 1.1 배경: 에이전트가 맡는 일이 바뀌었어요

요구사항과 Jira 초안은 에이전트가 로봇을 한 단계씩 조종하는 구조(`move_to`, `capture`, `pick` 도구)였어요. 이후 정한 로봇 - 서버 통신 규칙(v14)에서 많은 일이 로봇과 서버로 넘어갔어요.

| 원래 에이전트 몫 | 지금 하는 쪽 |
|---|---|
| 줍기·무시 판단, 재촬영, 담을 칸 (AGT-03·04·12) | 로봇이 스스로 판단하고 결과만 보냄 |
| 지점 막힘·줍기 실패 재시도 (AGT-05) | 로봇이 재시도 후 오류로 보고 |
| 정기 순찰 시작, 시작 못 함 처리, 오류 알림 생성 | 서버 규칙 (`robot_scheduler`, `robot_commands`, `robot_protocol`) |

그래서 에이전트는 **순찰 한 번보다 위에서, 쌓인 기록을 보고 판단·설명·제안하는 역할**을 맡아요.

### 1.2 설계 원칙

1. **숫자는 코드, 문장은 LLM**: 집계·좌표·시간은 코드가 계산하고, LLM은 그 결과를 해석하고 설명만 해요.
2. **규칙 먼저, LLM은 필요한 곳만**: 정해진 일은 워크플로로 처리하고, 판단이 필요한 개선 제안만 도구를 쓰는 에이전트로 만들어요.
3. **LLM이 실패해도 멈추지 않기**: 시간 초과·오류면 기본값(기존 순서, 템플릿 문장)으로 진행해요.
4. **바꾸는 건 사람이 승인**: 에이전트는 경로·시간표를 직접 바꾸지 않아요. 제안을 저장하고, 관리자가 적용해요. (순찰 직전 순서 재조정은 예외: 이번 순찰에만 적용되고 경로 자체는 안 바꿔요.)
5. **모든 판단은 기록**: 실행·도구 호출·결과·이유를 판단 로그에 남겨요.

---

## 2. 역할 요약

| # | 역할 | 단계 | 계기 | 방식 | 결과 | 관리자 승인 |
|---|---|---|---|---|---|---|
| 1 | 일일 보고 | 1차 | 매일 22:00, 수동 실행 | 워크플로 (집계 → LLM 요약) | `daily_reports` 저장, 알림 | 필요 없음 |
| 2 | 순찰 직전 순서 재조정 | 2차 | 순찰 시작 직전 (시간표·수동) | 워크플로 (규칙 점수 → LLM 이유) | 이번 순찰의 방문 순서 | 필요 없음 (이번 순찰만) |
| 3 | 운영 개선 제안 | | 주 1회, 앱 "제안 받기" | **에이전트** (도구 반복) | `agent_proposals` 저장 | **필요** |
| 3-1 | └ 정규 순찰 제안 | 1차 (일부 종류 2차) | | | 순서·지점·시간표 변경 제안 | |
| 3-2 | └ 탐색 순찰 제안 | 3차 | | | 안 본 구역 탐색 순찰 제안 | |
| 4 | 판단 로그 | 1차 | 1~3 실행 시 자동 | 기록 | `agent_runs`, `agent_steps` | - |

---

## 3. 구조

```
          [계기]                         [흐름]                                   [기록]
 22:00 스케줄 ──────────────► 일일 보고 (워크플로) ─────────────────────┐
 순찰 시작 직전 ─────────────► 순서 재조정 (워크플로, LLM 3초 제한) ─────┤   [2차]
 주 1회 / "제안 받기" ───────► 운영 개선 제안 (에이전트: 도구 반복) ─────┼──► agent_runs / agent_steps
                                   │  ├ 조회 도구 (기록)                  │     (+ Langfuse 추적)
                                   │  ├ 검증 도구 (시간·충돌·갈 수 있나)   │
                                   │  └ create_proposal → 관리자 승인 ───┘
   ▲ 코드 오케스트레이터가 계기를 알맞은 흐름에 연결 (LLM이 고르지 않음)
```

- **에이전트 하나 + 워크플로 둘** 구조예요. 계기가 시간·이벤트로 정해져 있어서, 상위 LLM이 할 일을 고르는 supervisor(멀티 에이전트)는 쓰지 않아요. 느려지고 결과만 불안정해져요.
- 에이전트다운 부분은 3번이에요. LLM이 조회·검증 도구를 골라 부르고, 결과가 안 되면 고쳐서 다시 확인해요.
- **위치**: `server/app/agent/` 모듈. 서버 DB, 스케줄러, 로봇 명령 코드를 그대로 써요. 서버는 Uvicorn worker 1개로 실행해요 (로봇 연결과 같은 제약).

### 3.1 파일 구성 (단계별로 늘려요)

**1차: 5개로 시작**

```
server/app/agent/
├─ stats.py          기록 집계 (탐지·지점·순찰·오류) — 일일 보고·제안·웹 보고 화면이 같이 씀
├─ llm.py            LLM 호출 (시간 제한, 재시도, 구조화 출력, 실패 시 기본값, Langfuse)
├─ logbook.py        판단 로그 기록 (agent_runs, agent_steps)
├─ daily_report.py   일일 보고 + 22:00 실행
└─ advisor.py        정규 순찰 제안 에이전트 (도구·간단한 시간 예측도 우선 이 파일 안에)
```

**2차: 나눠서 늘리기**

```
├─ orchestrator.py   계기 → 흐름 연결 (스케줄 등록, 실행 시작·종료 공통 처리)
├─ reorder.py        순찰 직전 순서 재조정
├─ tools.py          advisor.py에서 도구를 떼어 냄
└─ patrol_time.py    시간 예측을 떼어 내고 정교하게 (구간 속도·머문 시간·줍기 시간)
```

**3차: 탐색 순찰**

```
├─ slam_map.py       SLAM 지도 읽기, 갈 수 있는 칸, 길찾기(A*)
├─ coverage.py       커버리지 격자, 오래 안 본 구역
└─ sweep.py          탐색 순찰 지그재그 지점 만들기
```

이미 있는 서버 코드도 그대로 써요: 알림·푸시(`notifications`, `notification_push`), 순찰 시작·스케줄러(`robot_commands`, `robot_scheduler`), 경로·시간표 저장(`PUT /route`, `/schedules`), 좌표 변환(`robot_coordinates`).

---

## 4. 역할별 상세

### 4.1 일일 보고 [1차]

**계기**: 매일 22:00 공원(승인된 공원)마다 실행. 시연용 수동 실행 API도 둬요.

**집계 (코드)**

| 항목 | 출처 |
|---|---|
| 수거 수, 집기 성공률, 재질별 수 | `detections` (`pickup_result`, `material`) |
| 지점별·지점 사이 구간별 탐지 수 | `detections` 위치 → 가장 가까운 경로 지점(예: 30m 안), 밖이면 구간 |
| 시간대별 탐지 (2시간 단위) | `detections.detected_at` |
| 순찰 횟수와 결과 (완료·중지·중단·시작 못 함) | `robot_tasks` |
| 건너뛴 지점과 사유 | `robot_task_points` (`skipped`) |
| 오류 | `robot_errors` |
| 전날·지난주 같은 요일과 비교 | 지난 `daily_reports.metrics` |

**LLM (문장만)**: 집계 JSON을 넘기고 아래 형식으로 받아요.

```json
{
  "summary": "오늘 순찰 6번에서 쓰레기 24개를 주웠어요. 공연장 앞에서 가장 많이 나왔어요.",
  "check_points": [
    "벤치 쉼터를 두 번 건너뛰었어요. 길이 막혀 있는지 확인해 주세요.",
    "캔이 지난주보다 40% 늘었어요."
  ]
}
```

- 숫자는 집계에 있는 값만 쓰게 하고, 응답 숫자가 집계와 다르면 템플릿 문장으로 대체해요.
- LLM 실패 시: "오늘 순찰 n번, 수거 n개, 오류 n건이에요." 템플릿.
- 1차에서는 **LLM 없이 템플릿으로 먼저** 만들고, LLM 연결 후 요약으로 바꿔요.

**결과**: `daily_reports`에 저장하고 "일일 보고" 알림 생성 (기존 알림·푸시 경로 사용). 앱 A-10, 총관리자 웹 W-03이 읽어요.

### 4.2 순찰 직전 순서 재조정 [2차]

**계기**: `robot_commands.prepare_start`에서 `patrol_start`를 보내기 직전. 시간표 순찰과 수동 시작 모두.

**규칙 (코드)**

1. 지점마다 점수 = 최근 7일 같은 시간대(±2시간) 탐지 수 가중 평균. 최근일수록 가중치를 높여요.
2. 점수 높은 지점부터 방문하되, 이동 거리가 기존보다 일정 비율(예: 20%) 넘게 늘면 기존 순서를 유지해요.
3. 배터리가 기준보다 낮으면 점수 낮은 지점부터 빼서 예상 시간을 줄여요. (기준 전압 미정)
4. 제약: 출발·종료는 항상 분리수거장, 경로에 있는 지점만, **순서만** 바꿔요. 경로 자체는 그대로예요.

**LLM**: 바뀐 이유 한 줄만 써요 ("어제 같은 시간에 공연장 앞에서 많이 나와 먼저 들러요"). **3초 제한**, 넘으면 템플릿 이유로 진행해요. 순찰 시작이 LLM 때문에 늦어지면 안 돼요. 처음엔 규칙과 템플릿 이유만으로 만들고, LLM 이유는 나중에 붙여요.

**결과**: 이번 순찰 계획을 `robot_tasks.plan`에 저장하고 그 순서로 `patrol_start`를 보내요. 판단 로그에 기록해요.

**켜고 끄기**: 환경 변수(필요하면 공원 설정)로 끌 수 있게 해요. 끄면 기존 순서 그대로 보내요.

### 4.3 운영 개선 제안 (에이전트)

**계기**: 주 1회(예: 월요일 09:00) 로봇마다 실행 + 관리자가 앱·웹에서 "제안 받기".

**흐름**

```
① 코드가 기본 자료를 요약해서 처음에 넘김 (5장) ── 빠뜨리는 것 없이 항상 같은 내용
② 에이전트가 필요한 것만 더 조회 (지점 상세, 구간별 탐지, 안 본 구역)
③ 제안 후보를 검증 도구로 확인 (시간·배터리·시간표 충돌·갈 수 있나) → 안 되면 고쳐서 다시
④ create_proposal (서버가 한 번 더 검사) → 대기 상태로 저장
⑤ finish_run (이번 실행 요약, 제안이 없으면 그 이유)
⑥ 관리자가 앱에서 적용·무시 → 적용이면 기존 API로 경로·시간표 반영
```

**제한**: 실행 한 번에 도구 호출 최대 12회, 제안 최대 3개, 분석 기간 최대 30일.

#### 4.3.1 정규 순찰 제안 [1차·2차]

| kind | 단계 | 내용 | change 예시 |
|---|---|---|---|
| `check_point` | 1차 | 바꾸지 않고 현장 확인 요청 (연속 건너뜀 등) | `{"point_id": 15}` |
| `reorder_points` | 1차 | 정규 경로 순서 변경 | `{"order": [12, 9, 15, 11]}` |
| `add_schedule` | 1차 | 시간표 추가 | `{"run_at": "14:00", "repeat": "weekends"}` |
| `change_schedule` / `remove_schedule` | 2차 | 시간표 변경·삭제 | `{"schedule_id": 3, "run_at": "15:00"}` |
| `add_point` | 2차 | 지점 추가 (구간 탐지·탐색 순찰 결과 근거) | `{"name": "공연장 뒤", "lat": 37.52, "lng": 126.93, "after_point_id": 9}` |
| `remove_point` | 2차 | 지점 삭제 | `{"point_id": 15}` |

#### 4.3.2 탐색 순찰 제안 [3차]

로봇이 정규 경로에서 보지 못하는 구역을 한 번 훑어 보는 순찰이에요.

```
① get_coverage_gaps: 코드가 커버리지 격자로 "오래 안 본 구역" 목록을 줌
② 에이전트가 구역·시간 한도를 고름 ("북쪽 산책로 옆, 30분 안")
③ plan_sweep: 코드가 SLAM 지도 기준으로 지그재그 지점 + 예상 시간 + 커버리지 증가율 계산
④ 너무 길면 구역을 줄여 다시 ③ → 괜찮으면 create_proposal(kind="explore_patrol")
⑤ 관리자 승인 → 탐색 순찰 1회 실행 (task_type = 'explore')
⑥ 탐색에서 쓰레기가 나오면 다음 실행에서 add_point 제안으로 이어짐
```

- 좌표 계산은 LLM이 하지 않아요. LLM은 "어느 구역을, 몇 분 안에"만 정해요.
- 정규 경로를 지그재그로 바꾸지 않아요. 탐색은 한 번 또는 가끔이에요.

### 4.4 판단 로그 [1차]

**기록 대상**: 1~3의 모든 실행.

| 무엇 | 예 |
|---|---|
| 실행 (`agent_runs`) | 종류, 계기, 공원·로봇, 시작·종료, 결과, 요약, Langfuse trace id |
| 단계 (`agent_steps`) | 단계 종류(조회·검증·판단·제안·보고), 앱에 보일 한 줄 제목, 이유, 부른 도구, 입력·결과(요약 JSON) |
| 제안 (`agent_proposals`) | 근거(evidence), 바꿀 내용(change), 상태(대기·적용·무시·만료) |

- 앱 A-08 판단 로그 목록은 실행·단계의 한 줄 제목을, A-09 상세는 이유·근거·도구 결과를 보여줘요.
- 제안 상태는 다음 실행에서 `get_past_proposals`로 참고해요. 무시당한 제안을 반복하지 않으려는 거예요.

---

## 5. 에이전트에 넘기는 기본 자료 (운영 개선 제안)

코드가 매 실행 처음에 만들어 시스템 메시지와 함께 넘겨요. 몇천 토큰 이내로 요약해요. `segment_stats`는 2차, `coverage`는 3차부터 채워요.

```json
{
  "today": "2026-11-26",
  "period_days": 7,
  "robot": { "id": "22", "name": "JUBI-01", "battery_voltage": 11.4, "status": "idle" },
  "route": {
    "station": { "name": "분리수거장", "lat": 37.52, "lng": 126.93 },
    "points": [{ "seq": 0, "point_id": "12", "name": "공연장 앞" }, "..."]
  },
  "schedules": [{ "id": "3", "run_at": "10:00", "repeat": "daily", "enabled": true }],
  "point_stats": [{ "point_id": "12", "detections": 31, "arrived": 6, "skipped": 0, "errors": 0 }],
  "segment_stats": [{ "from": "12", "to": "9", "detections": 8 }],
  "hourly": [{ "range": "12-14", "weekday": 5, "weekend": 14 }],
  "patrol_results": { "completed": 12, "stopped": 1, "aborted": 1, "missed": 2, "median_minutes": 27 },
  "errors": [{ "code": "path_blocked", "count": 2, "near_point_id": "15" }],
  "coverage": { "seen_ratio": 0.41, "gap_count": 3 },
  "past_proposals": [{ "kind": "reorder_points", "status": "dismissed", "days_ago": 7 }]
}
```

---

## 6. 에이전트 도구

| 구분 | 도구 | 단계 | 입력 | 돌려주는 것 |
|---|---|---|---|---|
| 상세 조회 | `get_point_detail` | 1차 | point_id, days | 날짜별 도착·건너뜀(사유)·탐지·오류 |
| 상세 조회 | `get_detection_stats` | 1차 | days, group_by(`point`·`hour`·`weekday`·`material`) | 묶음별 탐지·줍기 성공·실패 수 |
| 상세 조회 | `get_segment_detections` | 2차 | days | 지점 사이 구간별 탐지 수, 탐지가 몰린 위치 |
| 상세 조회 | `get_coverage_gaps` | 3차 | days | 오래 안 본 구역 목록 (id, 중심 좌표, 넓이, 마지막으로 본 시각) |
| 검증 | `estimate_patrol` | 1차 (간단) → 2차 (정교) | 지점 순서(point_id 목록) | 예상 거리·시간·배터리 가능 여부, 경고, "기록 n회 기준/기본값 기준" |
| 검증 | `check_schedule_conflicts` | 1차 | run_at, repeat | 기존 시간표와 겹치는지 (예상 순찰 시간 기준) |
| 검증 | `check_reachable` | 3차 | 좌표 목록 | 각 좌표에 갈 수 있는지 (SLAM 지도 기준) |
| 계획 | `plan_sweep` | 3차 | gap_id 또는 구역, max_minutes | 지그재그 지점, 예상 시간, 커버리지 증가율 |
| 기억 | `get_past_proposals` | 1차 | days | 지난 제안과 결과 |
| 쓰기 | `create_proposal` | 1차 | kind, title, summary, reason, evidence[], change{} | 대기 상태로 저장 (서버 검사 후) |
| 쓰기 | `finish_run` | 1차 | summary | 실행 마무리 |

- 조회 도구는 **집계만** 돌려줘요. 원본 행을 넘기지 않아요.
- 모든 도구 호출은 공통 래퍼가 `agent_steps`에 자동 기록해요.
- `evidence`에는 어느 도구 결과의 어떤 숫자가 근거인지 적어요. 앱 제안 카드의 "근거"로 그대로 보여요.
  예: `{"tool": "get_point_detail", "point_id": "15", "skipped": 3, "reason": "blocked"}`
- `create_proposal` 서버 검사: 존재하는 지점·시간표인지, 공원 범위 안인지, 1km 규칙, 같은 대상에 대기 중인 제안이 있는지, (3차) 탐색 지점이 갈 수 있는 곳인지.

---

## 7. 코드 계산 모듈

### 7.1 순찰 시간 예측

**1차 (간단, `advisor.py` 안)**

- 같은 경로 그대로면: 최근 완료 순찰 시간의 **중앙값** (중지·중단 순찰 제외).
- 순서·시간표만 바꾸는 제안이면: 지점 사이 **직선 거리 × 1.3 ÷ 기본 속도** + 지점 수 × 기본 머문 시간.
- 결과에 "기록 n회 기준" 또는 "기본값 기준"을 붙여요.

**2차 (정교, `patrol_time.py`)**

```
예상 시간 = 이동 거리 ÷ 평균 속도
         + 지점 수 × 지점당 머문 시간
         + 예상 쓰레기 수 × 1개 줍는 시간
```

| 값 | 기록에서 구하는 법 | 기록이 없을 때 기본값 (예시) |
|---|---|---|
| 이동 거리 | 2차: 직선 거리 × 보정값 / 3차: SLAM 지도 길찾기 거리 | - |
| 평균 속도 | 지점 도착 시각 차이 ÷ 구간 거리 (`robot_task_points`) | 0.3 m/s (KAN-105 실측으로 교체) |
| 지점당 머문 시간 | 위치 로그에서 지점 근처 머문 시간 | 10초 |
| 1개 줍는 시간 | `detection` 시각 ~ `pick_result` 시각 | 30초 |
| 예상 쓰레기 수 | 지점·구간 최근 탐지 평균 | 0 |

- `robot_tasks.started_at`은 서버가 순찰을 만든 시각이라, 정확히는 로봇이 `working`이 된 첫 status 시각을 써요 (위치 로그 필요).
- 이 모듈은 `estimate_patrol`, `check_schedule_conflicts`, 순서 재조정, (3차) `plan_sweep`이 함께 써요.

### 7.2 커버리지 격자 (`coverage.py`) [3차]

- 공원을 1m 칸으로 나누고 칸마다 **마지막으로 본 시각, 본 횟수, 쓰레기 발견 수**를 저장해요.
- 위치 로그(x, y, yaw)마다 카메라가 보는 바닥 범위를 칠해요. **사진은 쓰지 않아요.**
  - 먼저 반경 원 (예: 2m). 쉽지만 옆·뒤까지 넓게 잡혀요.
  - 필요하면 바라보는 방향의 부채꼴 (예: 앞 0.5~2.5m, 좌우 60도).
- "오래 안 본 구역" = 갈 수 있는 칸 중 최근 N일 안 본 칸을 묶은 덩어리.
- 같은 격자로 쓰레기 밀도 히트맵도 만들어요 (앱 APP-09, 보고서).

### 7.3 탐색 순찰 지점 만들기 (`sweep.py`) [3차]

1. 훑을 칸 = 갈 수 있는 칸 ∩ 대상 구역 ∩ 최근 N일 안 본 칸. 장애물 주변은 로봇 크기만큼 제외.
2. 구역의 긴 방향으로 평행선. 간격 = 카메라 폭 × 0.8.
3. 갈 수 있는 곳만 남기고 자르기, 짧은 조각 버리기.
4. 조각 양 끝(+길면 중간)에 지점.
5. 지그재그로 잇기, 여러 조각은 분리수거장에서 가까운 순. 앞뒤에 분리수거장.
6. 지점 사이 길찾기(A*)로 확인 → 안 되면 제외. 예상 시간이 한도를 넘으면 가치 낮은 조각부터 빼기.
7. 경로를 따라 카메라 범위를 칠해 커버리지 증가율 계산.

출력: 지점 목록(SLAM 좌표, `pass: true`), 예상 시간, 커버리지 증가율.

---

## 8. DB 변경 (Alembic)

### 8.1 새 테이블

| 테이블 | 단계 | 주요 칼럼 |
|---|---|---|
| `daily_reports` | 1차 | park_id, report_date, metrics jsonb, summary, check_points jsonb, run_id, created_at · (park_id, report_date) 유일 |
| `agent_runs` | 1차 | id, kind(`daily_report`·`reorder`·`advisor`), trigger(`schedule`·`patrol_start`·`manual`), park_id, robot_id, status(`running`·`done`·`failed`), summary, trace_id, started_at, ended_at |
| `agent_steps` | 1차 | id, run_id, seq, step_type(`collect`·`query`·`validate`·`decide`·`propose`·`report`), title, reason, tool, input jsonb, output jsonb, created_at |
| `agent_proposals` | 1차 | id, park_id, robot_id, run_id, kind, title, summary, reason, evidence jsonb, change jsonb, status(`pending`·`applied`·`dismissed`·`expired`), created_at, decided_at, decided_by |
| `robot_pose_logs` | 2차 | robot_id, task_id, slam_x, slam_y, slam_yaw, battery_voltage, state, recorded_at · status 3초마다 (보관 기간 예: 30일) |
| `coverage_cells` | 3차 | park_id, cell_x, cell_y, last_seen_at, seen_count, detection_count · (park_id, cell_x, cell_y) 유일 |
| `slam_maps` | 3차 | park_id, version, resolution, origin_x, origin_y, width, height, image_key(R2), uploaded_at, is_active (APP-13과 공유) |

### 8.2 기존 테이블 변경

| 테이블 | 단계 | 변경 | 이유 |
|---|---|---|---|
| `robot_tasks` | 2차 | `plan jsonb` 추가: `[{"seq": 0, "point_id": 12}, ...]` | 순서 재조정에서 로봇이 보낸 seq를 실제 지점에 대응. 지금은 `route_points.seq`로 찾아서, 순서를 바꾸면 엉뚱한 지점에 기록돼요 |
| `robot_tasks` | 3차 | `task_type`에 `'explore'` 추가 (route_id 없음, trigger `'proposal'`) | 탐색 순찰 기록. 지금 제약은 `patrol`·`station_move`만 허용 |
| `robot_task_points` | 3차 | 탐색 순찰은 지나가기 지점이라 기록하지 않음 (point_id 필수 유지) | 탐색 지점은 정규 지점이 아님 |

2차에서 `point_arrived` 처리도 `robot_tasks.plan`이 있으면 거기서 지점을 찾도록 바꿔야 해요 (`server/app/services/robot_protocol.py`).

1차의 `reorder_points` 제안은 승인되면 **경로 자체**를 새 순서로 저장해서(`PUT /route`) `route_points.seq`가 바뀌므로, `plan` 칼럼 없이도 맞게 기록돼요.

---

## 9. API

### 9.1 조회 (앱·웹)

| 메서드 | 경로 | 단계 | 누가 | 내용 |
|---|---|---|---|---|
| GET | `/reports/{date}` | 1차 | 하위관리자 | 내 공원 일일 보고 (앱 A-10. 앱 `api/reports.ts`가 이미 이 경로를 씀) |
| GET | `/admin/parks/{park_id}/reports?date=` | 1차 | 총관리자 | 공원별 일일 보고 (웹 W-03. 웹 `getParkReports`가 이미 이 경로를 씀) |
| GET | `/logs?type=&limit=` | 1차 | 하위관리자 | 판단 로그 목록 (앱 A-08. 앱 `api/decisions.ts`가 이미 이 경로를 씀) |
| GET | `/logs/{run_id}` | 1차 | 하위관리자 | 판단 로그 상세: 단계·근거 (앱 A-09) |
| GET | `/robots/{robot_id}/proposals?status=` | 1차 | 하위관리자·총관리자 | 제안 목록 |
| GET | `/robots/{robot_id}/coverage?days=` | 3차 | 하위관리자·총관리자 | 커버리지·쓰레기 밀도 격자 |

앱 `DecisionType`(`plan`·`recapture`·`pick`·`store`·`empty`·`teleop` 등)은 예전 설계 기준이라, `report`·`reorder`·`proposal`·`explore`로 맞춰야 해요 (1차).

### 9.2 동작

| 메서드 | 경로 | 단계 | 누가 | 내용 |
|---|---|---|---|---|
| POST | `/robots/{robot_id}/proposals/generate` | 1차 | 하위관리자·총관리자 | "제안 받기" (운영 개선 제안 바로 실행, 연속 실행 제한) |
| POST | `/proposals/{id}/apply` | 1차 | 하위관리자 | 제안 적용. 정규 제안은 기존 `PUT /route`·`/schedules` 로직으로 반영. (3차) 탐색 제안은 탐색 순찰 시작 |
| POST | `/proposals/{id}/dismiss` | 1차 | 하위관리자 | 무시 (사유 선택 가능) |
| POST | `/admin/agent/daily-report?date=&parkId=` | 1차 | 총관리자 | 일일 보고 수동 실행 (시연용) |
| PUT | `/parks/{park_id}/slam-map` | 3차 | 총관리자·로봇 담당 | SLAM 지도(`map.pgm` + `map.yaml`) 업로드 (APP-13과 공유) |

- 경로가 바뀌면(`routes.applied_at`이 제안보다 새로우면) 대기 중인 제안은 `expired`로 바꿔요.
- 적용·무시도 판단 로그에 남겨요 ("관리자가 제안을 적용했어요").

---

## 10. 로봇 통신 규칙 변경 (Confluence "로봇 - 서버" 문서에 반영 필요)

| 변경 | 단계 | 내용 |
|---|---|---|
| 시계 동기화 | 1차 (전제) | 로봇 NTP 필수. `occurred_at`이 틀리면 지점·탐지 기록이 거절돼요 (hurwan 브랜치 로봇 상태 스냅샷에서 로봇 시계가 1970년으로 찍혀 있었어요) |
| 순서 재조정 | 2차 | 형식 변경 없음. `seq`는 방문 순서(0부터)이고, 서버가 `robot_tasks.plan`으로 실제 지점을 찾음 |
| `patrol_start.points[].pass` | 3차 | `true`면 멈추지 않고 지나가며 보기만 함. 쓰레기를 발견하면 평소처럼 줍기. 지나가기 지점은 `point_arrived`를 보내지 않음 |
| `patrol_start.data.kind` | 3차 | `patrol`(기본) / `explore`. 로봇 동작은 같고 로그 구분용 |

---

## 11. 실행 설정 (환경 변수)

```dotenv
# 1차
AGENT_ENABLED=false                 # 개발 기본값은 꺼둠
AGENT_DAILY_REPORT_AT=22:00
AGENT_ADVISOR_WEEKDAY=mon           # 운영 개선 제안 주기 실행
AGENT_ADVISOR_AT=09:00
AGENT_LLM_TIMEOUT_SECONDS=20
AGENT_MAX_TOOL_CALLS=12
AGENT_MAX_PROPOSALS=3
LLM_API_KEY=
LLM_MODEL=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=
PATROL_DEFAULT_SPEED_MPS=0.3
PATROL_DEFAULT_DWELL_SECONDS=10

# 2차
AGENT_REORDER_ENABLED=false         # 순서 재조정 (LLM 이유는 코드에서 3초 제한)
PATROL_DEFAULT_PICK_SECONDS=30

# 3차
CAMERA_VIEW_RADIUS_M=2.0            # 커버리지 (원)
```

---

## 12. LLM 사용 원칙

- 출력은 항상 **정해진 JSON 형식**으로 받고 서버가 검사해요. 형식이 틀리면 한 번 재시도, 그래도 틀리면 기본값.
- 문장은 해요체, 관리자가 바로 할 일을 알 수 있게.
- 숫자는 넘긴 자료에 있는 값만 쓰게 하고, 다르면 버려요.
- 사진·개인정보(이름·전화번호)는 LLM에 넘기지 않아요.
- 모든 호출을 Langfuse로 추적하고, `agent_runs.trace_id`에 연결해요.
- 실행당 토큰·호출 한도를 둬요.

---

## 13. 안전장치 요약

| 위험 | 막는 방법 |
|---|---|
| 잘못된 좌표로 로봇을 보냄 | 좌표는 코드만 만듦, 갈 수 있는지 길찾기로 확인, 탐색은 관리자 승인 후 |
| 경로·시간표를 마음대로 바꿈 | 에이전트는 제안 저장만, 적용은 관리자 |
| 순찰 시작이 늦어짐 | 순서 재조정 LLM 3초 제한, 실패 시 기존 순서 |
| 숫자를 지어냄 | 숫자는 코드 집계, 응답 숫자 검사 |
| 끝없이 도구 호출 | 호출 12회·제안 3개 한도 |
| 같은 제안 반복 | 지난 제안 조회, 같은 대상 대기 중 제안 중복 금지 |

---

## 14. 평가 계획

가짜 기록으로 상황을 만들어 같은 데이터에서 비교해요.

| 상황 | 기대 제안 | 단계 |
|---|---|---|
| 특정 지점이 3회 연속 건너뜀(blocked) | `check_point` | 1차 |
| 주말 13~15시에 탐지 집중 | `add_schedule` (주말 14:00) | 1차 |
| 탐지 1위 지점이 경로 후반 | `reorder_points` | 1차 |
| 아무 문제 없음 | 제안 없음 + 이유 | 1차 |
| 두 지점 사이 구간에서 반복 탐지 | `add_point` (구간 중간) | 2차 |
| 일주일 이상 안 본 넓은 구역 | `explore_patrol` | 3차 |

비교 방식: ① 코드가 다 모아 한 번에 보내기 ② 섞어 쓰기(이 설계) ③ 에이전트가 처음부터 직접 조회.
측정: 기대 제안을 찾았는지, 불가능한 제안을 냈는지, 걸린 시간, 토큰 비용.

---

## 15. 구현 단계

### 1차: 시연 필수

**목표**: 하루 기록을 보고(일일 보고), 다음 운영을 제안하고(정규 순찰 제안), 그 근거를 보여 주는(판단 로그) 흐름을 완성해요.

| 구분 | 범위 |
|---|---|
| 파일 | `stats.py`, `llm.py`, `logbook.py`, `daily_report.py`, `advisor.py` |
| 기능 | 일일 보고 (템플릿 → LLM 요약), 정규 순찰 제안 (`check_point`·`reorder_points`·`add_schedule`), 판단 로그 |
| 도구 | `get_point_detail`, `get_detection_stats`, `estimate_patrol`(간단), `check_schedule_conflicts`, `get_past_proposals`, `create_proposal`, `finish_run` |
| DB | `daily_reports`, `agent_runs`, `agent_steps`, `agent_proposals` |
| API | `/reports/{date}`, `/admin/parks/{id}/reports`, `/logs`, `/logs/{id}`, 제안 목록·생성·적용·무시, 일일 보고 수동 실행 |
| 앱·웹 | 앱 보고(A-10)·판단 로그(A-08·A-09) 서버 연결, `DecisionType` 정리, 제안 카드(적용·무시), 웹 공원별 보고(W-03) 서버 연결 |
| 완료 기준 | 가짜 기록 4가지 상황(14장 1차)에서 기대 제안이 나오고, 적용하면 경로·시간표가 바뀌고, 판단 로그에서 근거가 보임 |
| 의존 | LLM 결정·키, 로봇 NTP(시각 기반 집계) |

순서: ① 테이블·판단 로그 API → ② 일일 보고 (LLM 없이) → ③ LLM 연결·요약 → ④ 제안 에이전트·도구 → ⑤ 제안 API·앱 카드 → ⑥ 1차 평가

### 2차: 있으면 좋음

**목표**: 순찰을 시작할 때마다 이번 순찰 순서를 똑똑하게 정하고, 시간 예측과 제안 종류를 넓혀요.

| 구분 | 범위 |
|---|---|
| 파일 | `orchestrator.py`, `reorder.py`, `tools.py`(분리), `patrol_time.py`(분리·정교화) |
| 기능 | 순찰 직전 순서 재조정 (규칙 → LLM 이유), 시간 예측 정교화, 제안 종류 추가 (`add_point`·`remove_point`·`change_schedule`·`remove_schedule`) |
| 도구 | `get_segment_detections`, `estimate_patrol`(정교) |
| DB | `robot_pose_logs`, `robot_tasks.plan` |
| 서버 수정 | `robot_commands.prepare_start`에 순서 재조정 연결, `point_arrived`가 `plan`으로 지점 찾기, status 수신 시 위치 로그 저장 |
| 완료 기준 | 순서를 바꾼 순찰에서 지점 도착 기록이 맞는 지점에 붙고, 재조정 이유가 판단 로그에 남음. 구간 반복 탐지 상황에서 `add_point` 제안 |
| 의존 | 1차, 로봇 실제 속도(KAN-105), 배터리 기준 전압(지점 줄이기용) |

### 3차: 확장

**목표**: 로봇이 평소 보지 못하는 구역을 찾아 탐색 순찰을 제안하고, 그 결과로 정규 경로를 넓혀요.

| 구분 | 범위 |
|---|---|
| 파일 | `slam_map.py`, `coverage.py`, `sweep.py` |
| 기능 | 커버리지 격자·히트맵, 오래 안 본 구역 찾기, 지그재그 지점 생성, 탐색 순찰 제안·실행 |
| 도구 | `get_coverage_gaps`, `check_reachable`, `plan_sweep` |
| DB | `coverage_cells`, `slam_maps`, `robot_tasks.task_type = 'explore'` |
| API | SLAM 지도 업로드, 커버리지 조회, 제안 적용 시 탐색 순찰 시작 |
| 로봇 | `patrol_start`의 `pass`(지나가기) 처리, `kind` 구분 |
| 완료 기준 | 안 본 구역에 대해 갈 수 있는 지점만으로 탐색 순찰이 만들어지고, 승인 후 로봇이 돌고, 커버리지가 늘어남 |
| 의존 | 2차(위치 로그·시간 예측), SLAM 지도 서버 이전, 카메라 범위 측정, 로봇 측 구현 |

시간이 부족하면 3차는 **설계 완료, 구현은 확장**으로 발표해도 돼요. 커버리지 히트맵(위치 로그 + 원 반경)만 먼저 보여 주는 것도 방법이에요.

---

## 16. 미정·확인 사항

| 항목 | 단계 | 영향 |
|---|---|---|
| 사용할 LLM과 키 관리 | 1차 | 일일 보고 요약, 제안 에이전트 |
| 로봇 시계 동기화 (NTP) | 1차 | 모든 시각 기반 기록·집계 |
| 앱 제안 카드 화면 (Figma 시안 없음) | 1차 | 제안 적용·무시 UI |
| 로봇 실제 이동 속도·줍기 시간 (KAN-105) | 2차 | 시간 예측 기본값 |
| 배터리 기준 전압 (low_battery, 지점 줄이기 기준) | 2차 | 순서 재조정 |
| 순서 재조정을 공원별로 켜고 끌지 | 2차 | 설정 화면 필요 여부 |
| SLAM 지도를 서버로 옮기는 방법 | 3차 | 탐색 순찰, 길찾기 거리, APP-13 |
| 카메라가 보는 범위 (거리·각도) | 3차 | 커버리지 격자 |
| 로봇 측 `pass` 지점 처리 구현 | 3차 | 탐색 순찰 |
| 커버리지 지도 화면 (Figma 시안 없음) | 3차 | 앱 지도 표시 |
