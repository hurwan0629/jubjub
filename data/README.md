# 데이터셋

| 데이터셋 | 원본 | train / val / test 이미지 |
| --- | --- | ---: |
| AIHub 생활폐기물 | [AIHub](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71385) | 102,271 / 12,784 / 없음 |
| TACO | [GitHub](https://github.com/pedropro/TACO) | 1,200 / 150 / 150 |
| Drinking Waste | [Kaggle](https://www.kaggle.com/datasets/arkadiyhacks/drinking-waste-classification/data) | 3,848 / 482 / 481 |
| PlastOPol | [Roboflow](https://app.roboflow.com/-hhkdm/plastopol-psqz6-feusk/1) | 988 / 399 / 500 |

## 폴더 구조

```text
data/
├─ aihub_living_yolo/
├─ aihub_living_coco/
├─ taco_yolo/
├─ taco_coco/
├─ drinking_waste_yolo/
├─ drinking_waste_coco/
├─ plastopol_yolo/
└─ plastopol_coco/
```

각 `*_yolo` 폴더에는 `images/`, `labels/`, `data.yaml`이 있고, `*_coco/annotations/`에는 분할별 JSON이 있습니다.

## 클래스 분포

전체 분할의 객체 박스 수입니다. 이미지 한 장에 박스가 여러 개 있을 수 있습니다.

| 데이터셋 | 전체 이미지 | general | plastic | can | glass |
| --- | ---: | ---: | ---: | ---: | ---: |
| AIHub 생활폐기물 | 115,055 | 53,042 | 34,465 | 12,241 | 34,700 |
| TACO | 1,500 | 2,217 | 1,256 | 353 | 116 |
| Drinking Waste | 4,811 | 0 | 2,528 | 1,128 | 1,402 |
| PlastOPol | 1,887 | 1,884 | 1,679 | 187 | 174 |
| 총합 (aihub 제외) | 8,198 | 4,101 | 5,463 | 1,668 | 1,692 |

이미지 수는 로컬 `images/` 폴더, 박스 수는 `*_coco/annotations/`의 JSON 기준입니다.

## 향후 조사 예정인 데이터셋

- [Waste Datasets Review](https://github.com/AgaMiko/waste-datasets-review)

## 변경사항
- taco v1은 aihub와 분류 기준이 달랐어서 v2로 변경되었습니다. (주로 비닐봉지를 플라스틱으로 분류하고있었음)