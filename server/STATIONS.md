# 분리수거장과 로봇 기본 장소

공원별 `recycling_stations`에 최대 100곳을 등록해요. 경로는 `default_station_id`로 등록 장소를 참조해요. `points`는 순찰 지점만 저장하며 `type` 컬럼과 분리수거장 스냅샷은 사용하지 않아요. `station_selections`는 경로를 만들기 전의 로봇별 선택과 미배정 초안을 저장해요.

모든 API는 승인된 담당 관리자 인증이 필요하며 본인 공원과 배정 로봇에만 접근할 수 있습니다.

| Method | 경로 | 용도 |
|---|---|---|
| GET | `/stations` | 공원 분리수거장 목록 |
| POST | `/stations` | 이름·좌표 등록 |
| PATCH | `/stations/{station_id}` | 이름·좌표 수정 |
| DELETE | `/stations/{station_id}` | 미사용 장소 삭제 |
| PUT | `/robots/{robot_id}/default-station` | 로봇 기본 장소 선택 |

등록·수정 본문은 `{ "name": "북문 분리수거장", "position": { "latitude": 37.5, "longitude": 127 }, "catalogId": "1" }`입니다. 선택 본문은 `{ "stationId": "1", "catalogId": "1" }`입니다. 삭제 시 `catalogId`는 쿼리입니다. 공원 경계 밖 좌표, 중복 좌표, 다른 공원 장소를 거절합니다.

`PUT /route`와 `PUT /routes`의 `defaultStationId`로 장소를 선택할 수 있어요. 설정 응답에는 `defaultStationId`와 `stations` 목록이 포함돼요. 기본 장소만 먼저 선택해도 돼요. 장소 좌표 수정 시 이를 참조하는 활성 경로를 전부 검증한 후 함께 새 버전으로 저장해요. 이전 경로의 순찰 지점·순서와 분리수거장 참조는 유지해요. 분리수거장 좌표는 장소의 최신 값을 사용해요. 활성 경로나 기본 선택이 참조하는 장소는 `409 station_in_use`로 삭제를 막아요.

기존 좌표 기반 `/station`과 `/route`도 지원합니다. 등록 장소가 여러 개이면 좌표만으로 대상을 정하지 않고 `409 default_station_required`를 반환합니다. `defaultStationId`를 지정해야 합니다. 장소 좌표와 ID를 함께 보내면 좌표가 일치해야 합니다.

마이그레이션 `20261118_0012`는 기존 장소와 과거 경로를 연결하고 활성 경로의 기본 선택을 이관합니다. 여러 장소·스냅샷이 생겨 단일 장소 구조로 표현할 수 없으면 downgrade를 거절합니다.

`20261119_0013`은 기존 `default_station_id`를 보존하고 누락된 참조를 공원·좌표 기준으로 채워요. 기존 분리수거장 points를 정리한 뒤 `points.type`과 `routes.station_id`를 제거해요. `routes.default_station_id`는 필수가 돼요. 예상하지 못한 charger/bin 지점이나 비순찰 route_points가 있으면 이전을 중단해요.
