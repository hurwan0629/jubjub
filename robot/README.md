# robot

JetHexa(6족 보행 로봇) 제어 코드를 둡니다.

## 맡는 기능
- **이동**: 공원 안을 돌아다니며 쓰레기 탐색 (탐색/경로 알고리즘은 아직 정하지 않음)
- **집기**: 인식한 쓰레기 쪽으로 다가가 그리퍼로 집기
- **적재**: 집은 쓰레기를 로봇 뒤쪽 수거통에 넣기
- **분리수거**: 모은 쓰레기를 종류별로 배출

## ROS 패키지란?
JetHexa는 Jetson Nano 위에서 ROS(Robot Operating System)로 동작합니다.
ROS 코드는 **워크스페이스** 안에 기능별 **패키지**로 나눠 관리합니다.

```
catkin_ws/
└─ src/
   ├─ trash_detector/     카메라 영상 → 쓰레기 위치/종류 (vision 모델 사용)
   │   ├─ package.xml     패키지 정보, 의존성
   │   ├─ CMakeLists.txt  빌드 설정
   │   ├─ scripts/        노드 코드 (.py)
   │   └─ launch/         실행 설정 (.launch)
   ├─ navigator/          이동, 탐색
   └─ arm_grasp/          그리퍼 집기, 수거통 적재
```

패키지끼리는 **토픽**(메시지 채널)으로 데이터를 주고받습니다.
예) `trash_detector`가 `/trash/detections`로 위치를 보내면 `navigator`와 `arm_grasp`가 받아서 움직입니다.

> 패키지 구성은 알고리즘이 정해지면 확정합니다. 지금은 비워둡니다.
