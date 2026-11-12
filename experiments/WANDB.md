# W&B 기록 규격

객체 탐지는 W&B 프로젝트 `jubjub`에 기록한다. **학습 1회 = run 1개**다. `run.name`은 `{model_id}__{dataset_id}-{version}__{experiment_id}__s{seed}`로 쓴다. 예: `yolo11n__taco-v1__baseline__s0`. seed만 다른 반복 실험은 같은 `group` (`{model_id}__{dataset_id}-{version}__{experiment_id}`)에 넣는다.

## 시작할 때: `run.config`

| 키 | 값 |
|---|---|
| `model/id` | 모델 변형의 정확한 이름. 예: `yolo11n`, `dfine-n` |
| `model/architecture` | 아키텍처 설정 이름과 버전. 설정 파일 자체는 아래 모델 artifact에 포함 |
| `model/init_weights` | `{source, version, sha256}` 객체. 처음부터 학습하면 `none` |
| `data/id`, `data/version` | 데이터셋 이름과 고정된 버전. 예: `taco`, `v1` |
| `data/split_id`, `data/classes` | train/val/test 분할 식별자와 **순서가 있는** 클래스 이름 목록 |
| `data/manifest_sha256` | 이미지·라벨·분할 목록을 담은 manifest의 SHA-256 |
| `train/args`, `train/seed` | 실제 적용된 전체 학습 설정 객체와 난수 seed |
| `code/commit`, `env/versions` | 학습 코드 commit과 `{python, framework, torch, cuda}` 버전 객체 |
| `eval/protocol_id`, `eval/args` | 공통 평가 규칙 버전과 `{split, imgsz, conf, nms_iou, match_iou, max_det}` 설정 객체 |

## 매 epoch: `run.log()`

| 키 | 값 |
|---|---|
| `epoch` | 1부터 시작하는 epoch 번호. 같은 행의 모든 값에 적용 |
| `train/box_loss`, `train/cls_loss`, `train/dfl_loss` | 해당 epoch의 학습 loss 3종 |
| `val/box_loss`, `val/cls_loss`, `val/dfl_loss` | 해당 epoch의 검증 loss 3종 |
| `val/precision`, `val/recall` | 해당 epoch의 검증 Precision·Recall (0~1) |
| `val/map50`, `val/map50_95` | 해당 epoch의 검증 mAP@50·mAP@50–95 (0~1) |
| `train/lr_pg{index}` | optimizer parameter group별 학습률. index는 0부터 시작 (`train/lr_pg0`, `train/lr_pg1` 등) |

모델에 없는 loss는 **키를 기록하지 않는다**. 0으로 채우지 않는다. Ultralytics의 `metrics/precision(B)`, `metrics/recall(B)`, `metrics/mAP50(B)`, `metrics/mAP50-95(B)`는 순서대로 위 `val/precision`, `val/recall`, `val/map50`, `val/map50_95`에 대응한다. 원본 키도 유지한다. 다른 아키텍처의 loss 값끼리는 순위를 매기지 않는다.

## 학습 종료·공통 평가: `run.summary`, 이미지·표, artifact

| 키 또는 artifact 이름 | 값 |
|---|---|
| `model/best_epoch`, `model/selection_metric` | 최고 가중치를 고른 epoch와 실제 선택 기준. 예: `fitness`(map50_95 같은거) |
| `eval/precision`, `eval/recall`, `eval/map50`, `eval/map50_95` | **같은 평가 세트·규칙**으로 최고 가중치를 다시 평가한 점수 (0~1) |
| `eval/per_class_ap` | 클래스별 AP@50–95와 정답 개수를 담은 W&B Table |
| `eval/confusion_matrix_counts` | 정답·예측 클래스별 건수를 담은 W&B Table. 배경 행·열 포함 |
| `eval/confusion_matrix_image`, `eval/confusion_matrix_normalized_image` | 같은 건수의 원본·정규화 혼동행렬 이미지 |
| `model-{run_id}` artifact | `best` 가중치와 아키텍처 설정 파일. 재개용 `last` 가중치는 로컬 보관 |
| `data-{dataset_id}-{version}` artifact | 평가에 쓴 데이터 manifest와 클래스 매핑 |

## 장치별 추론 측정: `run.summary`

`{device}`는 `pc` 또는 `jetson`이다. 두 장치는 별도 측정한다.

| 키 | 값 |
|---|---|
| `bench/{device}/setup` | `{cpu, gpu, backend, precision, imgsz, batch, warmup, samples}` 객체. `batch=1` |
| `bench/{device}/preprocess_ms`, `bench/{device}/inference_ms` | 같은 이미지 세트에서 측정한 전처리·추론 중앙값 (ms/장) |
| `bench/{device}/postprocess_ms`, `bench/{device}/total_ms` | 같은 이미지 세트에서 측정한 후처리·전체 중앙값 (ms/장) |
| `bench/{device}/total_p95_ms` | 전체 처리 시간의 95백분위 (ms/장) |
| `bench/{device}/cpu_avg_pct`, `bench/{device}/gpu_avg_pct` | 측정 구간의 평균 CPU·GPU 사용률 (%) |
| `bench/{device}/cpu_peak_rss_mb`, `bench/{device}/gpu_peak_vram_mb` | 추론 프로세스의 최대 RAM·VRAM (MB) |
| `bench/{device}/cpu_rss_delta_mb`, `bench/{device}/gpu_vram_delta_mb` | 측정 전 대비 최대 RAM·VRAM 증가량 (MB) |
| `model/flops_imgsz`, `model/gflops`, `model/parameters`, `model/weights_mb` | FLOPs 계산 입력 크기, GFLOPs, 파라미터 수, 가중치 파일 크기. GFLOPs는 추정 연산량이며 사용률이 아님 |

모델 순위는 같은 데이터·클래스 매핑·평가 설정에서 얻은 `eval/map50_95`로 비교한다. 속도와 메모리는 다른 작업을 멈춘 뒤 같은 장치·실행 형식·입력·batch에서 비교한다.
