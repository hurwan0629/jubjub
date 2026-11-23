# 현재 DB 문서의 컬럼 반영

사용자 요청: Confluence 현재 DB(7471105, v17)의 현재 테이블 컬럼 변경만 반영. 추가 예정 테이블 생성은 제외.

- [x] parks.anchor_points: JSONB, 기존 공원은 빈 목록. 기준점 이름·위경도·SLAM x/y 목록.
- [x] robots.slam_x/slam_y/lat/lng: float8 nullable, battery_voltage: float4 nullable, last_seen_at: timestamptz nullable.
- [x] 로봇 상태는 기존 idle/working/charging/offline/error를 보존하고 emptying(비우는 중) 추가.
- [x] ORM, 기존 조회 응답, 클라이언트 로봇 타입을 DB와 동기화.
- [x] 스키마 회귀 및 기존 API 전체 테스트, 실제 DB 백업 후 마이그레이션 적용, 모델 차이 확인.

좌표 변환 계산, 배터리 % 산정, 로봇 신호 수신 API는 컬럼 추가와 별개이며 문서에 계산식/통신 규약이 없으므로 이번에는 구현하지 않는다. 기존 데이터에 위치·전압을 임의로 채우지 않는다.

## 결과
- 실제 DB에 20261117_0006 적용. 변경 전 백업은 server/storage/migration-backups/document-columns-before-20261117T055826Z.json.
- 기존 parks 3, robots 0, points 5, routes 2, route_points 3, schedules 8행 및 기존 컬럼 값 보존 확인.
- PostgreSQL 자료형 확인 및 alembic check에서 차이 없음.
- 서버 114 passed, 2 skipped. PostgreSQL 명시 실행 포함 컬럼 테스트 4 passed.
- 앱 타입 검사·12 tests, 관리자 웹 check·6 tests 통과.
- 리뷰에서 공원 변경 시 기준점 잔존 문제를 발견해 실패 재현 테스트 후 수정.
- 실제 DB 승인 관리자 2명의 /park, /robots 읽기 확인.
