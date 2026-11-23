# 현재 DB 명세 반영 (2026-11-19)

기준은 [Confluence 현재 DB](https://kdt-3team-finalterm.atlassian.net/wiki/pages/7471105) 23판이에요. 마이그레이션은 `20261118_0012` → `20261119_0013`이에요.

2026-11-19에 연결된 Supabase DB에 적용했어요. 순찰 지점 16개, 경로 9개, 공원 5개, 로봇 22개를 보존했으며 분리수거장 points 5개를 정리했어요. 적용 전 데이터 백업은 저장소에서 제외되는 `data/db-backups/20261119-before-0013.json`에 있어요.

- `robots.status`: `working`, `emptying`, `idle`, `error`, `offline`만 허용해요. 기존 `charging`은 `idle`로 바꿔요.
- `points`에는 순찰 지점만 저장해요. 분리수거장은 `recycling_stations`로 정리하고 `type`을 제거해요.
- 경로는 `default_station_id`만 사용해요. 이전 경로와 순찰 지점·순서는 보존하지만 분리수거장 좌표는 해당 장소의 최신 값이에요.
- 공원 처리 컬럼은 `reviewed_by`, `reviewed_at`이에요. 승인·반려·승인 취소 모두 처리자와 시각을 기록하고, 재신청하면 비워요.

## API 계약

`GET /park`와 총관리자 신청 목록·승인·반려·승인 취소 응답의 `approvedBy`, `approvedAt`이 `reviewedBy`, `reviewedAt`으로 바뀌어요. 과거 반려 중 처리 정보가 없는 건은 null을 보존해요. 새 반려부터 실제 처리 정보를 저장해요.

경로 API의 `defaultStationId`는 `recycling_stations.id`예요. 기존 좌표 기반 `/station`과 `/route`는 장소가 하나일 때 계속 사용할 수 있어요. 장소가 여러 곳이면 `defaultStationId`를 지정해요.

## 적용과 복구

서버 코드를 함께 반영하고 `server/`에서 실행해요.

```powershell
.\.venv\Scripts\alembic.exe upgrade head
```

이전 과정은 트랜잭션으로 실행해요. 기존 분리수거장 참조가 있으면 유지하고, 없는 경로만 공원·좌표로 연결해요. charger/bin 지점이나 비순찰 지점을 참조한 route_points가 있으면 임의 삭제하지 않고 중단해요.

되돌리기는 경로별 분리수거장 points를 다시 만들어요. 과거 삭제한 스냅샷의 ID와 당시 좌표까지 복원하지는 못해요. 새 반려 처리 기록이 있으면 이전 스키마로 표현할 수 없어 downgrade를 거절해요. 운영 복구에는 적용 전 백업을 사용해요.

문서의 에이전트 테이블은 추가 예정이라 이번 변경에 포함하지 않아요.
