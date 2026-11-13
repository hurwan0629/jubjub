# 공원 지정과 순찰 설정 (KAN-93)

모든 API는 `Authorization: Bearer <accessToken>`이 필요해요.
앱은 Supabase에 직접 접근하지 않아요. 요청에 userId/parkId를 보내도 권한으로 사용하지 않고
로그인한 관리자의 공원에만 접근해요.

## 프론트 연결 순서

1. 기존 `GET /parks`로 검색하고 공원을 골라요.
2. `PUT /park`에 `{"catalogId":"검색 결과 id"}`를 보내 공원을 신청해요.
3. `GET /park`의 status가 approved가 된 뒤 지도에서 분리수거장·순찰 지점·시간표를 정해요.
4. 완료 버튼에서 `PUT /route`에 아래 전체 설정을 보내요.
5. 성공 후에만 완료 화면/홈으로 이동해요. 실패하면 입력을 유지하고 오류를 표시해요.
6. 이후 경로 편집은 `GET /route`로 읽고 `PUT /route`로 저장해요.

```json
{
  "station": {"latitude": 37.5, "longitude": 127},
  "points": [
    {"id": "앱의 임시 ID", "name": "잔디광장", "position": {"latitude": 37.501, "longitude": 127.001}}
  ],
  "schedule": [
    {"id": "앱의 임시 ID", "time": "10:00", "label": "오전 순찰", "on": true, "repeat": "daily"}
  ]
}
```

위 좌표는 구조 예시예요. 실제 선택한 공원의 경계 안 좌표를 보내야 해요.
`PUT /route` 응답은 앱의 기존 `RouteConfig`와 같은
`{parkName,bounds,area,station,points,schedule}`예요.
parkName/bounds/area를 요청에 포함해도 `catalog_id`로 연결된 검색 목록의 공원 정보를 사용해요.
응답의 points/schedule ID는 서버가 발급하므로 응답으로 앱 상태를 갱신해요.
초기 설정도 경로 편집도 전체 설정을 원자적으로 저장해요. 한 항목이라도 실패하면 모두 되돌려요.
성공하면 `parks.route_setup_done=true`로 저장해 다음 로그인에서 `isFirstLogin=false`예요.
승인·반려·로봇 할당과 역할별 앱 분기는 [ADMIN.md](ADMIN.md)를 확인해요.
현재 로컬 C-03의 완료 버튼은 단계 이동만 하므로 프론트에서 위 호출을 연결해야 해요.

## API 목록

| API | 요청/응답 |
| --- | --- |
| GET /park | 운영 공원. 미선택 시 404 |
| PUT /park | `{catalogId}` → 공원 정보와 status/approvedBy/approvedAt/rejectReason/routeSetupDone |
| GET /station | `{latitude,longitude}` 또는 미등록이면 null |
| PUT /station | `{latitude,longitude}` → 저장 좌표 |
| GET /routes | `{id,start,points,end,appliesFrom:"nextPatrol"}`. 경로 미등록이면 id=null, points=[] |
| PUT /routes | `{points:[{id?,name,position}]}` → 새 경로. 초기 설정 완료 상태는 자동 변경하지 않아요 |
| GET /schedules | 시간표 배열 |
| PUT /schedules | `[{id?,time,label,on,repeat}]` → 저장 배열. 전체 교체예요 |
| GET /route | 앱 RouteConfig 전체 조회 |
| PUT /route | 전체 설정 저장과 초기 설정 완료 |
| POST /route/complete | 분리 API로 저장한 설정 검증 후 `{routeSetupDone:true}` |

`/park` 외에는 공원 미선택 시 409 `park_required`예요.
pending/rejected에서 다른 공원을 고르면 동일 parks 행의 catalog_id를 변경하며, 이전 지점은 논리 삭제하고 경로는 비활성화해요.
시간표와 설정 완료 여부도 초기화해요. approved에서 다른 공원으로 변경하면 로봇의 할당 대상도 바뀌므로 거부해요.
중간 단계별 저장 대신 전체 완료 시 저장하려면 `PUT /park` 다음 `PUT /route`를 호출하세요.
두 요청은 별도 트랜잭션이므로 전체 설정이 실패해도 선택한 공원은 남아요.

