cmake_minimum_required(VERSION 3.8)
project(jubjub_claude_interfaces)
find_package(ament_cmake REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(builtin_interfaces REQUIRED)
find_package(std_msgs REQUIRED)
find_package(geometry_msgs REQUIRED)
find_package(sensor_msgs REQUIRED)
find_package(nav_msgs REQUIRED)
find_package(trajectory_msgs REQUIRED)
rosidl_generate_interfaces(${PROJECT_NAME}
  "msg/TrashDetection.msg"
  "msg/TrashDetectionArray.msg"
  "msg/TrashTrack.msg"
  "msg/TrashTrackArray.msg"
  "msg/RobotStatus.msg"
  "msg/RobotEvent.msg"
  "srv/PatrolCommand.srv"
  "srv/ComputeArmIK.srv"
  "srv/GeoToMap.srv"
  "srv/MapToGeo.srv"
  "srv/PlanPath.srv"
  "action/NavigateTo.action"
  "action/PickAndStore.action"
  DEPENDENCIES builtin_interfaces std_msgs geometry_msgs sensor_msgs nav_msgs trajectory_msgs
)
ament_export_dependencies(rosidl_default_runtime)
ament_package()
