# YOLO11n 공부 로드맵 — hur-wan

YOLO11n(가장 작은 YOLO11 모델)을 직접 받아 보고, 크기를 재 보고, 쓰레기 사진에 써 보면서 **객체 탐지가 어떻게 동작하는지** 이해하는 것이 목표입니다.
결과를 잘 내는 것보다 **내가 설명할 수 있게 되는 것**을 우선합니다.

## 순서

| 단계 | 노트북 | 배울 것 | 끝났다고 보는 기준 |
|---|---|---|---|
| 1 | [01-setup-and-weights.ipynb](01-setup-and-weights.ipynb) | 가중치(.pt) 받기, 파라미터 수, 모델 용량 | "YOLO11n은 파라미터 몇 개, 몇 MB" 를 말할 수 있다 |
| 2 | [02-inference.ipynb](02-inference.ipynb) | 사진 넣고 탐지, bbox / confidence / class 읽기 | 결과 표의 각 숫자가 무슨 뜻인지 설명할 수 있다 |
| 3 | [03-evaluate.ipynb](03-evaluate.ipynb) | Precision, Recall, mAP 로 성능 재기, 짧은 학습 맛보기 | [evaluation.md](evaluation.md)의 지표를 내 말로 설명할 수 있다 |
| 4 | (나중에) | 쓰레기 데이터셋(TACO 등)으로 파인튜닝 | 쓰레기 클래스에서 mAP를 측정했다 |

각 노트북 끝에는 **직접 해보기**와 **정리 질문**이 있습니다. 답은 노트북 맨 아래 칸에 직접 적어 두세요.

## 시작하는 법

```bash
pip install ultralytics      # 이미 설치되어 있으면 생략
```
VS Code에서 노트북을 열고 위에서부터 한 칸씩 실행합니다 (`Shift + Enter`).

## 참고
- 받은 가중치(`*.pt`), 학습 결과(`runs/`), 사진, 데이터셋은 git에 올라가지 않습니다 (`.gitignore`).
- 측정할 지표와 확인할 것: [evaluation.md](evaluation.md)
- YOLO11n과 YOLO11s 구조, 크기, 입력과 출력 비교: [yolo11-n-vs-s.html](yolo11-n-vs-s.html) (브라우저로 열기)
- 전체 프로젝트 계획: [../jethexa-project-plan-hur-wan.md](../jethexa-project-plan-hur-wan.md)
