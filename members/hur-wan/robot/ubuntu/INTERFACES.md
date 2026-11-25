# JetRover 기능과 ROS 인터페이스

2026-11-23 오전, `ubuntu@192.168.0.234`의 실행 상태와 제조사 소스를 대조했다. 아래의 **현재**는 수집 순간 ROS 그래프에서 호출 대상이 보였다는 뜻이다. 실제 구동 결과까지 확인했다는 뜻은 아니다. 전체 원본은 [스냅샷](jetrover-dev-snapshot-20261123-090716)에 있다.

## 한눈에 보기

| 기능 | 현재 상태 | 주 인터페이스 |
| --- | --- | --- |
| 바퀴 주행 | 실행 중 | `/cmd_vel`, `/controller/cmd_vel` 토픽, `geometry_msgs/msg/Twist` |
| 팔과 집게 | 실행 중 | 두 `FollowJointTrajectory` 액션, `/servo_controller` 토픽 |
| RGB·깊이·IR 카메라 | 실행 중 | 영상·깊이·포인트클라우드 토픽, `/depth_cam/*` 서비스 38개 |
| 라이다·IMU·위치 추정 | 실행 중 | `/scan_raw`, `/scan`, `/imu`, `/odom`, `/tf` 토픽 |
| 색상 물체 추적·선 따라가기 | 서비스 실행 중 | `/object_tracking/*`, `/line_following/*` |
| 라이다 회피·추종·경계 | 서비스 실행 중 | `/lidar_app/*` |
| 손동작·손 궤적·AR | 서비스 실행 중 | `/hand_gesture/*`, `/hand_trajectory/*`, `/ar_app/*` |
| 웹 연동 | 실행 중 | ROSBridge WebSocket TCP 9090, 영상 서버 TCP 8080, `/rosapi/*` 서비스 |
| Nav2 목적지 주행 | 설치·launch 파일 확인, 현재 미실행 | 설치된 `nav2_msgs/action/*`; 현재 Nav2 액션 서버 없음 |
| 팔 역기구학 | 패키지·launch 파일 확인, 현재 미실행 | 설치된 `kinematics_msgs/srv/*`; 현재 해당 서비스 없음 |

현재 ROS 그래프는 **노드 29개, 토픽 60개, 서비스 271개, 액션 2개**다. 서비스 271개 중 156개는 ROS가 노드마다 만드는 파라미터 관리 서비스다. 나머지 115개를 [기능별 서비스 원본](jetrover-dev-snapshot-20261123-090716/ros/functional-services.txt)에 모았다. 개별 타입의 중첩 필드까지 [현재 인터페이스 정의](jetrover-dev-snapshot-20261123-090716/ros/interface-definitions.txt)에서 볼 수 있다.

## 현재 호출 가능한 서비스

| 대상 | 서비스와 할 수 있는 일 | 요청·응답 형식 |
| --- | --- | --- |
| 깊이 카메라 | `/depth_cam/get_device_info`, `get_sdk_version`, 노출·게인·화이트밸런스·LDP 상태 조회. `set_*`, `toggle_*`, `switch_ir`로 영상·노출·레이저·팬 설정. `save_images`, `save_point_cloud`, `reboot_device`도 존재 | `GetDeviceInfo`: 빈 요청 → 장치 정보·`success`·`message`. `GetInt32`/`GetBool`/`GetString`: 빈 요청 → `data`·`success`·`message`. `SetInt32`/`SetString`/`SetBool`: `data` → `success`·`message`. 저장·재부팅은 `Empty` |
| 로봇 컨트롤러 | `/ros_robot_controller/bus_servo/get_state`, `pwm_servo/get_state`로 서보 상태 조회 | `GetBusServoState`: `GetBusServoCmd[] cmd` → `success`, `BusServoState[] state`. 명령에 ID와 위치·전압·온도 등의 조회 플래그를 넣는다. PWM도 대응 구조 |
| 주행 보정·위치 추정 | `/controller/load_calibrate_param`으로 보정값 다시 읽기. `/set_pose`, `/toggle`은 위치 추정 필터 제어 | `Trigger`, `robot_localization/srv/SetPose` (`PoseWithCovarianceStamped pose`), `ToggleFilterProcessing` (`bool on` → `bool status`) |
| 라이다 하드웨어 | `/start_motor`, `/stop_motor` | 둘 다 `std_srvs/srv/Empty`. **바퀴 모터가 아니라 `sllidar_node`의 라이다 회전 모터** |
| 색상 물체 추적 | `/object_tracking/enter`, `exit`, `set_running`, `set_color`, `set_target_color`, `get_target_color`, `set_threshold` | `Trigger`, `SetBool`, `SetString`, `SetPoint`, `SetFloat64` 사용. `get_target_color`는 `Trigger.message`에 RGB CSV를 담을 수 있음 |
| 선 따라가기 | `/line_following/enter`, `exit`, `set_running`, `set_color`, `set_target_color`, `get_target_color`, `set_threshold` | 위와 동일. 카메라와 라이다 입력 사용 |
| 라이다 앱 | `/lidar_app/enter`, `exit`, `set_running`, `set_param` | `set_running`: `SetInt64.data` = 0 끄기, 1 회피, 2 추종, 3 경계. `set_param`: `SetFloat64List.data` = `[거리 임계값(0.3~1.5), 스캔 각도(0~90도), 양수 속도]` |
| 손동작·궤적 | `/hand_gesture/enter`, `exit`, `set_running`; `/hand_trajectory/enter`, `exit`, `start`, `stop` | `Trigger` 또는 `SetBool`. 카메라 입력과 팔 동작을 사용 |
| AR 화면 | `/ar_app/enter`, `exit`, `set_model` | `set_model`: `SetString.data`에 모델 이름. 카메라 영상에 모델을 합성 |
| ROS 그래프 조회 | `/rosapi/nodes`, `topics`, `services`, `service_type`, `publishers`, `subscribers`, `message_details`, `action_servers` 등 25개 | 각 `rosapi_msgs/srv/*`. 전체 목록과 정의는 원본 파일 참조 |
| 준비 상태·연결 유지 | 여러 노드의 `/init_finish`, `/heartbeat` | 주로 `Trigger`, `SetBool`; 제조사 앱 내부 제어용 |

