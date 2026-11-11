# 실험 목록

## 실험 진행 순서

| 순서 | 실험 | 학습 흐름 |
| --- | --- | --- |
| 1 | [YOLO11n TACO 초기 기준 실험](01_yolo_11n_baseline-s0/) | YOLO11n으로 TACO 학습 |
| 2 | D-FINE-N TACO 실험: [smoke](dfine-n__taco-v1__smoke__s0/), [smoke-b8-w2](dfine-n__taco-v1__smoke-b8-w2__s0/) | D-FINE-N의 두 실험을 같은 단계로 묶음. 두 실행 사이의 순서는 미기록 |
| 3 | [YOLO11n AIHub 학습](yolo_11n__aihub_living-v1__trash_feature_training__s0/) | 공식 YOLO11n 가중치 → AIHub 생활폐기물 데이터 학습 |
| 4 | [YOLO11n TACO 추가 학습](yolo_11n__taco-v2__trash_feature_training__s1/) | 3번의 `run/weights/best.pt` → TACO 학습 및 검증 |

위 번호는 실험 진행 순서이며 성능 순위가 아닙니다. 3번과 4번은 하나의 가중치 계보로 이어집니다.

## JetHexa 하드웨어 참고 사양 (실제 장비 미확인)

아래는 일반 판매 JetHexa의 Jetson Nano B01 구성에 대한 **제조사 공개 사양**입니다. 현재 사용할 장비에서 직접 확인한 값이나 추론 성능 측정값은 아닙니다. 출처: [Hiwonder JetHexa 제품 페이지](https://www.hiwonder.com/products/jethexa), [NVIDIA Jetson Nano 기술 사양](https://www.nvidia.com/en-sg/autonomous-machines/embedded-systems/jetson-nano/product-development/), [NVIDIA 발표 자료 (FP16 연산 성능)](https://developer.download.nvidia.com/video/gputechconf/gtc/2019/presentation/s9901-the-nvidia-jetson-platform-for-autonomous-machines.pdf).

| 항목 | 공개 사양 |
| --- | --- |
| 컴퓨팅 보드 | NVIDIA Jetson Nano B01 |
| CPU | 쿼드 코어 ARM Cortex-A57, 최대 1.43 GHz |
| GPU | 128코어 NVIDIA Maxwell, 최대 921 MHz |
| GPU 이론 연산 성능 | FP16 최대 472 GFLOPS (실제 모델 처리량 아님) |
| 메모리 | 4 GB LPDDR4 |
| 메모리 대역폭 | 최대 25.6 GB/s |
| 저장장치 | 32 GB TF 카드 (제품 구성 기준) |
| 기본 소프트웨어 | Ubuntu 18.04 LTS + ROS Melodic (제품 페이지 기준) |
| 컴퓨팅 모듈 전력 | 5~10 W (로봇 전체 소비전력 아님) |

ML 모델의 **GFLOPs**는 이미지 1장을 처리할 때 필요한 연산량이고, 위 **GFLOPS**는 GPU의 초당 FP16 이론 최대 연산 성능입니다. CPU의 ML 연산 성능을 합산한 수치는 제조사가 제공하지 않으며, 두 수치를 나눠 실제 FPS를 구할 수도 없습니다. JetHexa에서는 4 GB 메모리 안에서 OS·ROS·카메라·모델이 함께 동작하므로 모델 실행 가능 여부와 속도는 직접 확인해야 합니다. 사전 학습된 모델의 **추론을 우선 검토**하고, 학습이 필요하면 시간·메모리 제약을 별도로 확인합니다.

**실제 장비 확인 후 수정할 항목:** 보드·모듈 모델과 RAM 용량, 저장장치 용량, Ubuntu·JetPack·CUDA·TensorRT 버전, 전력 모드와 클럭, 카메라 구성. 모델별로 같은 입력 크기·정밀도·실행 방식에서 전처리/추론/후처리 시간, FPS, 최대 RAM 사용량, CPU·GPU 사용률을 측정해 기록합니다. Jetson에서는 [`tegrastats`](https://docs.nvidia.com/jetson/archives/l4t-archived/l4t-3276/Tegra%20Linux%20Driver%20Package%20Development%20Guide/AppendixTegraStats.html)로 CPU·RAM·GPU 활동을 관찰할 수 있지만, GPU 사용률 자체가 실제 FLOPS는 아닙니다.

실험별 학습 코드와 결과 위치를 기록합니다. 기록 항목의 이름은 [W&B 기록 규격](WANDB.md)을 따릅니다.

## yolo11n-taco-baseline-s0

- 모델: YOLO11n
- 데이터셋: TACO. train 1200장, val 300장. 버전 미기록
- 학습 코드: [학습 노트북](../members/hur-wan/training/taco_yolo11n.ipynb)
- W&B: 프로젝트 `taco-yolo`, run `6uxwse31`
- 최고 가중치: [학습 폴더](../members/hur-wan/training/)의 `train/weights/best.pt` (로컬)
- 공통 평가: 미실시
- 연산량: 6.4 GFLOPs

## 새 실험을 추가할 때

실험 ID를 제목으로 한 절을 추가합니다. 모델, 데이터셋 버전과 분할, 학습 코드, W&B run 링크, 최고 가중치 위치, 공통 평가 결과를 위와 같은 항목으로 적습니다.
