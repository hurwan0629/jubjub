# 삭제한 데이터 기록

- 삭제일: 2026-11-14
- 삭제 이유: 듀얼부팅용 SSD 공간 확보. 변환본이 프로젝트 루트 `data/aihub_living_yolo/`에 남아 있음
- 삭제한 경로: `inside_classifier/307.생활폐기물 데이터 활용ㆍ환류/` 전체 (약 18.0GB, 압축 해제 안 된 zip 40개)

## 삭제한 파일

| 폴더 | 파일 수 | 크기 | 파일 |
|---|---|---|---|
| `01-1.정식개방데이터/Training/01.원천데이터` | 10 | 15.88GB | `TS_실내형분류기_B1.zip` ~ `TS_실내형분류기_B10.zip` |
| `01-1.정식개방데이터/Training/02.라벨링데이터` | 10 | 0.07GB | `TL_실내형분류기_B1.zip` ~ `TL_실내형분류기_B10.zip` |
| `01-1.정식개방데이터/Validation/01.원천데이터` | 10 | 1.99GB | `VS_실내형분류기_B1.zip` ~ `VS_실내형분류기_B10.zip` |
| `01-1.정식개방데이터/Validation/02.라벨링데이터` | 10 | 0.01GB | `VL_실내형분류기_B1.zip` ~ `VL_실내형분류기_B10.zip` |

## 남아 있는 것

- 이 폴더의 `README.md`, `convert_to_yolo4.py`, `class_dist.png`, `sample_data/`
- 변환된 학습용 데이터: `parkkeeper-jupjup/data/aihub_living_yolo/`, `data/aihub_living_coco/`

## 다시 받는 방법

AIHub(https://www.aihub.or.kr)에서 **"생활폐기물 데이터 활용ㆍ환류"**(데이터 번호 307) →
`01-1.정식개방데이터` → 실내형 분류기 B1~B10 (Training/Validation, 원천·라벨링)을 받은 뒤
위 표와 같은 폴더 구조로 두고 `convert_to_yolo4.py`를 실행하세요.