`enter`, `set_running`, `start`, 서보 명령, 카메라 `set_*`/`reboot_device`는 상태를 바꾸거나 로봇을 움직일 수 있다. 위 표의 “호출 가능”은 엔드포인트 확인 결과이며 이런 명령을 직접 실행한 결과는 아니다. 읽기 전용으로 `/depth_cam/get_sdk_version`을 실제 호출했으며 `success=True`, Orbbec SDK `1.10.22`, ROS SDK `1.5.12`를 확인했다.

### 자주 쓰는 요청 형식

| 타입 | 요청 | 응답 |
| --- | --- | --- |
| `std_srvs/srv/Trigger` | 빈 요청 | `bool success`, `string message` |
| `std_srvs/srv/SetBool` | `bool data` | `bool success`, `string message` |
| `std_srvs/srv/Empty` | 빈 요청 | 빈 응답 |
| `interfaces/srv/SetString` | `string data` | `bool success`, `string message` |
| `interfaces/srv/SetPoint` | `geometry_msgs/Point data` (`x`,`y`,`z`) | `bool success`, `string message` |
| `interfaces/srv/SetFloat64`, `SetInt64` | 각각 `float64 data`, `int64 data` | `bool success`, `string message` |
| `interfaces/srv/SetFloat64List` | `float64[] data` | `bool success`, `string message` |

예를 들어 로봇에서 읽기 전용 확인은 `ros2 service call /depth_cam/get_sdk_version orbbec_camera_msgs/srv/GetString '{}'`로 할 수 있다. 호출 전에는 `ros2 service type <서비스명>`, `ros2 interface show <타입>`으로 실행 중인 타입을 다시 확인한다.

## 토픽과 액션

| 경로 | 타입 | 용도 |
| --- | --- | --- |
| `/cmd_vel`, `/controller/cmd_vel` | `geometry_msgs/msg/Twist` | 바퀴 속도 명령. `linear`·`angular` 벡터를 사용하며 `odom_publisher`가 구독. 수집 당시 `/controller/cmd_vel` 발행자 5개, `/cmd_vel` 발행자 0개 |
| `/odom`, `/odom_raw`, `/tf`, `/tf_static` | `Odometry`, `TFMessage` | 위치 추정과 좌표계 |
| `/scan_raw`, `/scan` | `sensor_msgs/msg/LaserScan` | 라이다 원본과 필터 결과 |
| `/imu`, `/imu_corrected`, `/ros_robot_controller/imu_raw` | `sensor_msgs/msg/Imu` | 관성 센서 |
| `/depth_cam/rgb/image_raw`, `/depth_cam/depth/image_raw`, `/depth_cam/ir/image_raw` | `sensor_msgs/msg/Image` | RGB·깊이·IR 영상. 깊이 인코딩은 수집 당시 `16UC1` |
| `/depth_cam/rgb/camera_info`, `/depth_cam/depth/camera_info`, `/depth_cam/depth/points` | `CameraInfo`, `PointCloud2` | 보정값·포인트클라우드 |
| `/ros_robot_controller/battery`, `/ros_robot_controller/button`, `/ros_robot_controller/joy` | `UInt16`, `ButtonState`, `Joy` | 배터리·버튼·조이스틱 |
| `/servo_controller`, `/ros_robot_controller/bus_servo/set_position`, `/ros_robot_controller/set_motor` | `servo_controller_msgs/msg/ServosPosition`, `ros_robot_controller_msgs/msg/ServosPosition`, `MotorsState` | 팔·서보·모터 직접 명령 |
| `/object_tracking/image_result`, `/line_following/image_result`, `/hand_trajectory/image_result`, `/hand_trajectory/points`, `/ar_app/image_result` | `Image` 또는 `interfaces/msg/Points` | 앱의 영상 결과와 손 궤적 |

