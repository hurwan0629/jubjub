# JetRover 개발 환경 기록

2026-11-23 오전(KST)에 `ubuntu@192.168.0.234`에서 읽기 전용 명령으로 수집했다. 로봇의 파일 시스템이나 OS 이미지를 복제한 자료는 아니다. 원본 명령과 핵심 설정은 [스냅샷 폴더](jetrover-dev-snapshot-20261123-090716)에 있다. [수집 스크립트](collect-jetrover.sh)는 다시 실행할 때 `/tmp`에 새 압축 파일을 만든다. 비밀번호와 모델 가중치는 저장하지 않았다.

## 개발 환경

| 항목 | 현재 값 | 근거 |
| --- | --- | --- |
| 보드와 OS | Jetson Orin Nano Super, `aarch64`, Ubuntu 22.04.5, L4T R36.4.3 | [플랫폼](jetrover-dev-snapshot-20261123-090716/system/platform.txt) |
| ROS | ROS 2 Humble, `ROS_DOMAIN_ID=0`, 실제 RMW `rmw_fastrtps_cpp` | [환경변수](jetrover-dev-snapshot-20261123-090716/ros/environment.txt), [RMW 확인](jetrover-dev-snapshot-20261123-090716/ros/rmw.txt) |
| Python과 추론 | Python 3.10.12, CUDA 12.6, torch 2.7.0, Ultralytics 8.3.143, TensorRT 10.7.0 | [버전 확인](jetrover-dev-snapshot-20261123-090716/system/python-gpu.txt) |
| 장치 | DaBai 깊이 카메라, A1 라이다(`/dev/lidar`), 로봇 컨트롤러(`/dev/rrc`) | [장치 조회](jetrover-dev-snapshot-20261123-090716/system/network-devices.txt), [환경변수](jetrover-dev-snapshot-20261123-090716/ros/environment.txt) |
| RAM | 3.52 GiB 중 2.12 GiB 사용(60.4%), 사용 가능 1.16 GiB. 스왑 9.76 GiB 중 약 169 MiB 사용(1.7%) | [2026-11-23 09:52 자원 상태](jetrover-dev-snapshot-20261123-090716/system/resources-20261123-095208.txt) |
| 저장 공간 | 루트 `/`는 66G 중 58G 사용, 여유 4.5G, `df` 사용률 93%. 물리 NVMe 장치는 119.2G지만 루트 파티션은 66.7G | [2026-11-23 09:52 자원 상태](jetrover-dev-snapshot-20261123-090716/system/resources-20261123-095208.txt) |

전체 설치 목록은 [apt](jetrover-dev-snapshot-20261123-090716/system/packages-apt.txt), [pip](jetrover-dev-snapshot-20261123-090716/system/packages-pip.txt), [ROS 패키지](jetrover-dev-snapshot-20261123-090716/ros/packages.txt)에 있다. 이 목록은 버전 대조용이다. PC에 그대로 일괄 설치하는 명령은 아니다.

디스크를 차지하는 디렉터리·파일과 메모리 상위 프로세스, 디스크 전체 이미지로 받을 때의 조건은 [자원 점유 분석](RESOURCE_ANALYSIS.md)에 정리했다.

로봇 없이 코드를 작성할 때 필요한 인터페이스 패키지와 재현·자원 측정 순서는 [PC 개발 기준](OFFLINE_DEVELOPMENT.md)에 정리했다.

## 실행과 자동 시작

기본 부팅 대상은 `multi-user.target`이다. `start_app_node.service`가 켜져 있으며 `ros2 launch bringup bringup.launch.py`를 실행한다. `wifi.service`도 켜져 있다. 현재 실행 상태는 [서비스 목록](jetrover-dev-snapshot-20261123-090716/system/services-active.txt), 자동 시작 설정은 [유닛 목록](jetrover-dev-snapshot-20261123-090716/system/services-enabled.txt), 부모·자식 프로세스와 메모리 사용량은 [프로세스 목록](jetrover-dev-snapshot-20261123-090716/system/processes.txt)에 있다. [부팅 대상과 서비스 상세](jetrover-dev-snapshot-20261123-090716/system/boot-target.txt)에는 `start_app_node`의 자식 명령도 기록했다. 실제 유닛 파일은 [설정 폴더](jetrover-dev-snapshot-20261123-090716/config/etc/systemd/system)에 있다.

