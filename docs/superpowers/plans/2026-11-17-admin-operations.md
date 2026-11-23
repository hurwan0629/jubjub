# 공원 변경 승인·공원별 보고·로봇 배정

사용자 요청: 앱 공원 변경 신청을 총관리자가 승인하고 웹 공원별 보고·로봇 목록도 실제 API로 동작하게 한다. 최신 Figma 접근은 MCP 한도로 실패. 이전에 읽은 Page4의 377:1094/1274/1477(공원 변경), 290:730/1050(보고), 291:730 및 381:779/1063/1403(로봇 배정) 구조를 참고하며 최신 시각 일치를 주장하지 않는다.

## 동작
- 승인 전 기존 공원과 운영 설정 유지. 요청은 공원별 1건만 pending. 동일 공원·비활성 공원은 신청 거부.
- 총관리자가 승인 시 다른 승인 담당자 중복·로봇 작업 중 여부 재검사. 같은 parks 행의 catalog를 변경하며 로봇 배정은 유지하고 기존 경로 비활성화·지점 소프트 삭제·시간표/기준점/설정 완료 상태 초기화. 반려·취소는 기존 운영 보존.
- 로봇 목록 등록·조회·배정/회수. idle/offline 로봇만 재배정. 다른 공원으로 옮기면 이전 경로를 비활성화하고 이전 로봇 시간표 제거. 실제 측정값 없는 배터리 %는 생성하지 않는다.
- 공원별 보고 목록·날짜 선택·상세. 보고가 없으면 빈 상태. 일일보고 저장 테이블은 공원 catalog ID를 보존해 공원 변경 후 이전 장소의 보고가 새 공원으로 섞이지 않게 한다. 자동 생성 에이전트·쓰레기 탐지 집계는 이번 UI/API 작업과 별개.

## API 계약 (camelCase)
- GET /park-change-requests -> ParkChange[] (자기 계정 최근 이력)
- POST /park-change-requests {catalogId,reason} -> ParkChange
- POST /park-change-requests/{id}/cancel -> ParkChange
- GET /admin/park-change-requests?status=all&limit=100&offset=0 -> ParkChange[]
- POST /admin/park-change-requests/{id}/approve {} -> ParkChange
- POST /admin/park-change-requests/{id}/reject {reason} -> ParkChange
- ParkChange: id,parkId,userId,applicantName,applicantLoginId,currentCatalogId,currentParkName,requestedCatalogId,requestedParkName,requestedParkAddress,reason,status(pending/approved/rejected/cancelled),rejectReason(null|string),createdAt,reviewedAt(null|string),conflictingManagerName(null|string).
- GET /admin/parks?limit=100&offset=0 -> AdminPark[]
- AdminPark: id,catalogId,name,address,managerId,managerName,managerLoginId,status,robotCount.
- Existing GET /admin/robots gains nullable parkName,managerId,managerName,managerLoginId.
- PATCH /admin/robots/{id}/assignment {parkId:string|null} -> AdminRobot
- Existing POST /admin/robots {name,serialNo} -> AdminRobot.
- GET /admin/parks/{id}/reports?date=YYYY-MM-DD -> AdminReport[] (empty if unavailable)
- AdminReport: id,parkId,date,summary,pickups(null|number),stationVisits(null|number),patrolsDone(null|number),patrolsPlanned(null|number),materials:[{material,count}],hourly:[{hour,count}],insights:string[],events:[{time,title,detail}],createdAt.

## 작업 분담
- 서버·모델·마이그레이션·데이터 일관성: root
- 앱 공원 변경 화면·설정 연결·API: 앱 작업자
- 웹 메뉴·공원 변경 승인·보고·로봇 배정: 웹 작업자

## 검증 결과
- 서버 128 passed, 3 skipped(명시 실행용 PostgreSQL 테스트). 새 마이그레이션 PostgreSQL 롤백 검증 1 passed.
- 앱 check 통과(기존 경고 4개), 최신 테스트 18개. 웹 check/tests 7개 및 production build 통과.
- 리뷰의 공원 변경 전 열린 편집기 저장 문제는 catalogId 검증으로 차단. 변경 승인 이력이 있는 공원은 catalogId 없는 쓰기도 거부. /route 응답이 catalogId를 제공하고 앱이 원래 값을 보존하여 전송.
- 보고 조회에 선택 시점 catalogId를 보내 변경 시 409 park_changed로 차단하여 공원 이름과 보고 장소가 섞이지 않도록 함.
- 실제 DB에 20261117_0007 적용, alembic check에서 모델 차이 없음.
- 백업: server/storage/migration-backups/admin-operations-before-20261117T073647Z.json.
- 기존 parks 3, robots 2, points 9, routes 5, route_points 7, schedules 12, agent_runs 5, agent_steps 5행 및 기존 컬럼 값 보존.
- 실제 관리자·하위관리자 계정의 읽기 API 확인. 테스트를 위해 실제 공원 변경 신청·승인·로봇 재배정은 하지 않음.
- 남은 제한: 최신 Figma 시각 대조/실제 브라우저 클릭 검증은 미완료. 보고 자동 생성·탐지 집계는 별도 작업이며 보고 미등록 시 빈 상태를 표시.