현재 액션은 `/arm_controller/follow_joint_trajectory`, `/gripper_controller/follow_joint_trajectory` 두 개다. 둘 다 `control_msgs/action/FollowJointTrajectory`를 사용한다. 목표는 `trajectory.joint_names`, `trajectory.points`(위치와 `time_from_start`) 및 허용 오차를 담고, 결과는 `error_code`·`error_string`, 피드백은 desired/actual/error 상태를 담는다. 팔 관절 이름은 `joint1`~`joint5`, 집게는 `r_joint`로 설정돼 있다. 전체 토픽은 [타입 목록](jetrover-dev-snapshot-20261123-090716/ros/topics.txt), 액션은 [타입 목록](jetrover-dev-snapshot-20261123-090716/ros/actions.txt), QoS와 발행·구독 상태는 [토픽 상세](jetrover-dev-snapshot-20261123-090716/ros/topic-details.txt)에 있다.

## 설치됐지만 현재 제공되지 않는 기능

**Nav2:** 관련 패키지와 [제조사 navigation.launch.py](jetrover-dev-snapshot-20261123-090716/source/home/ubuntu/ros2_ws/src/navigation/launch/navigation.launch.py)가 있다. 현재 ROS 그래프에 Nav2 노드나 `NavigateToPose` 액션 서버는 없다. launch는 planner, controller, smoother, behavior, BT navigator, waypoint follower 등을 띄우도록 구성돼 있다. 설치된 정의에는 `NavigateToPose`(목표 `PoseStamped pose`, 선택 `behavior_tree`; 피드백 현재 위치·남은 거리·시간), `NavigateThroughPoses`, `FollowWaypoints`, `ComputePathToPose`, `FollowPath`가 있다. 따라서 **지금 곧바로 Nav2 목적지를 보낼 수는 없다**. 시작 시 기존 bringup과 중복되는 노드가 없는지 확인해야 한다.

**팔 역기구학:** `kinematics_msgs`와 launch 파일이 있지만 현재 `/kinematics/*` 서비스는 없다. [제조사 노드 소스](jetrover-dev-snapshot-20261123-090716/source/home/ubuntu/ros2_ws/src/driver/kinematics/kinematics/search_kinematics_solutions_node.py)는 `set_pose_target`, `get_current_pose`, `set_joint_value_target`, 링크 길이·관절 범위 조회/설정을 제공한다. `SetRobotPose` 요청은 `position[]`, `pitch`, `pitch_range[]`, `resolution`; 응답은 `success`, `pulse[]`, `current_pulse[]`, `rpy[]`, `min_variation`이다. 제조사 구현은 해가 없어도 `success=true`가 될 수 있으므로 `pulse[]`가 비었는지도 확인해야 한다. 전체 설치 전용 형식은 [인터페이스 정의](jetrover-dev-snapshot-20261123-090716/ros/installed-interface-definitions.txt)에 있다.

## 구현상 주의할 점

- `/lidar_app/set_param`은 **정확히 3개** 값을 순서대로 보내야 한다. 구현에서 길이를 검사하지 않고 배열을 풀며, 유효한 값을 적용한 뒤에도 `response.success`를 `true`로 설정하지 않는다. [구현](jetrover-dev-snapshot-20261123-090716/source/home/ubuntu/ros2_ws/src/app/app/lidar_controller.py) 참조.
- 제조사 앱의 `/enter`도 카메라 구독만 준비하는 가벼운 조회가 아니다. 물체 추적·선 따라가기·라이다 앱은 팔을 카메라 자세로 옮기는 코드가 있다.
- ROS 서비스와 systemd 서비스는 별개다. 자동 시작은 `start_app_node.service`가 `bringup.launch.py`를 실행한다. 전체 부팅·프로세스 정보는 [README](README.md)에 있다.
- 이름만으로 제공 기능을 판단하지 않았다. `/start_motor`는 라이다 모터이고, `/set_pose` 서비스는 위치 추정 필터의 자세 초기화다.
- 현재 서비스에서 사용하는 85개 타입의 정의와 설치 전용 12개 타입의 정의를 보관했다. 실제 호출 성공, 카메라 스트림 설정의 지속성, 물리 동작 안전성은 별도 검증이 필요하다.
