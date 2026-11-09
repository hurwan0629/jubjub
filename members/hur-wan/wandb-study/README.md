# W&B 연습

실험 기록 도구 W&B(Weights & Biases)를 직접 써 보는 폴더.

## 구성

| 파일 | 내용 | 상태 |
|---|---|---|
| `01-first-run.ipynb` | YOLO 없이 가짜 loss로 project / run / config / log 구조 익히기 | 작성 |
| `02-yolo-with-wandb.ipynb` | YOLO(coco8) 학습을 W&B에 자동 기록 | 예정 |

## 준비

```
pip install wandb
wandb login
```

- API 키는 `wandb login` 할 때 내 컴퓨터(`C:\Users\<사용자>\_netrc`)에만 저장된다. **코드에 적지 않는다.**
- 실행하면 생기는 `wandb/` 폴더는 루트 `.gitignore`에서 제외된다.

## wandb 구성

| 구성 | 어디서 | 하는 일 |
|---|---|---|
| 파이썬 라이브러리 (`import wandb`) | 내 컴퓨터 | 숫자를 모아서 서버로 보냄 |
| 명령어 (`wandb login` 등) | 내 컴퓨터 터미널 | 로그인, 설정 |
| 웹 (wandb.ai) | W&B 서버 | 기록 저장 + 그래프 |
