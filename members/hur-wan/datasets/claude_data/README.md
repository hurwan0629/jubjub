# claude_data

4클래스(general / plastic / can / glass) 쓰레기 탐지에 쓸 추가 데이터셋입니다. Claude가 2026-11-14에 공개 데이터셋을 조사해 두 개를 골랐고, 루트 `data/`와 같은 형식으로 변환했습니다.

- 어떤 후보를 왜 골랐고 왜 버렸는지는 [WORKLOG.md](WORKLOG.md)에 있습니다.
- 자동 검사 결과는 [reports/quality_report.md](reports/quality_report.md)에 있습니다.

## 데이터셋

| 데이터셋 | 원본 | 라이선스 | 장면 | train / val / test 이미지 |
| --- | --- | --- | --- | ---: |
| click | [CLICK Trash Dataset v1.0](https://huggingface.co/datasets/manjt/click_trash_dataset) | MIT | 야외 바닥(흙, 낙엽, 풀, 자갈길)에 버려진 쓰레기를 휴대폰으로 촬영 | 875 / 109 / 110 |
| tod | [TOD v1.0 (TADA)](https://doi.org/10.5281/zenodo.4607158) | MIT | 실내 타일 바닥에 한국 생활 쓰레기를 놓고 위에서 촬영 | 2,180 / 208 / 335 |

### 클래스 분포

전체 분할의 박스 수입니다.

| 데이터셋 | 전체 이미지 | general | plastic | can | glass |
| --- | ---: | ---: | ---: | ---: | ---: |
| click | 1,094 | 1,881 | 243 | 18 | 0 |
| tod | 2,723 | 4,905 | 2,678 | 1,809 | 1,288 |
| 총합 | 3,817 | 6,786 | 2,921 | 1,827 | 1,288 |

두 데이터셋의 역할이 다릅니다. click은 실제 야외 바닥 장면을 주지만 대부분 general입니다. tod는 기존 야외 데이터에 부족했던 유리병과 캔을 한국 제품으로 채워 주지만 실내 촬영입니다.

분할별 숫자와 박스 크기 분포는 [stats/tables.md](stats/tables.md), [stats/summary.csv](stats/summary.csv), [stats/stats.json](stats/stats.json)에 있습니다.

## 폴더 구조

```text
claude_data/
├─ click_yolo/        images/, labels/ (train, val, test), data.yaml, classes.txt
├─ click_coco/        annotations/train.json, val.json, test.json
├─ tod_yolo/
├─ tod_coco/
├─ stats/             통계 (CSV, JSON, 표)
├─ reports/           품질 검사 결과, 저장한 이미지 목록, 제외한 이미지 목록, 판정 근거 사진
├─ previews/          라벨을 그려 넣은 샘플 사진
├─ figures/           data/figures 와 같은 모양의 그림
├─ scripts/           내려받기, 변환, 검사, 통계 스크립트
└─ _raw/              내려받은 원본 압축 파일 (11GB, 지워도 됨)
```

이미지는 개인 폴더의 `.gitignore` 때문에 git에 올라가지 않습니다. 라벨과 문서, 스크립트만 올라갑니다.

### 디스크 사용량

전체 약 17GB입니다.

| 폴더 | 크기 | 지워도 되는가 |
| --- | ---: | --- |
| `click_yolo/` | 5.1GB | 학습에 쓰는 데이터. 사진이 원본 해상도(대부분 3072×3072 이상)라 큼 |
| `tod_yolo/` | 0.4GB | 학습에 쓰는 데이터 |
| `_raw/` | 11GB | 지워도 됨. 채택한 두 개(6.4GB)는 `scripts/download.py`로 다시 받을 수 있음 |
| `.venv/` | 0.1GB | 지워도 됨 |

`_raw/`에는 압축 파일만 있습니다. 압축을 푼 폴더는 내용이 같아서 변환이 끝난 뒤 지웠습니다.

## 쓰는 법

**YOLO.** `data.yaml`을 그대로 넘기면 됩니다.

```bash
yolo detect train model=yolo11n.pt imgsz=640 data=members/hur-wan/datasets/claude_data/tod_yolo/data.yaml
```

`data.yaml`의 `path`는 `data/`의 다른 데이터셋처럼 절대 경로입니다. 폴더를 옮기면 이 줄을 고쳐야 합니다.

**COCO (D-FINE 등).** 이미지 폴더는 `<이름>_yolo/images/<split>/`이고 라벨은 `<이름>_coco/annotations/<split>.json`입니다. 클래스 번호는 `data/`와 같이 0부터 시작합니다 (0 general, 1 plastic, 2 can, 3 glass).

**`data/`로 옮기기.** 네 폴더(`click_yolo`, `click_coco`, `tod_yolo`, `tod_coco`)를 `data/`에 복사하고 `data.yaml`의 `path`만 바꾸면 됩니다.

## 4클래스 매핑

기준은 `data/`의 TACO, AIHub 매핑과 같습니다. 종이류와 비닐류는 general, 단단한 플라스틱 용기는 plastic입니다.

| 4클래스 | CLICK 원본 클래스 | TOD 원본 클래스 |
| --- | --- | --- |
| general (0) | Crumbled Paper, Paper Cup, Paper Pack, Cardboard, Match Box, Plastic Bag, Plastic Packet, Silver Foil | paper, paperpack, papercup, vinyl |
| plastic (1) | Plastic Bottle | pet, plastic |
| can (2) | Metal Can | can |
| glass (3) | (없음) | bottle |
| 이미지 제외 | Bottle Cap, Others, Slippers | 본체에서 떨어진 cap, label |

규칙은 세 가지입니다.

1. 원본 클래스 이름만으로 4클래스가 정해질 때만 변환합니다. 모델로 추정해 붙인 라벨은 없습니다.
2. 4클래스로 정할 수 없는 물체가 하나라도 있으면 그 이미지를 통째로 뺍니다. 박스만 지우면 라벨 없는 쓰레기가 사진에 남아 배경으로 학습되기 때문입니다.
3. 한 물체에 박스가 두 번 그려져 있으면 하나로 줄입니다. 두 박스의 클래스가 다르면 그 이미지를 뺍니다.

이 규칙으로 CLICK은 1,126장 중 32장, TOD는 4,977장 중 2,254장을 뺐습니다. TOD에서 뺀 것의 대부분(2,093장)은 박스 좌표가 물체와 어긋난 이미지입니다. 뺀 이미지와 이유는 `reports/click_excluded.csv`, `reports/tod_excluded.csv`에 있습니다.

## 품질 확인

**자동 검사** (`scripts/check_quality.py`). 두 데이터셋 모두 문제 0건입니다.

- 이미지와 라벨이 1:1로 짝이 맞음
- 모든 이미지가 열리고 COCO에 적힌 크기와 같음
- 박스가 모두 이미지 안에 있고, YOLO 라벨과 COCO 라벨이 같음
- 내용이 완전히 같은 파일 없음

**눈으로 본 표본.** 전수 검사는 아닙니다.

| 데이터셋 | 본 것 | 발견한 것 |
| --- | --- | --- |
| click | 전체 사진 36장, 클래스별 크롭 약 240개 | 박스는 물체에 잘 맞음. Paper Cup 40개 중 2~3개가 플라스틱 컵이나 병이고, Metal Can 18개 중 2개가 컵으로 보임. 미라벨로 보이는 작은 물체 1~2개 |
| tod | 전체 사진 45장, 클래스별 크롭 약 280개 | 박스는 물체에 잘 맞음. bottle 크롭 60개는 전부 유리병. 다른 물체에 가려진 우유팩 1개가 미라벨로 보임 |

**호환성 시험.**

- pycocotools로 COCO 파일 6개를 모두 읽었습니다.
- Ultralytics 8.4로 모든 분할을 읽었습니다. 읽은 이미지 수가 위 표와 같고, 손상으로 걸러진 이미지는 없었습니다.
- 루트의 `data/figures/make_figures.py`를 수정 없이 불러 `figures/`를 만들었습니다 (`scripts/make_figures.py`).

**현재 1차 모델의 점수.** Ultralytics 시험을 하면서 `aihub → taco` 모델로 평가도 돌렸습니다 (imgsz 640, conf 0.001, iou 0.7, CPU). 이 모델은 두 데이터셋을 학습한 적이 없습니다.

| 평가 데이터 | mAP50 | mAP50-95 | general | plastic | can | glass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| click test (110장) | 0.337 | 0.257 | 0.405 | 0.268 | 0.099 | – |
| tod test (335장) | 0.389 | 0.255 | 0.432 | 0.163 | 0.300 | 0.125 |

클래스별 값은 AP50-95입니다. click test에는 can이 1개뿐이라 그 값은 의미가 없습니다. tod에서 glass가 가장 낮게 나왔습니다.

## 알아둘 한계

- **야외 유리병과 캔은 여전히 부족합니다.** glass는 전부 tod(실내)에서 왔고, click의 can은 18개뿐입니다.
- **tod는 사람이 서서 내려다본 시점입니다.** 로봇 카메라의 낮은 시점과 다릅니다.
- **tod의 val과 test 점수는 실제보다 높게 나올 수 있습니다.** 같은 실험실에서 같은 물건을 반복해 찍었기 때문에, 분할은 사진 단위로는 겹치지 않아도 같은 물건이 양쪽에 나옵니다.
- **click은 한국 쓰레기가 아닙니다.** 포장지 상표로 보아 인도에서 찍은 것으로 보입니다.
- **click 사진은 큽니다** (대부분 3072×3072 이상). 640으로 줄이면 박스 104개가 한 변 16픽셀 미만이 됩니다.
- **원본 라벨의 오류가 조금 남아 있습니다.** 위 표본 검사에서 본 수준(클래스당 몇 %)입니다.

## 다시 만드는 법

`claude_data/` 폴더에서 실행합니다. Python 3.12에 `pillow`와 `matplotlib`만 있으면 됩니다 (`scripts/requirements.txt`). 이 두 개만 설치한 가상환경을 `.venv/`에 만들어 두었으니 `.venv/Scripts/python.exe`로 바로 실행할 수 있습니다.

```bash
python scripts/download.py          # 원본 내려받기와 압축 풀기 -> _raw/ (6.4GB, SHA-256 확인)
python scripts/convert_click.py     # -> click_yolo/, click_coco/
python scripts/convert_tod.py       # -> tod_yolo/, tod_coco/
python scripts/check_quality.py     # -> reports/quality_report.md
python scripts/make_stats.py        # -> stats/
python scripts/make_previews.py     # -> previews/
python scripts/make_figures.py      # -> figures/
```

| 스크립트 | 하는 일 |
| --- | --- |
| `common.py` | 공통 함수. 이미지 복사, 박스 정리, YOLO와 COCO 저장 |
| `convert_click.py`, `convert_tod.py` | 원본 라벨을 읽어 매핑하고, 뺄 이미지를 정함 |
| `check_quality.py` | 형식, 좌표, 중복 검사 |
| `make_stats.py` | 통계 표 |
| `make_previews.py` | 라벨을 그린 샘플 사진 |
| `make_figures.py` | `data/figures`와 같은 그림 |
| `download.py` | 원본 내려받기와 압축 풀기 |

압축 파일이 `_raw/`에 이미 있으면 `download.py`는 다시 받지 않고 SHA-256만 확인한 뒤 압축을 풉니다. 변환 스크립트는 결과 폴더가 이미 있으면 멈추므로, 다시 만들 때는 `<이름>_yolo`와 `<이름>_coco`를 먼저 지웁니다.

`_raw/`에는 채택하지 않은 후보 세 개(gsa2d, bangladesh, mta)의 압축 파일도 남아 있습니다 (4.9GB). 판정을 직접 확인해 볼 수 있게 둔 것이고, 필요 없으면 `_raw/` 전체를 지워도 됩니다.
