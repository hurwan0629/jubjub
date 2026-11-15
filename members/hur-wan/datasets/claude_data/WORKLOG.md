# 작업 기록

2026-11-14에 Claude가 수행한 작업을 순서대로 적었습니다. 결과 요약과 사용법은 [README.md](README.md)에 있습니다.

## 1. 목표와 선별 기준

목표는 4클래스(general / plastic / can / glass) 쓰레기 탐지에 쓸 수 있고 라벨이 깔끔한 공개 데이터셋을 찾아 루트 `data/`와 같은 형식으로 만드는 것입니다.

후보를 볼 때 쓴 기준은 다음 다섯 가지입니다.

1. **박스 라벨이 있을 것.** 분류용(사진 한 장에 라벨 하나) 데이터는 제외했습니다.
2. **원본 클래스 이름만으로 4클래스가 정해질 것.** 기존 `data/`의 기준(TACO, AIHub 매핑)은 재질이 아니라 품목 기준입니다. 비닐·과자 봉지는 general이고 페트병·플라스틱 용기는 plastic입니다. 그래서 "plastic" 한 클래스에 봉지와 병이 섞여 있는 데이터는 쓸 수 없습니다.
3. **사진 안의 쓰레기가 빠짐없이 라벨되어 있을 것.** 라벨 없는 쓰레기는 학습 때 배경으로 취급됩니다.
4. **박스가 물체와 맞을 것.** 표본을 직접 그려서 확인했습니다.
5. **라이선스가 확인되고 로그인·API 키 없이 받을 수 있을 것.**

CLIP 같은 모델로 클래스를 추정해 붙이는 방법은 쓰지 않았습니다. 기준 2를 만족하지 못하는 물체가 있는 이미지는 통째로 뺐습니다.

## 2. 조사한 곳

