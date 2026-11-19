# 공원 지정과 순찰 설정 (KAN-93)

> Multi-station API update (2026-11-18): see [STATIONS.md](STATIONS.md). The coordinate-only examples below remain compatible for a single registered station. For multiple stations, use defaultStationId.

순찰 설정 API는 `Authorization: Bearer <accessToken>`이 필요해요. 가입 중 공원 카탈로그 검색(GET /parks)은 공개예요.
앱은 Supabase에 직접 접근하지 않아요. 요청에 userId/parkId를 보내도 권한으로 사용하지 않고
로그인한 관리자의 공원에만 접근해요.

## 프론트 연결 순서

1. 회원가입 중 공개 `GET /parks`로 검색하고 담당 공원을 골라요.
2. `POST /auth/register`에 계정 정보와 `catalogId`를 함께 보내 회원가입 승인을 신청해요.
3. 총관리자가 가입을 승인한 뒤 로그인하고, `GET /park`로 지정 공원을 불러와 분리수거장·순찰 지점·시간표를 정해요.
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
현재 로컬 C-03의 완료 버튼은 PUT /route에 연결되어 있으며 서버 저장 성공 후에만 완료 화면으로 이동해요.

## 로봇별 설정 (2026-11-17)

`GET /robots`로 내 공원에 배정된 로봇을 조회해요. `/route`, `/routes`, `/schedules`,
`POST /route/complete`는 `?robotId=123`으로 대상을 선택해요. 다른 공원·미배정 로봇은 404예요.
로봇 1대일 때 robotId 생략은 그 로봇을 선택하고, 여러 대일 때 생략은 422 `robot_required`예요.
로봇이 없으면 기존 초기 설정을 유지하기 위해 robotId=NULL인 공원 초안을 저장해요.
초안은 승인 시 배정된 로봇마다 지점까지 독립적으로 복사하고 원래 초안 경로는 비활성화해요.
`GET/PUT /route`, `GET/PUT /routes` 응답은 대상 `robotId`도 포함해요.

경로 수정 시 해당 로봇의 이전 활성 경로에 속한 순찰 지점만 소프트 삭제해요.
시간표 전체 교체도 해당 로봇에만 적용해요. 같은 순찰 시각을 서로 다른 로봇에 지정할 수 있어요.
분리수거장은 공원 공용이에요. `/station` 또는 전체 설정 저장에서 위치를 바꾸면
모든 활성 경로를 검증한 후 함께 새 버전을 만들어요. 하나라도 실패하면 전체 변경을 취소해요.
이전 경로는 이전 station_id를 유지하므로 실행 중 순찰의 출발·복귀 위치가 바뀌지 않아요.

`parks.route_setup_done`은 공원 초기 진입 여부예요. 로봇 하나 이상의 경로·시간표가 완성되면
true이며, 다른 로봇의 시간표를 지워도 완성된 로봇이 남아 있으면 유지해요.

DB 마이그레이션 `20261117_0005`: 배정된 로봇마다 기존 공용 설정을 복사하고,
로봇 없는 공원의 기존 설정은 초안으로 보존해요. 여러 로봇의 설정이 있는 경우 자동 downgrade는
데이터 손실을 막기 위해 거부하므로 먼저 내보내고 단일 설정으로 정리해야 해요.

## API 목록

| API | 요청/응답 |
| --- | --- |
| GET /park | 운영 공원. 미선택 시 404 |
| PUT /park | `{catalogId}` → 공원 정보와 status/reviewedBy/reviewedAt/rejectReason/routeSetupDone |
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

- 관리자당 공원 1개, 공원당 현재 분리수거장 1개, 공원·로봇당 활성 경로 1개를 DB 제약으로 보장해요.
- 경로는 순찰 지점 1~100개, 지점 이름은 공백 제거 후 1~100자예요. 같은 좌표는 중복 불가예요.
- 분리수거장과 순찰 지점은 연결된 검색 목록의 현재 공원 다각형 안이어야 해요. 내부 구멍은 제외해요.
- 순찰 지점은 분리수거장과 연결된 기존 지점에서 1km 이내여야 해요.
- 분리수거장이 없으면 409 `station_required`, 경계 밖은 422 `point_outside_park`,
  거리 초과는 422 `point_too_far`와 `details.distanceMeters/maxDistanceMeters`를 반환해요.
- 시간은 한국 시간 기준 HH:mm, repeat는 daily/weekdays/weekends예요.
  같은 시각에 반복 요일이 겹치면 422 `duplicate_schedule`이에요. 최대 100개예요.
- 전체 설정 완료에는 시간표 최소 1개가 필요해요. 모두 꺼진 상태도 허용해요.
  시간표를 비웠을 때 완성된 다른 로봇 설정이 없으면 초기 설정 완료 상태를 해제해요.
- 경로 변경은 새 routes/points/route_points로 저장하고 이전 지점은 논리 삭제해요.
  각 routes.station_id가 출발·종료 위치를 고정해 분리수거장을 옮겨도 이전 버전이 유지돼요.
- `route_points`에는 순찰 지점만 저장해요. `GET /routes`의 start/end가 분리수거장이에요.
- 분리수거장 위치를 옮기면 공원의 모든 활성 경로를 새 버전으로 만들고 거리 조건을 재검증해요.
- 경로 변경은 경로와 지점 이력으로 보존하며 에이전트 실행 로그를 생성하지 않아요.
  이 테이블은 이번에 필요한 로그 필드만 도입했어요. 인식·작업 FK는 해당 기능 구현 시 추가해요.

## 로봇 연동 시 지킬 계약

활성 경로는 **다음 순찰이 읽을 설정**이에요. 실행 중인 순찰은 시작 때 route ID를 고정해서
기존 버전을 끝까지 사용해야 해요. `applied_at`은 실행기가 실제 적용할 때 기록하며 API는 NULL로 둬요.
지점의 SLAM 좌표는 NULL이에요. 실제 이동 가능한 경로 계산·장애물 판정·시간표 자동 실행은
이번 저장 API에 포함하지 않아요. 이 API의 좌표 목록을 실제 주행 경로로 표시하면 안 돼요.

## DB 적용

`20261117_0006`은 Confluence 현재 DB 문서의 기존 테이블 컬럼 변경을 반영해요.
`parks.anchor_points`는 JSONB 기준점 목록(기본 `[]`)이고, 각 항목은
`{name, lat, lng, slam_x, slam_y}` 형태예요. 로봇의 `slam_x/slam_y/lat/lng`는 float8,
`battery_voltage`는 float4, `last_seen_at`은 timestamptz이며 모두 미수신 시 NULL이에요.
상태는 `working`(순찰 중)을 유지하고 `emptying`(비우는 중)을 추가했어요.
기존 공원·로봇 조회 응답에도 새 필드를 포함해요. 이 변경은 저장 컬럼을 준비하며,
좌표 변환·배터리 % 산정·신호 수신 처리와 추가 예정 테이블 생성은 포함하지 않아요.

2026-11-17 현재 연결된 DB에 `20261117_0005`를 적용했고 기존 경로·시간표를 보존했어요.
변경 전 백업은 Git에서 제외되는 `server/storage/migration-backups/`에 저장했어요.

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
schedules.label/repeat를 추가했어요. 에이전트 실행 로그 테이블은 `20261118_0008`에서 제거했어요.
20261113_0003은 최초 적용 전에 정규화 구조로 수정했어요.
적용 후 parks의 네 컬럼·목록 외래 키·새 테이블 7개 RLS를 확인했고,
`alembic check`에서 모델과 DB 차이가 없음을 확인했어요.
