# compose

`python scripts/build_compose.py` 가 만든 폴더입니다. **이미지는 복사하지 않습니다.** 원래 `data/<이름>_yolo/` 의 이미지를 경로 목록으로 가리킵니다.

규칙: 각 데이터셋의 원래 train / val / test 를 그대로 합칩니다. AIHub 는 기본에서 빼고 `train_aihub.txt` 에 따로 둡니다.

## 기본 (AIHub 제외)

| 데이터셋 | train.txt | val.txt | test.txt |
| --- | ---: | ---: | ---: |
| taco | 1,200 | 150 | 150 |
| drinking_waste | 3,848 | 482 | 481 |
| plastopol | 988 | 399 | 500 |
| click | 875 | 109 | 110 |
| tod | 2,180 | 208 | 335 |
| howa | 5,642 | 784 | 495 |
| **합계** | **14,733** | **2,132** | **2,071** |

## AIHub

`train_aihub.txt`: 115,055장 (원래 train 102,271 + val 12,784). 평가(val, test)에는 넣지 않습니다.

## 사용법

```bash
# 기본 학습
yolo detect train model=yolo11n.pt data=compose/data.yaml imgsz=640

# AIHub 로 먼저 학습 → 그 가중치로 기본 데이터 학습
yolo detect train model=yolo11n.pt data=compose/data_aihub.yaml imgsz=640
yolo detect train model=runs/detect/<위 결과>/weights/best.pt data=compose/data.yaml imgsz=640
```

두 yaml 은 `train` 줄만 다르고 val, test 는 같습니다. 그래서 결과를 그대로 비교할 수 있습니다.

목록 경로 기준: `C:/LANG_CHAIN_2026/final-project/parkkeeper-jupjup/data`. 다른 컴퓨터에서 학습하려면 거기서 `--root` 를 주고 다시 실행하세요.
