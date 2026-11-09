# data

데이터셋은 용량이 커서 **git에 올리지 않습니다.** 이 폴더에 받아두면 `.gitignore`가 자동으로 제외합니다.

## 데이터셋 목록
| 이름 | 설명 | 위치 (링크) |
|------|------|-------------|
| TACO 4개 bin | `general`, `plastic`, `can`, `glass`로 변환한 YOLO 데이터. 원본 60클래스 데이터는 `members/hur-wan/datasets/TACO/data/taco_yolo/`에 보관 | `taco_yolo/data.yaml` |

4클래스 학습에는 `data/taco_yolo/data.yaml`을 사용합니다. 기존 `schema.yaml`의 L2에 대응하지 않는 객체 라벨은 제외했고, 해당 라벨만 있던 이미지는 빈 라벨 파일과 함께 남겼습니다. 기존 `taco_yolo11n.ipynb`와 학습 결과는 원본 60클래스 실험 기록입니다.

## 권장 폴더 구조 (로컬)
```
data/
├─ raw/         원본 이미지
├─ labeled/     라벨링 완료
└─ splits/      train / val / test
```
