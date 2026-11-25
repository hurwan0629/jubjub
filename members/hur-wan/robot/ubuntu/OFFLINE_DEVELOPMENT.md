# 로봇 없이 JetRover 코드를 개발하기 위한 기준

목표는 **PC에서 타입과 연결 흐름을 재현하고, 실제 Jetson에서만 확인 가능한 동작·자원 한계를 분리해 검증하는 것**이다. 2026-11-23에 수집한 [환경](README.md), [현재 인터페이스](INTERFACES.md), [자원 점유](RESOURCE_ANALYSIS.md)가 기본 부팅 상태의 기준이다.

## 지금 확보한 것과 아직 모르는 것

| 구분 | 확보한 근거 | 로봇 없이 개발하려면 추가로 필요한 것 |
| --- | --- | --- |
| 버전·빌드 | Ubuntu 22.04.5, ROS 2 Humble, Python 3.10, 실제 RMW `rmw_fastrtps_cpp`, CUDA/TensorRT 버전, apt/pip 목록 | PC 코드와 로봇 배포 코드의 동일한 Git revision·의존성 잠금. Jetson 전용 바이너리는 별도 빌드/실기 검증 |
| ROS 계약 | 기본 부팅 노드 29개, 토픽 60개, 서비스 271개, 액션 2개; 타입 정의 85종과 설치 전용 12종; 일부 QoS·파라미터·TF | **기능별** 서비스 소유 노드, 선행 launch, 실제 요청·응답 예, 오류·타임아웃·취소 동작, 모든 핵심 토픽의 QoS·주기·프레임 |
| 타입 빌드 소스 | [사용자 정의 인터페이스 패키지 7개](jetrover-dev-snapshot-20261123-090716/interface-packages)에 `.msg`·`.srv`, `package.xml`, `CMakeLists.txt` 보관 | PC의 ROS 2 Humble 작업공간 `src`에 필요한 패키지를 넣어 빌드·import 확인. 배포판 패키지 의존성도 맞추기 |
| 실행 환경 | `start_app_node.service`의 기본 bringup, 프로세스·포트·장치·설정 스냅샷 | Nav2·SLAM·AI·사용자 코드 조합별 실제 그래프와 기동 순서. 설치된 패키지를 실행 중인 서비스로 간주하지 않기 |
| 자원 | 기본 상태 RAM 3.52 GiB 중 약 2.12 GiB 사용, 사용 가능 약 1.16 GiB; 주요 프로세스 PSS 한 시점 | 각 기능을 **동시에** 켰을 때의 지속·최대 메모리, zram 증가, CPU/GPU/온도, 지연·토픽 처리율, 종료 후 회복 여부 |
| 재현 입력 | 카메라 정보·깊이 인코딩 등 일부 표본 | 대표 장면의 RGB·깊이·라이다·IMU·odom·TF bag와 필요한 파라미터·맵·URDF·보정값 |

제조사 `ros2_ws`는 기록 당시 commit `68c43a2093065800b63908683cf647ef9c151688`, Orbbec ROS 소스는 `863fb0025ba587a39f4a2c709c8999f353f065f0`였다. Orbbec 설정 파일에는 로컬 수정이 있다. 로봇의 `jubjub_ws`와 `hurwan_ws`는 Git checkout으로 인식되지 않아, PC 저장소와의 코드 일치 여부를 따로 확인해야 한다. [Git 상태 원본](jetrover-dev-snapshot-20261123-090716/system/revisions.txt) 참조.

## PC 개발 순서

