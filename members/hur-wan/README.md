# 허완 (hur-wan)

- 담당: TBD
- GitHub: @hurwan0629

## 현재 폴더 구조

이 README를 기준으로 한 `members/hur-wan/`의 주요 경로입니다. 데이터와 학습 결과의 개별 파일은 생략했습니다.

```text
hur-wan/
├─ datasets/
│  ├─ aihub_living_trash/  # AI Hub 생활폐기물 샘플 데이터
│  ├─ recycle_aihub/       # AI Hub 재활용품 분류·선별 데이터
│  ├─ SAM3/               # SAM3 적용 전후 영상
│  ├─ SortWaste/          # SortWaste 이미지 데이터
│  └─ TACO/               # TACO 데이터, YOLO 변환 자료, 탐지 코드
├─ sam3/                  # SAM 3 소스와 예제·평가 스크립트
├─ tools/
│  ├─ bbox-labeler/       # 이미지 bbox 수동 라벨링 도구
│  └─ jupjup-labeler/     # 실행 파일과 source/의 원본 코드
├─ training/              # TACO YOLO11n 학습 노트북과 학습 결과
├─ wandb-study/           # Weights & Biases 실습 노트북
├─ yolo11n-study/         # YOLO11n 설정·추론·평가 학습 자료
└─ jethexa-project-plan-hur-wan.md  # 개인 프로젝트 계획
```

사용법과 세부 구조는 각 폴더의 README를 참고하세요: [TACO](datasets/TACO/README.md), [SortWaste](datasets/SortWaste/README.md), [재활용품 데이터](datasets/recycle_aihub/README.md), [bbox-labeler](tools/bbox-labeler/README.md), [jupjup-labeler 소스](tools/jupjup-labeler/source/README.md), [wandb-study](wandb-study/README.md), [yolo11n-study](yolo11n-study/README.md).

## 작업 메모

조사중인 데이터베이스
- https://archive.ics.uci.edu/dataset/908/realwaste
- https://github.com/pedropro/TACO
- https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71385
- https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71362
- https://github.com/idea-research/grounded-sam-2
- https://github.com/facebookresearch/sam3
- https://arxiv.org/abs/2511.16719
- https://huggingface.co/papers/2511.16719
- https://arxiv.org/html/2511.16719v1
- https://roboflow.com/
