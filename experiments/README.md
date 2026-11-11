# 실험 목록

## 실험 기록

> [W&B 실험 사이트 확인](https://forge.coreweave.com/wandb/hurwan0629-something/jupjup?nw=nwuserhurwan0629)

1. [YOLO11n TACO 초기 기준 실험](01_yolo_11n_baseline-s0/) | YOLO11n으로 TACO 학습 |
2. [D-FINE-N TACO 임시 테스트](dfine-n__taco-v1__smoke__s0/), [smoke-b8-w2](dfine-n__taco-v1__smoke-b8-w2__s0/): 간단하게 설정을 바꿔가며 2번 테스트 했는데 yolo11n과 큰 차이가 없어 우선 yolo11n으로 고정하여 작업해보기로함.
3. [YOLO11n AIHub 학습](yolo_11n__aihub_living-v1__trash_feature_training__s0/): 공식 YOLO11n 가중치 → AIHub 생활폐기물 데이터 학습
4. [YOLO11n TACO 추가 학습](yolo_11n__taco-v2__trash_feature_training__s1/): 3번의 `run/weights/best.pt` → TACO 학습 및 검증
5. [YOLO11n TACO 단일 학습](yolo_11n__taco-v2_only__compare__s0/): 3-4 번과 비교를 위한 taco 데이터셋만을 이용한 실험

위 번호는 실험 진행 순서이며 성능 순위가 아닙니다. 3번과 4번은 하나의 가중치 계보로 이어집니다.

> 실험별 학습 코드와 결과 위치를 기록합니다. 기록 항목의 이름은 [W&B 기록 규격](WANDB.md)을 따릅니다.

## 폴더 구조

실험 폴더만 표시했습니다. 각 폴더에 학습용 `train.py`와 그리드 이미지 생성용 `visualize.py`가 있습니다.

```text
experiments/
├─ 01_yolo_11n_baseline-s0/
├─ dfine-n__taco-v1__smoke__s0/
├─ dfine-n__taco-v1__smoke-b8-w2__s0/
├─ yolo_11n__aihub_living-v1__trash_feature_training__s0/
├─ yolo_11n__taco-v2__trash_feature_training__s1/
├─ yolo_11n__aihub_living-v1_to_taco-v2__compare__s0/
└─ yolo_11n__taco-v2_only__compare__s0/
```

## 사용법

명령은 해당 실험 폴더에서 실행합니다. `train.py`는 학습을 실행하고, `visualize.py`는 시드로 고른 이미지의 정답과 예측을 PNG 그리드 한 장으로 저장합니다.

### 학습

- 일반 YOLO 실험: `python train.py`
- AIHub → TACO 비교 실험: `python train.py --stage aihub` 다음 `python train.py --stage taco`
- D-FINE 실험: `python train.py` (원래 실험 설정으로 새 `run/`에 저장)
- 초기 YOLO 기준 실험: `python train.py --dataset 원본/data.yaml` (원본 60클래스 데이터셋 필요)

### 시각화

- YOLO 비교 실험: `python visualize.py --model taco --dataset taco --split test --seed 1 --count 8`
- D-FINE 실험: `python visualize.py --dataset taco --split val --seed 1`

YOLO의 `--dataset`에는 `aihub`, `taco`, 또는 `data.yaml` 경로를 넣습니다. D-FINE에서 다른 COCO 데이터셋을 쓰려면 `--dataset annotations.json --images 이미지폴더`를 지정합니다. 같은 이름의 출력 파일은 덮어쓰지 않습니다.
