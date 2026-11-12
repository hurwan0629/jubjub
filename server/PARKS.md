# C-03 서울 공원 검색

로그인한 앱이 공원 이름·주소로 검색하고 실제 테두리를 받아요.
네이버 지도는 지도를 그리는 데 사용하고, 검색·경계는 서버의 Supabase 목록을 사용해요.
검색할 때마다 외부 API를 부르지 않으며, 네이버 검색 Client Secret도 필요하지 않아요.

## API

```http
GET /parks?query=여의도
Authorization: Bearer <accessToken>
```

응답은 앱의 `Park[]`와 같아요. 아래 좌표 배열은 구조 설명용으로 생략했어요.

```typescript
type Park = {
  id: string;
  name: string;
  address: string;
  distance: string;
  bounds: {
    southWest: { latitude: number; longitude: number };
    northEast: { latitude: number; longitude: number };
  };
  area: {
    outer: { latitude: number; longitude: number }[];
    holes: { latitude: number; longitude: number }[][];
  };
};
```

- 좌표는 WGS84 위도·경도예요. `outer`와 각 `holes`는 첫 점과 마지막 점이 같은 닫힌 링이에요.
- `bounds`는 실제 테두리를 감싸는 사각형이에요. 범위 밖 판정은 사각형뿐 아니라 `area`로 해야 해요.
- 이름·주소를 검색해요. 공백으로 구분한 검색어는 모두 일치해야 해요. `%`, `_`는 일반 글자로 처리해요.
- 검색 결과가 없으면 200과 `[]`를 반환해요.
- `limit`: 기본 20, 최대 100. 다음 페이지는 `offset`을 늘려서 받아요 (최대 10000).
- 위치 없는 검색은 이름·ID 순이며 `distance`는 빈 문자열이에요. 가짜 거리를 표시하지 않아요.
- 검색어와 위치가 모두 없으면 `[]`예요.
- 토큰 없거나 잘못되면 401, 잘못된 매개변수는 422, DB 조회 실패는 503이에요.

## 내 위치에서 찾기

```http
GET /parks?latitude=37.53&longitude=126.92&limit=20
Authorization: Bearer <accessToken>
```

위도와 경도는 반드시 함께 보내요. 검색어와 함께 보내도 돼요.
서울 목록 중 공원 대표점까지의 직선거리가 가까운 순으로 반환해요.
반경 필터·도보 길찾기 거리는 아니에요. 대표점은 실제 공원 내부의 점이에요.
1km 미만은 `516m`, 그 이상은 `1.3km`처럼 표시해요.

## 프론트 연결 시 할 일

1. 로그인 API 응답의 JWT를 기존 `setAuthToken`에 저장해요.
2. `GET /parks`만 실제 서버로 전환하고 `Park[]`를 그대로 사용해요.
3. 위치 권한을 얻은 뒤 `latitude`, `longitude`를 함께 보내요.
4. C-03의 고정 `한강` 검색을 위 위치 요청으로 바꿔요. 임의로 첫 결과를 선택하지 않고 목록을 보여줘요.
5. 결과 페이지가 20개를 넘으면 더 보기를 제공해요. `results.length`는 현재 페이지 개수예요.
6. 로딩·실패 상태를 검색 결과 없음과 구분해요. 401이면 다시 로그인을 안내해요.
7. 지도에 OSM 경계를 사용한다는 출처와 라이선스 링크를 표시해요.

현재 체크아웃된 `client.ts`에는 `SERVER_READY`가 없고 `USE_MOCK` 한 개로 전체 API가 바뀌어요.
팀원이 만든 최신 코드에 `SERVER_READY`가 있다면 `parks`를 추가하면 돼요.
이전 코드에서 서버 주소만 넣으면 미구현 API도 서버를 부르므로, 자원별 전환을 먼저 맞춰 주세요.
현재 로컬 로그인 UI는 아직 임시 흐름이므로 인증 연결도 필요해요.
이번 작업은 백엔드와 실제 데이터 적재이며 앱 화면은 수정하지 않았어요.

## 데이터 범위와 출처

- 서울 전역의 OpenStreetMap `leisure=park` way/relation을 수집했어요.
- 스냅샷 기준: 2026-11-12 16:28:19 KST (원본 `2026-11-12T07:28:19Z`).
- 원본 공원 요소 2,301개 → 유효한 검색 구역 2,322개. 분리 구역은 `공원명 · 1구역`처럼 반환해요.
- 내부 구멍이 있는 구역은 21개예요. 여의도한강공원의 내부 구멍도 유지해요.
- 경계 처리 경고가 난 훈련원공원 relation 11505098은 제외했어요. 사유는 JSON의 `skipped`에 있어요.
- 이름 미등록 구역 970개는 `이름 없는 공원`으로 표시해요. 상세 주소 미등록 2,162개는 임의 주소 대신 미등록으로 표시해요.
- 서울 25개 자치구 경계와 공간 매칭해서 상세 주소가 없어도 구 이름으로 검색할 수 있어요.
- OSM 미등록 공원과 `leisure=park`로 분류되지 않은 공간은 포함되지 않아요. 서울의 공식 전체 공원 목록을 보장하는 데이터가 아니에요.
- 전국도시공원정보 표준데이터에는 대표 위도·경도와 면적은 있지만 테두리 좌표 항목이 없어 단독으로 이 API의 경계를 만들 수 없어요.

검색용 `park_catalog_entries`는 설계서의 운영 공원 `parks`와 분리했어요.
선택한 `id`는 검색 목록 PK예요. 이후 경로 저장 시 이 ID를 참조해 운영 공원과 연결하면 돼요.
분리된 구역은 각각의 ID로 선택하며 원본 OSM 경계선 번호로 식별해요.
면적 순서가 바뀌어도 구역 ID가 다른 위치로 바뀌지 않아요.
OSM에서 원본 경계선 자체를 삭제·분할하면 새 항목이 될 수 있으므로 기존 항목은 삭제하지 않고 비활성화해요.

## 설치·갱신

`server/`에서 실행해요. 현재 연결된 Supabase에는 이미 적재되어 있어요.

```powershell
pip install -r requirements-dev.txt
alembic upgrade head
python -m app.scripts.import_parks
```

저장된 스냅샷은 `data/seoul_parks.json`이에요. 새 OSM 자료로 갱신하려면:

```powershell
python -m app.scripts.sync_seoul_parks
python -m app.scripts.import_parks --replace
```

`--replace`는 이번 스냅샷에서 사라진 항목을 비활성화해요. 기존 행과 PK는 지우지 않아요.
`--replace` 없이 실행하면 추가·갱신만 해요. 동일 원본 키로 재적재해도 PK가 유지돼요.
빈 스냅샷·부분 응답·유효하지 않은 경계는 기존 데이터를 덮어쓰지 않게 거부해요.
정제 단계에서 제외된 원본은 `skipped`에 기록해요.
공개 Overpass 서버는 운영 검색 요청에 직접 연결하지 않고, 수동 갱신할 때만 사용해요.

## 출처 표시

공원 데이터: © OpenStreetMap contributors, ODbL 1.0.
정제한 JSON 데이터도 ODbL 1.0으로 제공해요. 이 라이선스는 프로젝트 소스 코드와 구분돼요.

- [OpenStreetMap 저작권·출처 안내](https://www.openstreetmap.org/copyright)
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [전국도시공원정보표준데이터](https://www.data.go.kr/data/15012890/standard.do)
