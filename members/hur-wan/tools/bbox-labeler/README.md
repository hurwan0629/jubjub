# BBox Labeler

이미지에 사각형 박스(bbox)와 클래스를 **사람이 직접** 그리는 라벨링 프로그램입니다.
SAM, Grounding DINO, LLM 이 만든 자동 라벨을 열어서 고치는 검수 도구로도 쓸 수 있습니다.

- 작업 결과는 **YOLO txt** 로 자동 저장되고, **YOLO / COCO** 로 내보낼 수 있습니다.
- 클래스는 데이터 폴더의 `data.yaml` / `classes.txt` / `annotations.json` 에서 읽습니다.
- 명령어 없이 실행기를 더블클릭해서 씁니다. 자세한 사용법은 프로그램 안 **[도움말] (F1)** 에 있습니다.

## 실행

| OS | 실행 방법 |
|----|-----------|
| Windows | `run-windows.bat` 더블클릭 |
| macOS | `run-mac.command` 더블클릭 (처음 한 번은 오른쪽 클릭 > 열기) |
| Linux | `run-linux.sh` 실행 |

- 필요: **Python 3.8 이상** (tkinter 포함). 이미지 처리용 **Pillow** 가 없으면 처음 켤 때 자동 설치를 물어봅니다.
- PyYAML 은 있으면 쓰고, 없어도 `data.yaml` 을 읽을 수 있습니다.

## 데이터 폴더 규격

```
my-dataset/                 ← 프로그램에서 이 폴더를 엽니다
├─ images/                  ← (필수) jpg, png, bmp, webp, tif. 하위 폴더(train/, val/ ...) 가능
├─ labels/                  ← (선택) YOLO txt. 없으면 자동 생성
├─ data.yaml                ← 클래스 정보: 이 셋 중 처음 찾은 하나를 사용
├─ classes.txt              ←   (data.yaml → classes.txt → annotations.json 순서)
└─ annotations.json         ← (선택) COCO 라벨
```

- 라벨은 이미지마다 `labels/<같은 경로>.txt` → `annotations.json` 순서로 찾습니다.
  (`images/train/a.jpg` ↔ `labels/train/a.txt`, Ultralytics 규칙과 같음)
- 신뢰도가 붙은 YOLO 줄(값 6개)과 폴리곤 라벨도 읽습니다. 폴리곤은 감싸는 박스로 바뀝니다.
- COCO 라벨은 카테고리 **이름**으로 클래스 목록과 맞춥니다.
- 휴대폰 사진의 EXIF 회전을 반영합니다. YOLO 학습 때 이미지를 읽는 기준과 같습니다.
- 클래스 파일이 없으면 폴더를 열 때 입력받아 `classes.txt` 를 만듭니다.
- 확인(✔) 표시와 마지막 위치는 `<데이터 폴더>/.bbox_labeler/state.json` 에 저장됩니다.

## 내보내기

`[파일] > [내보내기]` 에서 형식과 포함할 이미지를 고르면 `export/yolo_날짜_시간/` 또는 `export/coco_날짜_시간/` 이 새로 만들어집니다. 원본은 바뀌지 않습니다.

- **YOLO (기본)**: `images/`, `labels/`, `data.yaml`, `classes.txt`. Ultralytics 에 `data.yaml` 경로만 넘기면 됩니다.
- **COCO**: `annotations.json` (bbox = `[x, y, w, h]` 픽셀, category id 는 1부터). images 가 train/val 로 나뉘어 있으면 `annotations_train.json` 같은 파일도 함께 만듭니다.
- 포함할 이미지: 라벨이 있거나 확인한 이미지(기본) / 확인한 이미지만 / 모든 이미지.
- 기본 형식은 `[설정]` 에서 바꿀 수 있습니다.

## 주요 단축키

| 키 | 동작 |
|----|------|
| 마우스 끌기 | 박스 그리기 (Ctrl+끌기: 항상 새로 그리기) |
| 클릭 / 끌기 / 테두리 끌기 | 선택 / 이동 / 크기 조절 |
| `1`~`9`, `0` | 클래스 선택 (박스 선택 중이면 그 박스의 클래스 변경) |
| `A` `D` (`←` `→`) | 이전 / 다음 이미지 (자동 저장) |
| `N` | 확인 안 한 다음 이미지 |
| `Delete` | 선택한 박스 삭제 |
| `Ctrl+Z` / `Ctrl+Y` | 되돌리기 / 다시 실행 |
| `Ctrl+C` / `Ctrl+V` / `Ctrl+Shift+V` | 박스 복사 / 붙여넣기 / 앞 이미지 박스 가져오기 |
| 휠, `Space`+끌기, `F` | 확대·축소, 화면 이동, 화면 맞춤 |
| `Ctrl+S`, `Ctrl+E`, `F1` | 저장, 내보내기, 도움말 |

## 파일

| 파일 | 설명 |
|------|------|
| `bbox_labeler.py` | 프로그램 본체 (표준 라이브러리 tkinter + Pillow, 파일 1개) |
| `run-*.bat/.command/.sh` | OS별 실행기 |
| `settings.json` | 개인 설정 (자동 생성, git 제외) |
| `error.log` | 오류 기록 (오류가 났을 때만 생성, git 제외) |
