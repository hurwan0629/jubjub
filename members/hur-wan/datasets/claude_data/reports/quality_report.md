# 품질 검사 결과

`python scripts/check_quality.py` 가 만든 파일입니다. 검사 항목은 스크립트 맨 위 설명을 보세요.

## click

- 이미지 1,094장, 박스 2,142개, 박스가 없는 이미지 4장
- 클래스별 박스: general 1,881, plastic 243, can 18, glass 0
- 형식·좌표 문제: 0건
- 거의 같은 사진 (지문 차이 10비트 이하, 참고용): 같은 분할 안 3쌍, 서로 다른 분할 사이 0쌍

## tod

- 이미지 2,723장, 박스 10,680개, 박스가 없는 이미지 0장
- 클래스별 박스: general 4,905, plastic 2,678, can 1,809, glass 1,288
- 형식·좌표 문제: 0건
- 거의 같은 사진 (지문 차이 10비트 이하, 참고용): 같은 분할 안 356쌍, 서로 다른 분할 사이 25쌍

  분할 사이에 걸친 쌍 (최대 20쌍 표시, 전체는 quality.json):

  - train/tod_20201209_205.jpg ↔ val/tod_20201209_192.jpg (차이 5)
  - train/tod_20201209_215.jpg ↔ val/tod_20201209_191.jpg (차이 6)
  - train/tod_20201209_215.jpg ↔ val/tod_20201209_192.jpg (차이 6)
  - train/tod_20201209_201.jpg ↔ val/tod_20201209_191.jpg (차이 8)
  - train/tod_20201207_214.jpg ↔ val/tod_20201207_196.jpg (차이 9)
  - train/tod_20201208_409.jpg ↔ val/tod_20201208_396.jpg (차이 9)
  - train/tod_20201209_203.jpg ↔ val/tod_20201209_186.jpg (차이 9)
  - train/tod_20201209_205.jpg ↔ val/tod_20201209_191.jpg (차이 9)
  - train/tod_20201209_205.jpg ↔ val/tod_20201209_194.jpg (차이 9)
  - train/tod_20201209_215.jpg ↔ val/tod_20201209_186.jpg (차이 9)
  - train/tod_20201209_280.jpg ↔ val/tod_20201209_186.jpg (차이 9)
  - train/tod_20201209_29.jpg ↔ val/tod_20201209_192.jpg (차이 9)
  - train/tod_20201207_179.jpg ↔ val/tod_20201207_191.jpg (차이 10)
  - train/tod_20201208_402.jpg ↔ val/tod_20201208_399.jpg (차이 10)
  - train/tod_20201208_412.jpg ↔ val/tod_20201208_400.jpg (차이 10)
  - train/tod_20201209_203.jpg ↔ val/tod_20201209_185.jpg (차이 10)
  - train/tod_20201209_203.jpg ↔ val/tod_20201209_191.jpg (차이 10)
  - train/tod_20201209_203.jpg ↔ val/tod_20201209_192.jpg (차이 10)
  - train/tod_20201209_203.jpg ↔ val/tod_20201209_194.jpg (차이 10)
  - train/tod_20201209_204.jpg ↔ val/tod_20201209_191.jpg (차이 10)