## 검증과 저장 방식

- 관리자당 공원 1개, 공원당 현재 분리수거장 1개·활성 경로 1개를 DB 제약으로 보장해요.
- 경로는 순찰 지점 1~100개, 지점 이름은 공백 제거 후 1~100자예요. 같은 좌표는 중복 불가예요.
- 분리수거장과 순찰 지점은 연결된 검색 목록의 현재 공원 다각형 안이어야 해요. 내부 구멍은 제외해요.
- 순찰 지점은 분리수거장과 연결된 기존 지점에서 1km 이내여야 해요.
- 분리수거장이 없으면 409 `station_required`, 경계 밖은 422 `point_outside_park`,
  거리 초과는 422 `point_too_far`와 `details.distanceMeters/maxDistanceMeters`를 반환해요.
- 시간은 한국 시간 기준 HH:mm, repeat는 daily/weekdays/weekends예요.
  같은 시각에 반복 요일이 겹치면 422 `duplicate_schedule`이에요. 최대 100개예요.
- 전체 설정 완료에는 시간표 최소 1개가 필요해요. 모두 꺼진 상태도 허용해요.
  분리 API로 시간표를 빈 배열로 저장하면 설정 완료 상태를 해제해요.
- 경로 변경은 새 routes/points/route_points로 저장하고 이전 지점은 논리 삭제해요.
  각 routes.station_id가 출발·종료 위치를 고정해 분리수거장을 옮겨도 이전 버전이 유지돼요.
- `route_points`에는 순찰 지점만 저장해요. `GET /routes`의 start/end가 분리수거장이에요.
- 분리수거장 위치만 옮겨도 활성 경로가 있으면 새 경로 버전을 만들고 거리 조건을 재검증해요.
- 경로 변경마다 agent_runs/agent_steps에 “관리자 경로 수정” 로그를 함께 저장해요.
  이 테이블은 이번에 필요한 로그 필드만 도입했어요. 인식·작업 FK는 해당 기능 구현 시 추가해요.

## 로봇 연동 시 지킬 계약

활성 경로는 **다음 순찰이 읽을 설정**이에요. 실행 중인 순찰은 시작 때 route ID를 고정해서
기존 버전을 끝까지 사용해야 해요. `applied_at`은 실행기가 실제 적용할 때 기록하며 API는 NULL로 둬요.
지점의 SLAM 좌표는 NULL이에요. 실제 이동 가능한 경로 계산·장애물 판정·시간표 자동 실행은
이번 저장 API에 포함하지 않아요. 이 API의 좌표 목록을 실제 주행 경로로 표시하면 안 돼요.

## DB 적용

2026-11-13 사용자 요청으로 현재 연결된 공유 Supabase에 `20261113_0003`을 적용했어요.
다른 DB 환경에 적용할 때는 server/에서 실행해요.

```powershell
alembic upgrade head
```

새 테이블 7개에 RLS를 켜고 공개 정책을 만들지 않아요. 서버 DB 계정으로만 접근해요.
`parks`에는 id/user_id/catalog_id/created_at과 승인 메타데이터·route_setup_done을 저장해요. 이름·주소·중심 좌표·bounds·area는
`park_catalog_entries`에서 연결 조회하며 중복 저장하지 않아요. API 응답 모양은 그대로예요.
검색 목록을 갱신하면 운영 공원 조회와 이후 위치 검증에도 최신 정보가 반영돼요.
기존 순찰 지점은 자동으로 옮기거나 삭제하지 않으므로 경계 갱신 시 기존 지점의 위치도 확인해야 해요.
목록에서 비활성화된 항목은 새로 선택할 수 없지만, 이미 연결된 운영 공원에서는 계속 조회할 수 있어요.

DB 설계서 대비 parks의 정보 컬럼 대신 catalog_id를 사용하고 routes.station_id,
schedules.label/repeat, agent_runs.park_id를 추가했어요.
20261113_0003은 최초 적용 전에 정규화 구조로 수정했어요.
적용 후 parks의 네 컬럼·목록 외래 키·새 테이블 7개 RLS를 확인했고,
`alembic check`에서 모델과 DB 차이가 없음을 확인했어요.
