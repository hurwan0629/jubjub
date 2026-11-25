# jetrover 시뮬레이션 이미지
- [이미지](https://drive.google.com/drive/folders/1tD5CuBKmY62W7dzyX23-HC1CpBzeYZwH)
- [시뮬레이션 배포 이미지 아래에서 테스트할 수 있는 패키지 파일들](https://drive.google.com/drive/folders/1SsiugYT111TLhzDmZMGeMNDNiohCqvq-)
- [jetrover_description.zip | 로봇 외형, 링크, 관절 모델](https://drive.google.com/file/d/14EeY2gpbnWMhvyH23gg_6Mt7WwMQ7z8W/view)
- [robot_gazebo.zip  | Gazebo 시뮬레이션 실행 패키지](https://drive.google.com/file/d/1bjLgUojN2e67r5vVVvaZZsZFOKaSANN6/view)
- [hiwonder_moveit_config.zip | MoveIt 로봇팔 설정](https://drive.google.com/file/d/1RGCtEEE9xZ9NZWYiWJ4UIOY3Jldd7UFM/view)

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


## topic
```bash
> ros2 topic list -t
/ar_app/image_result [sensor_msgs/msg/Image]
/client_count [std_msgs/msg/Int32]
/cmd_vel [geometry_msgs/msg/Twist]
/connected_clients [rosbridge_msgs/msg/ConnectedClients]
/controller/cmd_vel [geometry_msgs/msg/Twist]
/controller_manager/joint_states [sensor_msgs/msg/JointState]
/controller_manager/servo_states [servo_controller_msgs/msg/ServoStateList]
/depth_cam/color/image_raw/theora [theora_image_transport/msg/Packet]
/depth_cam/depth/camera_info [sensor_msgs/msg/CameraInfo]
/depth_cam/depth/image_raw [sensor_msgs/msg/Image]
/depth_cam/depth/image_raw/compressed [sensor_msgs/msg/CompressedImage]
/depth_cam/depth/image_raw/compressedDepth [sensor_msgs/msg/CompressedImage]
/depth_cam/depth/image_raw/theora [theora_image_transport/msg/Packet]
/depth_cam/depth/points [sensor_msgs/msg/PointCloud2]
/depth_cam/depth_filter_status [std_msgs/msg/String]
/depth_cam/depth_to_color [orbbec_camera_msgs/msg/Extrinsics]
/depth_cam/depth_to_ir [orbbec_camera_msgs/msg/Extrinsics]
/depth_cam/ir/camera_info [sensor_msgs/msg/CameraInfo]
/depth_cam/ir/image_raw [sensor_msgs/msg/Image]
/depth_cam/ir/image_raw/compressed [sensor_msgs/msg/CompressedImage]
/depth_cam/ir/image_raw/compressedDepth [sensor_msgs/msg/CompressedImage]
/depth_cam/ir/image_raw/theora [theora_image_transport/msg/Packet]
/depth_cam/rgb/camera_info [sensor_msgs/msg/CameraInfo]
/depth_cam/rgb/image_raw [sensor_msgs/msg/Image]
/depth_cam/rgb/image_raw/compressed [sensor_msgs/msg/CompressedImage]
/depth_cam/rgb/image_raw/compressedDepth [sensor_msgs/msg/CompressedImage]
/diagnostics [diagnostic_msgs/msg/DiagnosticArray]
/hand_trajectory/image_result [sensor_msgs/msg/Image]
/hand_trajectory/points [interfaces/msg/Points]
/imu [sensor_msgs/msg/Imu]
/imu_corrected [sensor_msgs/msg/Imu]
/joint_controller [sensor_msgs/msg/JointState]
/joint_states [sensor_msgs/msg/JointState]
/line_following/image_result [sensor_msgs/msg/Image]
/object_tracking/image_result [sensor_msgs/msg/Image]
/odom [nav_msgs/msg/Odometry]
/odom_raw [nav_msgs/msg/Odometry]
/parameter_events [rcl_interfaces/msg/ParameterEvent]
/robot_description [std_msgs/msg/String]
/ros_robot_controller/battery [std_msgs/msg/UInt16]
/ros_robot_controller/bus_servo/set_position [ros_robot_controller_msgs/msg/ServosPosition]
/ros_robot_controller/bus_servo/set_state [ros_robot_controller_msgs/msg/SetBusServoState]
/ros_robot_controller/button [ros_robot_controller_msgs/msg/ButtonState]
/ros_robot_controller/enable_reception [std_msgs/msg/Bool]
/ros_robot_controller/imu_raw [sensor_msgs/msg/Imu]
/ros_robot_controller/joy [sensor_msgs/msg/Joy]
/ros_robot_controller/pwm_servo/set_state [ros_robot_controller_msgs/msg/SetPWMServoState]
/ros_robot_controller/sbus [ros_robot_controller_msgs/msg/Sbus]
/ros_robot_controller/set_buzzer [ros_robot_controller_msgs/msg/BuzzerState]
/ros_robot_controller/set_led [ros_robot_controller_msgs/msg/LedState]
/ros_robot_controller/set_motor [ros_robot_controller_msgs/msg/MotorsState]
/ros_robot_controller/set_oled [ros_robot_controller_msgs/msg/OLEDState]
/rosout [rcl_interfaces/msg/Log]
/scan [sensor_msgs/msg/LaserScan]
/scan_raw [sensor_msgs/msg/LaserScan]
/servo_controller [servo_controller_msgs/msg/ServosPosition]
/set_odom [geometry_msgs/msg/Pose2D]
/set_pose [geometry_msgs/msg/PoseWithCovarianceStamped]
/tf [tf2_msgs/msg/TFMessage]
/tf_static [tf2_msgs/msg/TFMessage]
```

## ros2 topic hz
```bash
> ros2 topic hz /depth_cam/rgb/image_raw
WARNING: topic [/depth_cam/rgb/image_raw] does not appear to be published yet
average rate: 26.131
        min: 0.006s max: 0.090s std dev: 0.01902s window: 27
average rate: 27.912
        min: 0.006s max: 0.090s std dev: 0.01362s window: 57
average rate: 28.480
        min: 0.006s max: 0.090s std dev: 0.01138s window: 87
average rate: 28.781
        min: 0.006s max: 0.090s std dev: 0.01008s window: 117
average rate: 28.748
        min: 0.006s max: 0.090s std dev: 0.00965s window: 146
average rate: 28.906
        min: 0.006s max: 0.090s std dev: 0.00898s window: 176
average rate: 29.009
        min: 0.006s max: 0.090s std dev: 0.00852s window: 206
```