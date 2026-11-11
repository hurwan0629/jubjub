# data

이미지 등 대용량 데이터는 Git에서 제외합니다. TACO의 YOLO 라벨·클래스 이름과 COCO 어노테이션은 Git에 포함합니다.

## 데이터셋 목록
| 이름 | 설명 | 위치 (링크) |
|------|------|-------------|
| TACO 4개 bin (v3) | TACO 원본 1,500장을 `general`, `plastic`, `can`, `glass`로 변환. train/val/test = 1200/150/150. 통계는 `taco_yolo/stats.ipynb` | `taco_yolo/data.yaml`, `taco_coco/annotations/{train,val,test}.json` |
| AIHub 생활폐기물 4개 bin | AIHub "생활폐기물 데이터 활용ㆍ환류" 중 실내형분류기(B1~B10)를 같은 4클래스로 변환. 긴 변 640px로 리사이즈 | `aihub_living_yolo/data.yaml`, `aihub_living_coco/annotations/{train,val}.json` |

AIHub 생활폐기물은 원본 zip(`members/hur-wan/datasets/aihub_living_trash/inside_classifier/`)에서 저장소 루트 기준 `python members/hur-wan/datasets/aihub_living_trash/convert_to_yolo4.py`로 만듭니다. 29→4 클래스 변환 규칙은 [`convert_to_yolo4.py`](../members/hur-wan/datasets/aihub_living_trash/convert_to_yolo4.py)의 `CLASS_MAP`에 있습니다. 스티로폼과 건전지는 제외합니다. **비닐은 `general`입니다.** TACO v3도 같은 기준(비닐 `general`, 스티로폼 제외)을 따릅니다. 이미 만든 이미지는 건너뛰므로 중간에 끊겨도 다시 실행하면 됩니다(`--overwrite`로 전부 다시 만듦).

TACO 4클래스 학습에는 `data/taco_yolo/data.yaml`을 사용합니다. 60→4 클래스 변환 규칙은 [`remap_to_4class.py`](../members/hur-wan/datasets/TACO/remap_to_4class.py)의 `CLASS_MAP`에 있습니다. `general`은 탐지용 기타 쓰레기이며 실제 분리배출 지시가 아닙니다. 제외한 객체(스티로폼, 깨진 유리, Unlabeled litter 등)는 박스만 빼고 이미지는 남기며, 제외 객체만 있던 이미지는 빈 라벨 파일을 가집니다.

현재 데이터 버전은 **TACO 4클래스 v3**입니다. 만드는 방법:
1. `members/hur-wan/datasets/TACO/`에서 `python download.py`로 원본 이미지를 `data/batch_*/`에 받습니다.
2. 같은 폴더에서 `python build_4class.py`를 실행합니다. `data/annotations.json`에서 이미지를 seed 0으로 80/10/10 분할하고, YOLO 라벨과 COCO JSON을 함께 만듭니다. EXIF 회전이 있는 사진은 회전을 적용해 저장합니다. 결과 폴더가 이미 있으면 멈추므로 옮기거나 지운 뒤 실행합니다.

| 버전 | 변경 |
|------|------|
| v1 | 60클래스 → 4클래스 첫 변환 (train/val) |
| v2 | 라벨러로 일부 수정, 금속 병뚜껑·뚜껑 `can` (train/val). 백업: `members/hur-wan/datasets/TACO/backup_v2/` |
| v3 | 원본부터 다시 생성. 비닐류 `general`, 스티로폼 제외, train/val/test 분할 |

이전 버전 라벨로 학습한 모델(aihub 40epoch + taco 30epoch 등)은 v3와 비교하지 않습니다. 기존 `taco_yolo11n.ipynb`와 학습 결과는 원본 60클래스 실험 기록입니다.

## 권장 폴더 구조 (로컬)
```
data/
├─ raw/         원본 이미지
├─ labeled/     라벨링 완료
└─ splits/      train / val / test
```