당시 `rosbridge_websocket`은 TCP 9090, `web_video_server`는 TCP 8080에서 대기했다. 나머지 포트와 장치 연결은 [네트워크·장치 기록](jetrover-dev-snapshot-20261123-090716/system/network-devices.txt)을 참조한다. `systemctl status`의 시작 시각이 1970년으로 보이는 것은 부팅 초기 시계 기록이다. 수집 시각은 [manifest](jetrover-dev-snapshot-20261123-090716/manifest.txt)를 기준으로 한다.

## ROS 인터페이스

호출 가능한 기능과 요청·응답 형식, 토픽·액션, 설치만 된 Nav2·역기구학은 [기능과 인터페이스 정리](INTERFACES.md)를 참조한다.

수집 시점에 노드 29개, 토픽 60개, ROS 서비스 271개, 액션 2개가 검색됐다. 서비스 수에는 각 노드의 자동 생성 파라미터 서비스가 포함된다. 원본은 [노드](jetrover-dev-snapshot-20261123-090716/ros/nodes.txt), [토픽과 타입](jetrover-dev-snapshot-20261123-090716/ros/topics.txt), [서비스와 타입](jetrover-dev-snapshot-20261123-090716/ros/services.txt), [액션과 타입](jetrover-dev-snapshot-20261123-090716/ros/actions.txt)에 있다.

| 개발에 필요한 경로 | 확인한 상태 |
| --- | --- |
| 바퀴 명령 | `/controller/cmd_vel`은 발행자 5개와 `odom_publisher` 구독자 1개. `/cmd_vel`은 발행자 0개와 같은 구독자 1개. [엔드포인트와 QoS](jetrover-dev-snapshot-20261123-090716/ros/topic-details.txt) 참조. |
| 카메라 | RGB `/depth_cam/rgb/image_raw`, 깊이 `/depth_cam/depth/image_raw`, 보정 `/depth_cam/rgb/camera_info`. RGB와 깊이 토픽의 발행 QoS는 `RELIABLE`. [카메라 정보](jetrover-dev-snapshot-20261123-090716/ros/camera-info.txt)는 640×360과 내부 행렬을 기록한다. [깊이 인코딩](jetrover-dev-snapshot-20261123-090716/ros/depth-encoding.txt)은 `16UC1`. |
| 라이다와 위치 | `/scan_raw`는 `sllidar_node`, `/scan`은 필터 노드가 발행한다. `/odom`은 `ekf_filter_node`가 발행한다. [토픽 상세](jetrover-dev-snapshot-20261123-090716/ros/topic-details.txt) 참조. |
| 팔·집게 | `/arm_controller/follow_joint_trajectory`, `/gripper_controller/follow_joint_trajectory` 액션이 존재한다. [액션 목록](jetrover-dev-snapshot-20261123-090716/ros/actions.txt) 참조. |

현재 액션 목록에는 Nav2 주행 액션이 없다. 패키지 설치 여부와 실행 여부를 구분해야 한다. 프레임 관계는 [TF 그림](jetrover-dev-snapshot-20261123-090716/ros/frames_2026-11-23_09.10.01.pdf)과 [원본 Graphviz 파일](jetrover-dev-snapshot-20261123-090716/ros/frames_2026-11-23_09.10.01.gv)에 있다. 사용자 정의 `.msg`와 `.srv` 내용은 [설정 폴더의 ROS 소스 트리](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src)에 복사했다.

## 코드 작성 시 확인할 파일

- [작업 공간과 모델 파일 목록](jetrover-dev-snapshot-20261123-090716/system/workspaces.txt): 제조사 `ros2_ws`, `third_party`와 개인 `hurwan_ws`, `jubjub_ws`의 패키지 경로. 모델 파일은 이름과 크기만 기록했다.
- [실제 bringup launch](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src/bringup/launch/bringup.launch.py): 자동 시작 노드 구성.
- [주행 보정](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src/driver/controller/config/calibrate_params.yaml), [EKF 설정](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src/driver/controller/config/ekf.yaml), [라이다 필터](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src/peripherals/config/lidar_filters_config_a1.yaml), [서보 설정](jetrover-dev-snapshot-20261123-090716/config/home/ubuntu/ros2_ws/src/driver/servo_controller/config/servo_controller.yaml).
- [실행 중 노드의 파라미터](jetrover-dev-snapshot-20261123-090716/ros/parameters.txt)와 `ros/params-*.yaml`: 파일 기본값과 실제 실행 값을 비교할 때 사용한다.

이 기록은 수집 시점의 인터페이스와 설정이다. `16UC1`의 거리 단위, 실제 바퀴 구동 결과, 센서 데이터 주기, 네트워크 단절 시 동작은 이번 수집에서 검증하지 않았다. 프로세스, 포트, 토픽 발행자는 다음 부팅이나 팀원 작업 후 달라질 수 있다.
