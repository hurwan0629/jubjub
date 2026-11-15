# claude_data

4클래스(general / plastic / can / glass) 쓰레기 탐지에 쓸 추가 데이터셋입니다. Claude가 2026-11-14에 공개 데이터셋을 조사해 두 개(click, tod)를 골랐고, 2026-11-15에 사용자가 신청해 받은 HOWA를 추가했습니다. 세 개 모두 루트 `data/`와 같은 형식으로 변환했습니다.

- 어떤 후보를 왜 골랐고 왜 버렸는지는 [WORKLOG.md](WORKLOG.md)에 있습니다.
- 자동 검사 결과는 [reports/quality_report.md](reports/quality_report.md)에 있습니다.

## 데이터셋

| 데이터셋 | 원본 | 라이선스 | 장면 | train / val / test 이미지 |
| --- | --- | --- | --- | ---: |
| click | [CLICK Trash Dataset v1.0](https://huggingface.co/datasets/manjt/click_trash_dataset) | MIT | 야외 바닥(흙, 낙엽, 풀, 자갈길)에 버려진 쓰레기를 휴대폰으로 촬영 | 875 / 109 / 110 |
| tod | [TOD v1.0 (TADA)](https://doi.org/10.5281/zenodo.4607158) | MIT | 실내 타일 바닥에 한국 생활 쓰레기를 놓고 위에서 촬영 | 2,180 / 208 / 335 |
| howa | [HOWA dataset v1](https://iuii.ua.es/datasets/howa/index.html) | 비영리 연구·교육용 | 야외 바닥(흙, 아스팔트, 자갈, 풀밭)에 생활 쓰레기를 하나씩 놓고 삼각대의 카메라로 촬영 | 5,642 / 784 / 495 |

### 클래스 분포

전체 분할의 박스 수입니다.

| 데이터셋 | 전체 이미지 | general | plastic | can | glass |
| --- | ---: | ---: | ---: | ---: | ---: |
| click | 1,094 | 1,881 | 243 | 18 | 0 |
| tod | 2,723 | 4,905 | 2,678 | 1,809 | 1,288 |
| howa | 6,921 | 1,626 | 1,772 | 1,755 | 1,768 |
| 총합 | 10,738 | 8,412 | 4,693 | 3,582 | 3,056 |

세 데이터셋의 역할이 다릅니다.

- **click**은 실제로 버려진 야외 장면을 주지만 대부분 general입니다.
- **tod**는 유리병과 캔을 한국 제품으로 채워 주지만 실내 촬영입니다.
- **howa**는 야외 바닥 위의 유리와 캔을 채워 줍니다. 네 클래스가 고르게 들어 있습니다. 다만 사진 한 장에 물체가 하나뿐이고 촬영 장소가 9곳입니다.

분할별 숫자와 박스 크기 분포는 [stats/tables.md](stats/tables.md), [stats/summary.csv](stats/summary.csv), [stats/stats.json](stats/stats.json)에 있습니다.

### howa의 분할

howa는 원본의 train/val/test를 쓰지 않고 촬영 장소 단위로 다시 나눴습니다. 이유는 아래 "4클래스 매핑"의 howa 항목에 있습니다.

| 분할 | 장소 (파일 번호) | 이미지 |
| --- | --- | ---: |
| train | 아스팔트와 담 (1202~3281) | 1,363 |
| train | 자갈 더미 (3283~4642) | 806 |
| train | 붉은 흙과 콘크리트 턱 (4647~6702) | 1,416 |
| train | 구덩이 (7000~7407) | 144 |
| train | 붉은 흙과 콘크리트 보 (7409~9140) | 1,161 |
| train | 아스팔트 (10703~11802) | 665 |
| train | 아스팔트와 나무 그림자 (11806~12043) | 87 |
| val | 흙바닥 (0~1198) | 784 |
| test | 풀밭 (10001~10697) | 495 |

장소별 배경은 [reports/evidence/howa_scenes.jpg](reports/evidence/howa_scenes.jpg)에서 볼 수 있습니다.

## 폴더 구조

```text
claude_data/
├─ click_yolo/        images/, labels/ (train, val, test), data.yaml, classes.txt
├─ click_coco/        annotations/train.json, val.json, test.json
├─ tod_yolo/
├─ tod_coco/
├─ howa_yolo/         (git에 올리지 않음)
├─ howa_coco/         (git에 올리지 않음)
├─ stats/             통계 (CSV, JSON, 표)
├─ reports/           품질 검사 결과, 저장한 이미지 목록, 제외한 이미지 목록, 판정 근거 사진
├─ previews/          라벨을 그려 넣은 샘플 사진
├─ figures/           data/figures 와 같은 모양의 그림
├─ scripts/           내려받기, 변환, 검사, 통계 스크립트
└─ _raw/              원본 압축 파일 (15GB)
```

이미지는 개인 폴더의 `.gitignore` 때문에 git에 올라가지 않습니다. click과 tod는 라벨과 문서, 스크립트가 올라갑니다.

**howa는 라벨도 git에 올리지 않게 해 두었습니다** (`claude_data/.gitignore`). 신청한 사람에게 비영리 연구·교육 목적으로만 제공되는 데이터라서, 라벨을 공개 저장소에 올리면 데이터 일부를 다시 배포하는 셈이 되기 때문입니다. 팀원이 howa를 쓰려면 각자 신청해 받은 `howa.zip`으로 `scripts/convert_howa.py`를 실행하면 같은 결과가 나옵니다. 이 판단을 바꾸려면 `.gitignore`의 마지막 두 줄을 지우면 됩니다.

### 디스크 사용량

전체 약 24GB입니다.

| 폴더 | 크기 | 지워도 되는가 |
| --- | ---: | --- |
| `click_yolo/` | 5.1GB | 학습에 쓰는 데이터. 사진이 원본 해상도(대부분 3072×3072 이상)라 큼 |
| `howa_yolo/` | 3.9GB | 학습에 쓰는 데이터. 원본이 PNG라 큼 |
| `tod_yolo/` | 0.4GB | 학습에 쓰는 데이터 |
| `_raw/` | 15GB | click과 tod(6.4GB)는 지워도 `scripts/download.py`로 다시 받을 수 있음. 탈락한 후보 세 개(4.9GB)는 지워도 됨. **`howa.zip`(3.9GB)은 지우면 다시 신청해야 함** |
| `.venv/` | 0.1GB | 지워도 됨 |

`_raw/`에는 압축 파일만 있습니다. 압축을 푼 폴더는 내용이 같아서 변환이 끝난 뒤 지웠습니다.

## 쓰는 법

**YOLO.** `data.yaml`을 그대로 넘기면 됩니다.

```bash
yolo detect train model=yolo11n.pt imgsz=640 data=members/hur-wan/datasets/claude_data/tod_yolo/data.yaml
```

`data.yaml`의 `path`는 `data/`의 다른 데이터셋처럼 절대 경로입니다. 폴더를 옮기면 이 줄을 고쳐야 합니다.

**COCO (D-FINE 등).** 이미지 폴더는 `<이름>_yolo/images/<split>/`이고 라벨은 `<이름>_coco/annotations/<split>.json`입니다. 클래스 번호는 `data/`와 같이 0부터 시작합니다 (0 general, 1 plastic, 2 can, 3 glass).

**`data/`로 옮기기.** `<이름>_yolo`와 `<이름>_coco` 폴더를 `data/`에 복사하고 `data.yaml`의 `path`만 바꾸면 됩니다. howa를 옮길 때는 옮긴 곳에서도 git에 올라가지 않게 해야 합니다.

**howa를 쓴 결과를 발표하거나 보고서에 쓸 때**는 원 논문을 인용해야 합니다: Páez-Ubieta, Castaño-Amorós, Puente, Gil, "Vision and tactile robotic system to grasp litter in outdoor environments", Journal of Intelligent & Robotic Systems 109(2), 2023, [doi:10.1007/s10846-023-01930-2](https://doi.org/10.1007/s10846-023-01930-2).

## 4클래스 매핑

기준은 `data/`의 TACO, AIHub 매핑과 같습니다. 종이류와 비닐류는 general, 단단한 플라스틱 용기는 plastic입니다.

| 4클래스 | CLICK 원본 클래스 | TOD 원본 클래스 | HOWA 원본 클래스 |
| --- | --- | --- | --- |
| general (0) | Crumbled Paper, Paper Cup, Paper Pack, Cardboard, Match Box, Plastic Bag, Plastic Packet, Silver Foil | paper, paperpack, papercup, vinyl | carton |
| plastic (1) | Plastic Bottle | pet, plastic | plastic |
| can (2) | Metal Can | can | metal |
| glass (3) | (없음) | bottle | glass |
| 이미지 제외 | Bottle Cap, Others, Slippers | 본체에서 떨어진 cap, label | 라벨 없는 물체가 하나 더 찍힌 사진 |

규칙은 네 가지입니다.

1. 원본 클래스 이름만으로 4클래스가 정해질 때만 변환합니다. 모델로 추정해 붙인 라벨은 없습니다.
2. 4클래스로 정할 수 없는 물체가 하나라도 있으면 그 이미지를 통째로 뺍니다. 박스만 지우면 라벨 없는 쓰레기가 사진에 남아 배경으로 학습되기 때문입니다.
3. 한 물체에 박스가 두 번 그려져 있으면 하나로 줄입니다. 두 박스의 클래스가 다르면 그 이미지를 뺍니다.
4. 라벨 없는 쓰레기가 함께 찍힌 사진은 뺍니다. 이유는 2번과 같습니다.

이 규칙으로 CLICK은 1,126장 중 32장, TOD는 4,977장 중 2,254장, HOWA는 6,942장 중 21장을 뺐습니다. TOD에서 뺀 것의 대부분(2,093장)은 박스 좌표가 물체와 어긋난 이미지입니다. 뺀 이미지와 이유는 `reports/<이름>_excluded.csv`에 있습니다.

### howa에서 따로 정한 것

- **클래스 이름은 재질이지만 내용은 품목과 맞습니다.** HOWA의 클래스는 plastic / carton / glass / metal입니다. 재질 기준 데이터는 보통 plastic에 비닐봉지가 섞여서 쓸 수 없는데, 클래스마다 크롭 252개를 보니 plastic은 병·용기·컵뿐이었고 metal은 음료 캔과 통조림 캔뿐이었습니다. carton은 종이팩과 종이 상자입니다. 그래서 1:1로 매핑했습니다.
- **박스는 다각형 라벨에서 만들었습니다.** 원본 라벨은 물체 윤곽을 따라 찍은 점입니다. 점들의 가장 왼쪽·위·오른쪽·아래 값을 박스로 썼습니다.
- **분할을 장소 단위로 다시 정했습니다.** 원본은 삼각대에 고정한 카메라 앞에서 물건만 바꿔 놓으며 찍은 사진을 무작위로 70/20/10으로 나눴습니다. 그래서 같은 배경과 같은 물건이 세 분할에 모두 들어 있습니다. 작게 줄여 비교했을 때 거의 같은 사진 59,690쌍 중 28,367쌍이 원본 분할 사이에 걸쳐 있었습니다. 장소 단위로 나누면 0쌍입니다. val은 흙바닥 한 곳, test는 풀밭 한 곳을 통째로 썼습니다.
- **라벨 없는 물체가 하나 더 찍힌 21장을 뺐습니다.** 앞 물체를 치우지 않고 다음 사진을 찍은 구간 두 곳입니다 ([캔](reports/evidence/howa_unlabeled_second_can.jpg), [흰 컵](reports/evidence/howa_unlabeled_leftover_cup.jpg)).

## 품질 확인

**자동 검사** (`scripts/check_quality.py`). 세 데이터셋 모두 문제 0건입니다.

- 이미지와 라벨이 1:1로 짝이 맞음
- 모든 이미지가 열리고 COCO에 적힌 크기와 같음
- 박스가 모두 이미지 안에 있고, YOLO 라벨과 COCO 라벨이 같음
- 내용이 완전히 같은 파일 없음

**눈으로 본 표본.** 전수 검사는 아닙니다.

| 데이터셋 | 본 것 | 발견한 것 |
| --- | --- | --- |
| click | 전체 사진 36장, 클래스별 크롭 약 240개 | 박스는 물체에 잘 맞음. Paper Cup 40개 중 2~3개가 플라스틱 컵이나 병이고, Metal Can 18개 중 2개가 컵으로 보임. 미라벨로 보이는 작은 물체 1~2개 |
| tod | 전체 사진 45장, 클래스별 크롭 약 280개 | 박스는 물체에 잘 맞음. bottle 크롭 60개는 전부 유리병. 다른 물체에 가려진 우유팩 1개가 미라벨로 보임 |
| howa | 무작위로 뽑은 전체 사진 180장, 클래스별 크롭 1,008개(클래스당 252개), 자동으로 추린 의심 사진 334장 | 박스는 물체에 잘 맞음. 크롭에서 클래스 오류를 찾지 못함. 무작위 180장에는 라벨 없는 물체가 없었고, 의심 사진에서 위의 두 구간(21장)을 찾아 제외 |

**호환성 시험.**

- pycocotools로 COCO 파일 9개를 모두 읽었습니다.
- Ultralytics 8.4로 모든 분할을 읽었습니다. 읽은 이미지 수가 위 표와 같고, 손상으로 걸러진 이미지는 없었습니다.
- 루트의 `data/figures/make_figures.py`를 수정 없이 불러 `figures/`를 만들었습니다 (`scripts/make_figures.py`).

**현재 1차 모델의 점수.** Ultralytics 시험을 하면서 `aihub → taco` 모델로 평가도 돌렸습니다 (imgsz 640, conf 0.001, iou 0.7, CPU). 이 모델은 세 데이터셋을 학습한 적이 없습니다.

| 평가 데이터 | mAP50 | mAP50-95 | general | plastic | can | glass |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| click test (110장) | 0.337 | 0.257 | 0.405 | 0.268 | 0.099 | – |
| tod test (335장) | 0.389 | 0.255 | 0.432 | 0.163 | 0.300 | 0.125 |
| howa val (784장, 흙바닥) | 0.725 | 0.597 | 0.735 | 0.536 | 0.701 | 0.416 |
| howa test (495장, 풀밭) | 0.498 | 0.386 | 0.689 | 0.322 | 0.328 | 0.206 |

클래스별 값은 AP50-95입니다. click test에는 can이 1개뿐이라 그 값은 의미가 없습니다. tod와 howa 모두 glass가 가장 낮게 나왔습니다. howa는 물체가 하나씩 크게 찍혀 있어 다른 둘보다 점수가 높고, 같은 howa 안에서도 풀밭이 흙바닥보다 낮습니다.

## 알아둘 한계

- **야외 유리병과 캔은 howa에만 있습니다.** click에는 glass가 없고 can은 18개뿐이며, tod는 실내입니다.
- **howa는 사진 한 장에 물체가 하나입니다.** 쓰레기가 여러 개 모여 있거나 서로 가린 장면은 없습니다.
- **howa는 촬영 장소가 9곳이고, 같은 물건을 장소마다 다시 썼습니다.** 물건은 스페인 제품이고 가짓수는 세지 않았습니다. val과 test는 학습에 없는 장소지만 물건은 train에도 나오므로, 점수가 처음 보는 물건에 대한 성능보다 높게 나올 수 있습니다.
- **howa의 train에는 풀밭이 없습니다.** 풀밭 한 곳을 통째로 test로 뺐기 때문입니다. 풀밭을 학습에 쓰려면 `scripts/convert_howa.py`의 `SCENES`에서 분할을 바꾸고 다시 만들면 됩니다.
- **howa의 배경에 라벨 없는 작은 조각이 있습니다.** 자갈 더미 장면 위쪽의 흰 조각과 붉은 조각은 확대해 보니 깨진 타일과 벽돌이었습니다 ([사진](reports/evidence/howa_gravel_background_rubble.jpg)). 풀밭 장면에는 10픽셀쯤 되는 초록색 조각 하나와 종이나 낙엽으로 보이는 조각이 있습니다.
- **tod와 howa는 위에서 내려다본 시점입니다.** tod는 사람이 서서, howa는 삼각대 위에서 찍었습니다. 로봇 카메라의 낮은 시점과 다릅니다.
- **tod의 val과 test 점수는 실제보다 높게 나올 수 있습니다.** 같은 실험실에서 같은 물건을 반복해 찍었기 때문에, 분할은 사진 단위로는 겹치지 않아도 같은 물건이 양쪽에 나옵니다.
- **click은 한국 쓰레기가 아닙니다.** 포장지 상표로 보아 인도에서 찍은 것으로 보입니다.
- **click 사진은 큽니다** (대부분 3072×3072 이상). 640으로 줄이면 박스 104개가 한 변 16픽셀 미만이 됩니다.
- **원본 라벨의 오류가 조금 남아 있습니다.** click과 tod는 위 표본 검사에서 본 수준(클래스당 몇 %)입니다. howa는 라벨 없는 물체가 찍힌 사진을 전부 찾았다고 할 수 없습니다.

## 다시 만드는 법

`claude_data/` 폴더에서 실행합니다. Python 3.12에 `pillow`와 `matplotlib`만 있으면 됩니다 (`scripts/requirements.txt`). 이 두 개만 설치한 가상환경을 `.venv/`에 만들어 두었으니 `.venv/Scripts/python.exe`로 바로 실행할 수 있습니다.

```bash
python scripts/download.py          # click, tod 내려받기. howa 는 _raw/howa/howa.zip 확인. 셋 다 압축 풀기 (SHA-256 확인)
python scripts/convert_click.py     # -> click_yolo/, click_coco/
python scripts/convert_tod.py       # -> tod_yolo/, tod_coco/
python scripts/convert_howa.py      # -> howa_yolo/, howa_coco/
python scripts/check_quality.py     # -> reports/quality_report.md
python scripts/make_stats.py        # -> stats/
python scripts/make_previews.py     # -> previews/
python scripts/make_figures.py      # -> figures/
```

| 스크립트 | 하는 일 |
| --- | --- |
| `common.py` | 공통 함수. 이미지 복사, 박스 정리, YOLO와 COCO 저장 |
| `convert_click.py`, `convert_tod.py`, `convert_howa.py` | 원본 라벨을 읽어 매핑하고, 뺄 이미지와 분할을 정함 |
| `check_quality.py` | 형식, 좌표, 중복 검사 |
| `make_stats.py` | 통계 표 |
| `make_previews.py` | 라벨을 그린 샘플 사진 |
| `make_figures.py` | `data/figures`와 같은 그림 |
| `download.py` | 원본 내려받기와 압축 풀기 |

압축 파일이 `_raw/`에 이미 있으면 `download.py`는 다시 받지 않고 SHA-256만 확인한 뒤 압축을 풉니다. howa는 신청 양식을 내야 받을 수 있어서 내려받지 않습니다. `_raw/howa/howa.zip`이 없으면 안내를 출력하고 멈춥니다. 하나만 준비하려면 `python scripts/download.py tod`처럼 이름을 붙입니다.

변환 스크립트는 결과 폴더가 이미 있으면 멈추므로, 다시 만들 때는 `<이름>_yolo`와 `<이름>_coco`를 먼저 지웁니다.

`_raw/`에는 채택하지 않은 후보 세 개(gsa2d, bangladesh, mta)의 압축 파일도 남아 있습니다 (4.9GB). 판정을 직접 확인해 볼 수 있게 둔 것이고, 필요 없으면 지워도 됩니다.
