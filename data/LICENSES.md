# 데이터셋 라이선스

`data/` 안의 데이터셋마다 출처와 이용 조건을 적었습니다. 저장소 루트의 `LICENSE`는 팀 코드에 대한 것이고, 여기 있는 데이터에는 적용되지 않습니다. 각 데이터는 원래 라이선스를 따릅니다.

> 초안입니다 (2026-11-19, Claude 작성). "확인 상태" 열을 보고 검수해 주세요. 법률 자문이 아닙니다.

>` 2026-11-19 08:32:29` 팀원 허완 검수 작업 진행하였습니다.

## 요약

| 데이터셋 | 라이선스 | 재배포 (라벨을 git에 올림) | 인용·표시 의무 | 확인 상태 | git |
| --- | --- | --- | --- | --- | --- |
| AIHub 생활폐기물 | AIHub 이용약관 | **확인 필요** | 사람 검수 | ✅ https://aihub.or.kr/intrcn/guid/usagepolicy.do에 근거하여 저작 표기 | 올림
| TACO | 저장소는 MIT. 데이터 미러들은 CC BY 4.0으로 표기 | 가능할 것으로 보임 | 논문 인용 / 사람 검수 | ✅ 상업적 사용에도 괜찮다 나오지만 표기가 필요하다 나옴 | 올림 |
| Drinking Waste | CC0 1.0 (Dataset Ninja 표기) | 가능 | 없음 (CC0) | ⚠️ Kaggle 원본 페이지는 못 열어봄 | 올림 |
| PlastOPol | CC BY 4.0 (Zenodo) | 가능 | 출처 표시, 변경 사실 표시, 논문 인용 | ✅ 확인 | 올림 |
| CLICK | MIT | 가능 | 저작권·라이선스 문구 포함 | ✅ 확인 | 올림 |
| TOD | 코드 MIT, 데이터는 Zenodo에 "Other (Open)" | 불분명 | 인용 권장 / 사람 검수 | 자유롭게 사용 가능하다 확인됨  | 올림 |
| HOWA | 비영리 연구·교육 목적만 허용 | **불가** (신청자에게만 제공) | 논문 인용 필수 / 사람 검수 | ✅ | **제외** (`.gitignore`) |

## 데이터셋별

### AIHub 생활폐기물
- 출처: https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71385
- 받는 방법: AIHub 로그인 후 신청
- 확인할 것: 데이터셋 페이지와 이용약관에서 제3자 제공·재배포 조항. 약관이 들어 있는 신청서 파일(docx)을 열지 못해 확인하지 못했습니다.
- 확인 전까지는 `aihub_living_yolo/`, `aihub_living_coco/`를 `.gitignore`에 넣어 두는 것을 권합니다. 저장소가 공개 상태입니다.

### TACO
- 출처: https://github.com/pedropro/TACO , http://tacodataset.org
- 저장소 라이선스는 MIT입니다. 하지만 그 MIT가 어노테이션과 이미지에도 적용되는지는 저장소에 적혀 있지 않습니다. 이미지는 Flickr에 올라가 있습니다.
- Dataset Ninja와 Roboflow의 TACO 미러는 CC BY 4.0으로 표기합니다.
- 인용: Proença, P. F., & Simões, P. (2020). TACO: Trash Annotations in Context for Litter Detection. arXiv:2003.06975

### Drinking Waste
- 출처: https://www.kaggle.com/datasets/arkadiyhacks/drinking-waste-classification
- 만든 사람: Arkadiy Serezhkin
- Dataset Ninja는 CC0 1.0으로 표기합니다. Kaggle 원본 페이지의 라이선스 표기는 직접 확인하지 못했습니다.

### PlastOPol
- 원본: https://doi.org/10.5281/zenodo.5829156 (CC BY 4.0)
- 받은 곳: Roboflow 프로젝트 (`README.md`의 링크)
- 원본은 클래스가 `litter` 하나입니다. 4클래스 라벨은 팀이 줍줍 라벨러로 다시 붙인 것입니다. CC BY 4.0은 변경을 허용하지만 **변경했다는 사실을 표시**해야 합니다.
- 인용: Córdova, M., Pinto, A., Hellevik, C. C., Alaliyat, S. A.-A., Hameed, I. A., Pedrini, H., & Torres, R. da S. (2022). Litter Detection with Deep Learning: A Comparative Study. Sensors, 22(2), 548. doi:10.3390/s22020548

### CLICK
- 출처: https://huggingface.co/datasets/manjt/click_trash_dataset (Mendeley Data DOI 10.17632/htcvvz6fm2.1)
- 만든 사람: Manjit Baishya
- MIT. 라벨을 재배포하므로 원본 라이선스 전문을 `click_yolo/LICENSE`로 함께 두는 것이 정석입니다 (아직 없음).
- 13클래스를 4클래스로 바꾸고 일부 이미지를 뺐습니다 (`README.md` 참고).

### TOD (TADA)
- 출처: https://doi.org/10.5281/zenodo.4607158 , https://github.com/jms0923/TADA
- 만든 사람: Minseok Jo (고려대) 외
- GitHub 저장소는 MIT입니다. Zenodo 데이터 페이지는 "Other (Open)"으로만 적혀 있고 설명이 없으며, 받은 압축 파일 안에도 라이선스 파일이 없습니다.
- 인용: Jo, M., Han, S., & Jeong, C. (2021). Large-Scale High-Resolution Dataset for Trash Detection. (README의 BibTeX, 출판 정보 미완성)

### HOWA
- 출처: https://iuii.ua.es/datasets/howa/index.html (구글 폼으로 신청)
- 만든 곳: 알리칸테 대학 AUROVA
- 비영리 연구·교육 목적으로만 공유되고, 원 논문을 인용해야 합니다.
- **git에 올리지 않습니다.** 라벨만 올려도 신청하지 않은 사람에게 데이터를 나눠 주는 셈입니다. 팀원은 각자 신청해 받은 `howa.zip`으로 `members/hur-wan/datasets/claude_data/scripts/convert_howa.py`를 실행합니다.
- 인용: Páez-Ubieta, I. de L., Castaño-Amorós, J., Puente, S. T., & Gil, P. (2023). Vision and tactile robotic system to grasp litter in outdoor environments. Journal of Intelligent & Robotic Systems, 109(2). doi:10.1007/s10846-023-01930-2

## 학습한 모델에 대해

여러 데이터셋을 섞어 학습한 모델에는 가장 엄격한 조건이 따라온다고 보는 것이 안전합니다. HOWA가 들어간 모델은 비영리 목적으로만 쓰는 것이 맞습니다. KDT 프로젝트 안에서는 문제가 없지만, 나중에 상업적으로 쓰려면 다시 검토해야 합니다.
