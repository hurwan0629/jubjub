# 서울 공원 경계 스냅샷

`seoul_parks.json`은 OpenStreetMap의 서울 공원·자치구 경계를 정제한 데이터예요.
데이터 출처: © OpenStreetMap contributors.
데이터 라이선스: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
출처 안내: [OpenStreetMap copyright](https://www.openstreetmap.org/copyright).

원본 기준 시각은 JSON의 `osm_timestamp`, 제외 항목은 `skipped`에 있어요.
`entries`에는 원본 URL과 구역을 식별하는 원본 키, 실제 외곽·내부 구멍을 담아요.
DB의 bounds와 내부 대표점은 적재 시 검증한 다각형에서 계산해요.

범위·누락·이름/주소 미등록 현황과 갱신 명령은 [PARKS.md](../PARKS.md)를 참고해 주세요.
