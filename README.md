# ParkKeeper JupJup (공원지킴이 줍줍)

JetHexa 6족 로봇으로 공원에 떨어진 쓰레기를 **카메라로 인식 → 이동 → 집기 → 뒤쪽 수거통에 적재 → 분리수거**까지 수행하는 프로젝트입니다.
로봇 상태 확인·제어용 모바일 앱도 함께 개발할 예정입니다.

> 진행 상황: 기획 단계 (탐색/경로 알고리즘, 앱 프레임워크 미정)

## 팀원

| 이름 | 개인 폴더 | GitHub ID | 담당 |
|------|-----------|-----------|------|
| 한혜원 | [members/han-hyewon](members/han-hyewon) | TBD | TBD |
| 이희승 | [members/lee-heeseung](members/lee-heeseung) | TBD | TBD |
| 권민이 | [members/kwon-minyi](members/kwon-minyi) | TBD | TBD |
| 배성욱 | [members/bae-seonguk](members/bae-seonguk) | TBD | TBD |
| 허완 | [members/hur-wan](members/hur-wan) | TBD | TBD |

## 폴더 구조

```
parkkeeper-jupjup/
├─ .github/    PR / 이슈 템플릿
├─ docs/       기획, 회의록, 설계 문서
├─ robot/      JetHexa 제어 코드 (ROS) - 이동, 그리퍼, 수거통
├─ vision/     쓰레기 인식 모델 - 학습, 추론
├─ app/        모바일 앱
├─ data/       데이터셋 안내 (실제 데이터는 git에 올리지 않음)
└─ members/    팀원별 개인 작업 공간
```

- **공용 폴더**(`robot/`, `vision/`, `app/`, `docs/`): 팀이 함께 쓰는 통합 코드와 문서
- **개인 폴더**(`members/<이름>/`): 개인 실험, 연습, 조사 자료. 쓸 만한 코드는 PR로 공용 폴더에 옮깁니다.

## 작업 규칙

### 이름 규칙
- 폴더, 파일 이름은 **영어 소문자**로 짓습니다. 문서 내용은 한국어로 써도 됩니다.
- 폴더와 일반 파일: `kebab-case` (예: `trash-classes.md`)
- Python 파일: `snake_case` (예: `trash_detector.py`)
- 회의록: `docs/meetings/YYYY-MM-DD.md`

### 브랜치
```
main      항상 동작하는 안정 버전 (직접 push 금지)
 └─ dev   기능을 합치는 통합 브랜치
     └─ feature/<영역>-<내용>   예) feature/vision-yolo-train, feature/robot-gripper
```
1. `dev`에서 `feature/...` 브랜치를 만들어 작업합니다.
2. 작업이 끝나면 `dev`로 PR을 올리고, 팀원 1명 이상이 리뷰한 뒤 머지합니다.
3. 발표나 시연 전처럼 안정된 시점에 `dev`를 `main`으로 머지합니다.

개인 폴더(`members/<본인>/`)만 수정할 때는 `dev`에 바로 커밋해도 됩니다.

### 커밋 메시지
```
type(scope): 내용
```
- type: `feat`(기능), `fix`(버그 수정), `docs`(문서), `refactor`(구조 개선), `test`(테스트), `chore`(설정, 기타)
- scope: `robot`, `vision`, `app`, `docs`, `members`
- 예) `feat(vision): 페트병/캔 분류 모델 학습 스크립트 추가`

### 올리지 않는 것
데이터셋, 모델 가중치(`*.pt`, `*.onnx`, `*.engine`), 비밀번호와 API 키(`.env`)는 커밋하지 않습니다. `.gitignore`에 등록되어 있습니다.

## 처음 받는 법

```bash
git clone <레포 주소>
cd parkkeeper-jupjup
git checkout dev
```

## TODO
- [ ] 팀원 GitHub ID와 담당 기입
- [ ] GitHub 레포 생성 후 `main` 브랜치 보호 설정
- [ ] 탐색/경로 알고리즘 결정
- [ ] 쓰레기 분류 클래스 결정 (`vision/README.md`)
- [ ] 앱 프레임워크 결정
- [ ] (GitHub ID 확정 후) `.github/CODEOWNERS` 추가
