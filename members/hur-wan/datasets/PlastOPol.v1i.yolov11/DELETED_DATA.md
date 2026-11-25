# 삭제한 데이터 기록

- 삭제일: 2026-11-14
- 삭제 이유: 듀얼부팅용 SSD 공간 확보. 4클래스 변환본이 프로젝트 루트 `data/plastopol_yolo/`에 남아 있음
- 삭제한 경로 (약 4.0GB, Roboflow export 원본 이미지와 라벨)

| 폴더 | 파일 수 | 크기 |
|---|---|---|
| `train/` | 2,748 | 2.25GB |
| `valid/` | 1,042 | 0.88GB |
| `test/` | 1,046 | 0.91GB |

## 남아 있는 것

- 이 폴더의 `data.yaml`, `README.roboflow.txt`, `convert_to_4class.py`
- 변환된 학습용 데이터: `parkkeeper-jupjup/data/plastopol_yolo/`, `data/plastopol_coco/`

## 다시 받는 방법

Roboflow: https://app.roboflow.com/-hhkdm/plastopol-psqz6-feusk/1
(workspace `-hhkdm`, project `plastopol-psqz6-feusk`, version 1, CC BY 4.0)
→ **YOLOv11** 형식으로 export한 뒤 `train/ valid/ test/`를 이 폴더에 풀고 `convert_to_4class.py`를 실행하세요.
본인 Roboflow 워크스페이스에 있는 프로젝트라면 로그인해야 받을 수 있어요.