| 조사한 곳 | 방법 |
| --- | --- |
| [waste-datasets-review](https://github.com/AgaMiko/waste-datasets-review) | 목록 전체(52개)를 읽고 탐지 라벨이 있는 것만 추림 |
| Hugging Face | 탐지 데이터셋 중 waste, trash, litter, garbage, recycling 검색 (31개) |
| Kaggle | trash detection, litter detection 등 6개 검색어 (82개) |
| Zenodo | litter detection, waste object detection 등 4개 검색어 (98개) |
| 웹 검색 | 로봇 시점, 유리병·캔 포함 데이터셋 |

Roboflow Universe는 내려받는 데 API 키가 필요해서 보지 않았습니다. AIHub도 로그인이 필요해서 보지 않았습니다.

## 3. 후보별 판정

내려받아 사진과 라벨을 직접 확인한 것은 다섯 개입니다. 근거 사진은 `reports/evidence/`에 있습니다 (이미지라 git에는 올라가지 않습니다).

| 데이터셋 | 규모 | 판정 | 이유 |
| --- | ---: | --- | --- |
| [CLICK Trash](https://huggingface.co/datasets/manjt/click_trash_dataset) | 1,126장 | **채택** | 야외 바닥, 손으로 검수한 라벨, 전 객체 라벨, MIT |
| [TOD (TADA)](https://doi.org/10.5281/zenodo.4607158) | 4,977장 | **일부 채택** (2,723장) | 한국 분리배출 기준, 유리병·캔 많음. 여백 붙인 2,093장은 박스가 어긋나 제외 |
| [GSA2D](https://www.kaggle.com/datasets/hellob/gsa2d-2024) | 5,852장 | 탈락 | 시점은 로봇과 가장 비슷하지만 라벨 오류가 많음 |
| [방글라데시 재활용 쓰레기](https://doi.org/10.5281/zenodo.22043339) | 2,842장 | 탈락 | 사진 속 쓰레기 일부만 라벨됨 |
| [Malaysian Trash Annotation](https://www.kaggle.com/datasets/larmkaixian/malaysian-trash-annotation) | 1,532장 | 탈락 | 재질 기준 분류라 4클래스와 맞지 않음 |

### GSA2D를 탈락시킨 이유

로봇 개의 머리 카메라로 실내외 바닥을 찍은 데이터라 시점은 JetRover와 가장 비슷합니다. 하지만 다음 문제가 있었습니다.

- **클래스 오류.** Bottle 크롭 110개를 보니 캔과 비닐봉지가 Bottle로 적힌 것이 있었습니다 ([사진](reports/evidence/gsa2d_bottle_class_errors_and_empty_boxes.jpg)).
- **박스 위치 불일치.** 장면 08과 10의 카메라 00 영상에서는 박스 안에 벽이나 의자만 있는 경우가 여럿 있었습니다 (같은 사진).
- **라벨 없는 프레임.** 237장은 박스가 하나도 없습니다. 그중 한 장을 열어 보니 종이 뭉치와 쓰레기통이 그대로 보였습니다 ([사진](reports/evidence/gsa2d_unlabeled_frame.jpg)). 장면 08은 시퀀스 5개가 각각 30장쯤 비어 있습니다.
- **재질 혼재.** Cup에 종이컵(general), 투명 플라스틱 컵(plastic), 텀블러와 주전자가 섞여 있습니다 ([사진](reports/evidence/gsa2d_cup_mixed_materials.jpg)).
- **아주 작은 박스.** 박스 15,484개 중 5,900개(38%)가 높이 16픽셀 미만입니다.

로봇 시점 데이터가 꼭 필요하면 이 데이터를 직접 다시 라벨하는 것이 가장 가까운 길입니다. 원본 압축 파일은 `_raw/gsa2d/`에 남겨 두었습니다.

### 방글라데시 데이터를 탈락시킨 이유

표본 9장을 보니 그중 여러 장에서 라벨된 물체 옆의 담배꽁초, 포장지, 종이 조각이 라벨 없이 남아 있었습니다 ([사진](reports/evidence/bangladesh_unlabeled_litter.jpg)). 또 `Plastic waste` 클래스에 비닐 포장과 단단한 플라스틱 상자가 함께 들어 있어 기준 2도 만족하지 못합니다.

### Malaysian Trash Annotation을 탈락시킨 이유

- 클래스가 재질 기준 14개입니다. `m-metal` 123개를 전부 보니 캔 외에 포크와 숟가락이 있었고, 마트 진열대의 새 상품을 찍은 사진이 많았습니다 ([사진](reports/evidence/mta_metal_class_crops.jpg)).
- 종류를 알 수 없는 클래스(`s-litter`, `s-other`, `m-composite`)가 박스의 25.9%(3,793개 중 981개)입니다.
- 유리는 35개뿐이라 부족한 클래스를 채우는 데 도움이 되지 않습니다.

### 내려받지 않고 제외한 후보

설명 문서만 보고 제외한 것들입니다. 사진은 확인하지 않았습니다.

| 데이터셋 | 제외한 이유 |
| --- | --- |
| SWiM3 | README에 640×640 강제 리사이즈와 증강 이미지 포함이 적혀 있고, 저장소에 `_aug0`, `_aug1` 파일이 섞여 있음. 라이선스 파일 없음 |
| WaRP | 재활용 선별장 컨베이어 영상. 분류 설비 안에서 찍은 장면이라 이미 있는 AIHub와 성격이 비슷함 |
| MRS-Trash-Detection, GARBAGE CLASSIFICATION 3 | 클래스가 재질 기준(Plastic, Metal, Glass 등)이라 봉지와 병, 캔과 다른 금속을 구분할 수 없음 |
| Household Trash Recycling (Kaggle) | Open Images 사진을 다시 묶은 것. Open Images는 사진 속 물체를 전부 라벨하지 않음 |
| pandapowr Labeled Trash | 원본 163장을 4,923장으로 증강한 것 |
| Beach-O, PlastOPol, RoLID-11K, UAVVaste | 클래스가 하나뿐이라 재질을 알 수 없음 |
| TACO 재배포본, detect-waste | 이미 가진 TACO와 같은 사진 |
| SALSA | 이전에 검토해 보류한 것 (`datasets/salsa/memo.md`) |
| Drinking Waste, AIHub 생활폐기물 | 이미 `data/`에 있음 |

### 받으려면 사용자가 직접 신청해야 하는 후보

**[HOWA](https://iuii.ua.es/datasets/howa/index.html)** (알리칸테 대학). 설명만 보면 지금 부족한 부분에 가장 잘 맞습니다.

- 야외 바닥(아스팔트, 자갈, 풀밭)에 놓인 생활 쓰레기 6,943장
- 클래스가 plastic 1,776 / carton 1,626 / glass 1,769 / metal 1,772로 고르게 분포
- RealSense D435i로 640×480 촬영, 로봇이 쓰레기를 집는 연구용
- 박스와 분할 영역 라벨, train/val/test 분할 제공

비영리 연구·교육 목적으로만 제공되며 구글 폼으로 신청해야 합니다. 신청서에 이름과 소속을 적어야 해서 제가 대신 신청하지 않았습니다. 사진을 보지 못했으므로 라벨 품질은 받은 뒤에 확인해야 합니다.

## 4. 변환하면서 내린 결정

### 공통

- **매핑할 수 없는 물체가 있으면 이미지를 통째로 뺍니다.** 박스만 지우면 라벨 없는 쓰레기가 사진에 남기 때문입니다. 뺀 이미지와 이유는 `reports/<이름>_excluded.csv`에 있습니다.
- **한 물체에 박스가 두 개면 정리합니다.** IoU 0.85 이상인 두 박스가 같은 4클래스면 하나만 남기고, 다른 클래스면 이미지를 뺍니다.
- **이미지는 원본 그대로 복사합니다.** 크기를 줄이거나 다시 압축하지 않았습니다.
- **파일 이름 앞에 데이터셋 이름을 붙입니다** (`click_0010.jpg`, `tod_20201209_618.jpg`). 나중에 여러 데이터셋을 합쳐도 이름이 겹치지 않습니다. 원본 이름은 `reports/<이름>_manifest.csv`에 있습니다.

### CLICK

- 분할은 원본이 정한 그대로 썼습니다.
- `Bottle Cap`, `Others`, `Slippers`가 있는 이미지 32장을 뺐습니다. Bottle Cap 14개는 대부분 플라스틱 뚜껑으로 보였지만, 클래스 이름만으로는 재질이 정해지지 않아 규칙대로 뺐습니다 ([사진](reports/evidence/click_bottle_cap_crops.jpg)).
- 쓰레기가 없는 사진 4장은 빈 라벨로 남겼습니다.

### TOD

- **`paded_`로 시작하는 2,093장을 뺐습니다.** 사진을 줄여 회색 여백을 붙인 이미지인데, 박스 좌표가 물체와 맞지 않습니다 ([사진](reports/evidence/tod_padded_boxes_misaligned.jpg)). 300장을 재 보니 박스의 34%가 사진 영역 밖으로 나가 있었습니다.
- **`cap`과 `label`은 병에 붙은 부품이라 박스만 지웠습니다.** 기존 AIHub 매핑에서도 뚜껑과 라벨이 붙은 페트병을 plastic 하나로 봅니다. 본체에서 떨어진 뚜껑이 있는 156장은 재질을 알 수 없어 뺐습니다 ([사진](reports/evidence/tod_loose_caps.jpg)).
- **`bottle`은 glass로 매핑했습니다.** 크롭 60개를 보니 전부 유리병이었습니다 ([사진](reports/evidence/tod_bottle_is_glass.jpg)).
- **분할을 새로 정했습니다.** 원본 val(다른 카메라로 찍은 400장)을 test로 쓰고, 원본 train을 train과 val로 나눴습니다. 같은 물건을 자리만 바꿔 연달아 찍은 데이터라 무작위로 나누면 거의 같은 장면이 양쪽에 들어갑니다. 그래서 번호가 이어지는 20장을 한 묶음으로 보고 묶음 단위로 나눴습니다.

## 5. 검사하면서 찾아 고친 것

| 발견 | 조치 |
| --- | --- |
| TOD 라벨 25개에 같은 줄이 두 번 있음 | 원본에 한 물체를 두 번 그린 박스가 있었음. 위의 "박스 두 개" 규칙을 추가해 33개를 하나로 줄이고, 클래스가 충돌하는 5장을 제외 |
| CLICK에도 같은 위치의 박스 쌍 5개 ([사진](reports/evidence/click_double_boxes.jpg)) | 같은 규칙으로 5개를 하나로 줄임 |
| TOD에서 train과 val 사이에 지문이 비슷한 사진 25쌍 | 3쌍을 열어 보니 물건이 서로 다른 사진이었음. 같은 바닥에서 찍어 배경이 같기 때문 ([사진](reports/evidence/tod_similar_background_pairs.jpg)). 조치하지 않음 |

## 6. 실행한 순서

`claude_data/` 폴더에서 실행합니다.

```bash
python scripts/download.py          # 원본 내려받기 (SHA-256 확인) -> _raw/
python scripts/convert_click.py     # -> click_yolo/, click_coco/
python scripts/convert_tod.py       # -> tod_yolo/, tod_coco/
python scripts/check_quality.py     # -> reports/quality_report.md
python scripts/make_stats.py        # -> stats/
python scripts/make_previews.py     # -> previews/
python scripts/make_figures.py      # -> figures/
```

변환 스크립트는 결과 폴더가 이미 있으면 멈춥니다. 다시 만들려면 `<이름>_yolo`와 `<이름>_coco`를 지우고 실행합니다.

조사 과정에서 쓴 일회용 스크립트(후보 미리보기, 크롭 모음)는 남기지 않았습니다. 그 결과물 중 판정 근거가 된 사진만 `reports/evidence/`에 두었습니다.

## 7. 정리한 것

- 변환과 검사가 끝난 뒤 `_raw/` 안의 압축 푼 폴더 5개(약 11GB)를 지웠습니다. 같은 내용의 압축 파일은 남겼습니다.
- 호환성 시험에 쓴 Ultralytics와 pycocotools는 가상환경에서 뺐습니다. `.venv/`에는 `pillow`와 `matplotlib`만 있습니다.
- Ultralytics가 만든 라벨 캐시(`labels/*.cache`)는 지웠습니다. 학습을 시작하면 자동으로 다시 만들어집니다.
- 저장소 안에서 `claude_data/` 밖의 파일은 읽기만 했고 고치지 않았습니다.