1. **타입을 먼저 빌드한다.** PC의 Ubuntu 22.04/ROS 2 Humble 작업공간에 필요한 [인터페이스 패키지](jetrover-dev-snapshot-20261123-090716/interface-packages)를 넣는다. 서비스·토픽·액션 이름과 요청·응답 필드는 [현재 인터페이스 정의](jetrover-dev-snapshot-20261123-090716/ros/interface-definitions.txt)를 기준으로 한다. `ros2 service type`, `ros2 interface show`, `ros2 topic info -v`로 실기 연결 시 대조한다.
2. **센서 입력을 재생한다.** 대표 장면을 선택해 카메라·라이다·IMU·odom·TF를 `ros2 bag`으로 녹화하고 PC에서 재생한다. 이미지·포인트클라우드는 데이터가 커서 필요한 토픽과 구간만 선택하며, 로봇의 루트 여유 공간 4.5G를 고려해 PC나 외부 저장장치에 기록한다. bag은 녹화된 토픽 입력을 재생한다. 서비스와 액션 서버의 응답은 별도 스텁으로 제공한다. [ROS 2 Humble의 bag 설명](https://github.com/ros2/ros2_documentation/blob/humble/source/Tutorials/Beginner-CLI-Tools/Recording-And-Playing-Back-Data/Recording-And-Playing-Back-Data.rst) 참조.
3. **작은 스텁으로 경계 조건을 확인한다.** 예를 들어 카메라 조회 서비스의 정상·실패·타임아웃, 팔 액션의 목표 수락·피드백·취소, Nav2 서버 부재를 재현한다. `lidar_app/set_param`의 응답과 IK `success`/빈 `pulse`처럼 제조사 구현의 예외도 반영한다. PC 테스트에서 로봇을 움직이는 토픽을 실기 네트워크로 보내지 않도록 도메인/네트워크를 분리한다.
4. **실기에서 계약을 대조한다.** 로봇에 접속할 때 타입뿐 아니라 발행·구독 QoS, 프레임 이름, 파라미터, 선행 서비스 준비 상태를 비교한다. QoS가 맞지 않으면 이름과 타입이 같아도 메시지가 전달되지 않을 수 있다. [ROS 2 Humble QoS 설명](https://github.com/ros2/ros2_documentation/blob/humble/source/Concepts/Intermediate/About-Quality-of-Service-Settings.rst) 참조.

## 자원 한계를 알아내는 측정 순서

**프로세스 개수만으로 한계를 판단하지 않는다.** ROS 노드 수와 OS 프로세스 수는 같지 않고, 모델 로딩·카메라 스트림·GPU 작업에 따라 메모리 피크가 달라진다. 현재 사용 가능 RAM 1.16 GiB를 신규 프로세스에 그대로 할당 가능한 예산으로 취급하지 않는다.

| 시나리오 | 확인할 것 |
| --- | --- |
| 기본 부팅 | `start_app_node.service` 기동 후 안정 상태의 그래프·RAM/PSS·swap·CPU/GPU·온도 |
| 사용자 인식 코드 | 실제 카메라/라이다 입력을 처리하는 동안의 모델 로딩 피크, 프레임 처리율·지연, 메모리 회복 |
| Nav2 또는 SLAM | 필요한 launch와 맵을 사용했을 때 새 노드·서비스·액션, 메모리와 주행 관련 처리율 |
| 동시 실행 | 실제 목표 조합(예: 인식 + Nav2 + 팔 제어)의 지속 사용량, 최고치, zram 증가·OOM·열 제한 |

각 시나리오마다 **시작 전 → 시작 직후 → 실제 입력을 처리하는 동안 → 종료 후**를 같은 조건에서 기록한다. `MemAvailable`, zram/디스크 swap, 프로세스별 PSS, 서비스·토픽·액션 목록, `ros2 topic hz/bw`, 로그와 OOM 여부를 함께 본다. Jetson의 `tegrastats`는 RAM·swap·CPU·GPU·온도 등 시계열을 제공한다([NVIDIA 설명](https://docs.nvidia.com/jetson/archives/r35.2.1/DeveloperGuide/text/AT/JetsonLinuxDevelopmentTools/TegrastatsUtility.html)). 합격 기준은 필요한 처리율·지연을 유지하며 메모리/스왑이 계속 증가하지 않고 여유를 남기는지로 정한다.

현재 기록으로 확정할 수 있는 것은 **기본 부팅 상태의 제공 인터페이스와 한 시점의 자원 사용량**까지다. Nav2·SLAM·추론·사용자 코드의 동시 실행 가능 규모는 그 조합을 실제로 띄워 측정해야 한다.
