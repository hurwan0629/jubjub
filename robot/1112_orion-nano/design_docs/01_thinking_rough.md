```
[Mission] 임무 수행
   │
   ├── 쓰레기 탐색
   ├── 쓰레기까지 이동
   ├── 쓰레기 수거
   └── 수거 장소로 복귀
          │
[Skills] 행동 단위
   │
   ├── move_to(x, y)
   ├── rotate_to(angle)
   ├── detect_trash()
   └── pick_up()
          │
[Control / Perception] 기본 기능
   │
   ├── 이동 명령 발행
   ├── 로봇 위치 조회
   ├── 카메라 이미지 수신
   ├── 객체탐지 모델 추론
   └── 로봇팔 제어
          │
[ROS2 / Hardware]
   │
   ├── 모터
   ├── 카메라
   ├── LiDAR
   └── 로봇팔
```