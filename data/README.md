# data

이미지 등 대용량 데이터는 Git에서 제외합니다. TACO의 YOLO 라벨·클래스 이름과 COCO 어노테이션은 Git에 포함합니다.

## 데이터셋 목록
| 이름 | 설명 | 위치 (링크) |
|------|------|-------------|
| TACO 4개 bin | `general`, `plastic`, `can`, `glass`로 변환한 YOLO 데이터. 원본 60클래스 데이터는 `members/hur-wan/datasets/TACO/data/taco_yolo/`에 보관 | `taco_yolo/data.yaml` |
| AIHub 생활폐기물 4개 bin | AIHub "생활폐기물 데이터 활용ㆍ환류" 중 실내형분류기(B1~B10)를 같은 4클래스로 변환. 긴 변 640px로 리사이즈 | `aihub_living_yolo/data.yaml`, `aihub_living_coco/annotations/{train,val}.json` |

AIHub 생활폐기물은 원본 zip(`members/hur-wan/datasets/aihub_living_trash/inside_classifier/`)에서 저장소 루트 기준 `python members/hur-wan/datasets/aihub_living_trash/convert_to_yolo4.py`로 만듭니다. 29→4 클래스 변환 규칙은 [`convert_to_yolo4.py`](../members/hur-wan/datasets/aihub_living_trash/convert_to_yolo4.py)의 `CLASS_MAP`에 있습니다. 스티로폼과 건전지는 제외합니다. **비닐은 `general`입니다.** TACO는 비닐(Plastic film 등)을 `plastic`으로 보내므로 두 데이터셋을 섞어 학습할 때는 주의해야 합니다. 이미 만든 이미지는 건너뛰므로 중간에 끊겨도 다시 실행하면 됩니다(`--overwrite`로 전부 다시 만듦).

4클래스 학습에는 `data/taco_yolo/data.yaml`을 사용합니다. 60→4 클래스 변환 규칙은 [`remap_to_4class.py`](../members/hur-wan/datasets/TACO/remap_to_4class.py)의 `CLASS_MAP`에 있습니다. `general`은 탐지용 기타 쓰레기이며 실제 분리배출 지시가 아닙니다. 제외한 객체만 있던 이미지는 빈 라벨 파일과 함께 남깁니다.

현재 데이터 버전은 **TACO 4클래스 v2**입니다. 원본 라벨을 바꾼 뒤 저장소 루트에서 `python members/hur-wan/datasets/TACO/remap_to_4class.py`를 실행하면 YOLO 라벨과 COCO train/val JSON을 함께 다시 만듭니다. 이미지 파일은 다시 복사하지 않습니다. 기존 4클래스 모델은 이전 라벨로 학습했으므로 이후 실험은 `taco-v2`로 구분합니다. 기존 `taco_yolo11n.ipynb`와 학습 결과는 원본 60클래스 실험 기록입니다.

## 권장 폴더 구조 (로컬)
```
data/
├─ raw/         원본 이미지
├─ labeled/     라벨링 완료
└─ splits/      train / val / test
```
