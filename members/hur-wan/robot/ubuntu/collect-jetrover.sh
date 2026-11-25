#!/usr/bin/env bash
# Read-only JetRover development environment snapshot.
set -u
umask 077
if ! command -v ros2 >/dev/null 2>&1; then
	for setup in /opt/ros/humble/setup.bash /home/ubuntu/third_party/orbbec_ws/install/local_setup.bash /home/ubuntu/third_party/third_party_ws/install/local_setup.bash /home/ubuntu/ros2_ws/install/local_setup.bash; do
		[ ! -r "$setup" ] || . "$setup"
	done
fi
if ! command -v ros2 >/dev/null 2>&1; then
	printf 'ROS 2 environment unavailable\n' >&2
	exit 2
fi
out="/tmp/jetrover-dev-snapshot-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"/{system,ros,config,source,interface-packages}

run() {
	local file="$1"
	shift
	timeout 45 "$@" > "$out/$file" 2>&1
	local status=$?
	if [ "$status" -ne 0 ]; then
		printf '\n[command exit: %s]\n' "$status" >> "$out/$file"
	fi
}

run system/platform.txt bash -c 'date -Is; hostname; uname -a; cat /etc/os-release; cat /etc/nv_tegra_release; cat /proc/device-tree/model; printf "\nDISKS\n"; lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS,MODEL; df -h; free -h; printf "\nNVIDIA\n"; command -v nvcc && nvcc --version; nvpmodel -q; python3 --version'
run system/packages-apt.txt dpkg-query -W -f='${binary:Package}\t${Version}\n'
run system/packages-pip.txt python3 -m pip list --format=freeze
run system/python-gpu.txt python3 -c 'import importlib; import sys; print("python:", sys.version); print("executable:", sys.executable); modules=("torch","torchvision","ultralytics","tensorrt","onnx","cv2","numpy","rclpy"); [(lambda m: print(m, getattr(importlib.import_module(m), "__version__", "installed")) if importlib.util.find_spec(m) else print(m, "absent"))(m) for m in modules]; import torch; print("cuda_available:", torch.cuda.is_available()); print("cuda_runtime:", torch.version.cuda)'
run system/network-devices.txt bash -c 'ip -br addr; printf "\nUSB\n"; lsusb; printf "\nDEVICE LINKS\n"; ls -l /dev/rrc /dev/lidar /dev/ttyACM* /dev/ttyUSB* 2>&1; printf "\nLISTENERS\n"; ss -lntup 2>&1'
run system/processes.txt ps -eo pid,ppid,user,comm,rss,etime --sort=ppid,pid
run system/services-active.txt systemctl list-units --type=service --state=running --all --no-pager --plain
run system/services-enabled.txt systemctl list-unit-files --type=service --no-pager --plain
run system/boot-target.txt bash -c 'systemctl get-default; systemctl status start_app_node wifi --no-pager --lines=0 2>&1; systemctl show start_app_node -p FragmentPath -p DropInPaths -p ExecStart -p Restart -p WantedBy -p After --no-pager'
run system/workspaces.txt bash -c 'for d in /home/ubuntu/ros2_ws /home/ubuntu/third_party /home/ubuntu/hurwan_ws /home/ubuntu/jubjub_ws; do echo "===== $d"; [ -d "$d" ] || continue; find "$d/src" -maxdepth 5 -name package.xml -print 2>/dev/null; git -C "$d" status --short --branch 2>/dev/null || true; done; printf "\nMODELS\n"; find /home/ubuntu/hurwan_ws/models -maxdepth 1 -type f -printf "%f %s bytes\n" 2>/dev/null'
run system/revisions.txt bash -c 'for d in /home/ubuntu/ros2_ws /home/ubuntu/third_party/orbbec_ws/src/OrbbecSDK_ROS2 /home/ubuntu/hurwan_ws/src/hurwan_robot /home/ubuntu/jubjub_ws/src/jubjub_robot; do printf "===== %s\n" "$d"; git -C "$d" rev-parse --show-toplevel HEAD 2>&1; git -C "$d" status --short 2>&1 | head -n 12; done'
run ros/environment.txt bash -c 'env | LC_ALL=C sort | grep -E "^(AMENT_PREFIX_PATH|COLCON_PREFIX_PATH|CYCLONEDDS_URI|DEPTH_CAMERA_TYPE|LIDAR_TYPE|MACHINE_TYPE|RMW_IMPLEMENTATION|ROS_DISTRO|ROS_DOMAIN_ID|ROS_LOCALHOST_ONLY|ROS_PACKAGE_PATH|ROS_VERSION)=" || true'
run ros/rmw.txt python3 -c 'import rclpy; print(rclpy.get_rmw_implementation_identifier())'
run ros/packages.txt ros2 pkg list
run ros/nodes.txt ros2 node list
run ros/topics.txt ros2 topic list -t
run ros/services.txt ros2 service list -t
grep -Ev '/(describe_parameters|get_parameter_types|get_parameters|list_parameters|set_parameters|set_parameters_atomically) \[' "$out/ros/services.txt" > "$out/ros/functional-services.txt"
run ros/actions.txt ros2 action list -t
run ros/parameters.txt ros2 param list
run ros/topic-details.txt bash -c 'for t in /controller/cmd_vel /cmd_vel /odom /scan /scan_raw /depth_cam/rgb/image_raw /depth_cam/depth/image_raw /depth_cam/rgb/camera_info /joint_states /ros_robot_controller/battery /servo_controller; do echo "===== $t"; timeout 8 ros2 topic info -v "$t" 2>&1; done'
run ros/node-details.txt bash -c 'for n in /odom_publisher /depth_cam/depth_cam /ros_robot_controller /ekf_filter_node /rosbridge_websocket /sllidar_node; do echo "===== $n"; timeout 8 ros2 node info "$n" 2>&1; done'
run ros/camera-info.txt ros2 topic echo --once /depth_cam/rgb/camera_info
run ros/depth-encoding.txt bash -c 'timeout 8 ros2 topic echo --once --field encoding /depth_cam/depth/image_raw'
run ros/battery.txt bash -c 'timeout 8 ros2 topic echo --once /ros_robot_controller/battery'
for node in odom_publisher ekf_filter_node sllidar_node; do
	run "ros/params-$node.yaml" ros2 param dump "/$node"
done
run ros/params-camera.yaml ros2 param dump /depth_cam/depth_cam
run ros/interfaces-custom.txt bash -c 'find /home/ubuntu/ros2_ws/src /home/ubuntu/hurwan_ws/src /home/ubuntu/jubjub_ws/src -type f \( -name "*.msg" -o -name "*.srv" -o -name "*.action" \) -print 2>/dev/null'
run ros/launch-files.txt bash -c 'find /home/ubuntu/ros2_ws/src/navigation /home/ubuntu/ros2_ws/src/slam /home/ubuntu/ros2_ws/src/bringup /home/ubuntu/ros2_ws/src/driver/kinematics -type f -name "*.launch.py" -print 2>/dev/null'
run ros/service-implementations.txt bash -c 'grep -RnsE "create_service\(" /home/ubuntu/ros2_ws/src/app /home/ubuntu/ros2_ws/src/driver /home/ubuntu/ros2_ws/src/bringup /home/ubuntu/ros2_ws/src/peripherals 2>/dev/null'
sed -n 's/.*\[\([^]]*\)\]$/\1/p' "$out/ros/topics.txt" "$out/ros/services.txt" "$out/ros/actions.txt" | sort -u | while IFS= read -r type; do
	printf '===== %s\n' "$type"
	timeout 8 ros2 interface show "$type" 2>&1 || printf '[interface lookup failed: %s]\n' "$type"
done > "$out/ros/interface-definitions.txt"
for type in \
	kinematics_msgs/srv/SetRobotPose \
	kinematics_msgs/srv/GetRobotPose \
	kinematics_msgs/srv/SetJointValue \
	kinematics_msgs/srv/SetLink \
	kinematics_msgs/srv/GetLink \
	kinematics_msgs/srv/SetJointRange \
	kinematics_msgs/srv/GetJointRange \
	nav2_msgs/action/NavigateToPose \
	nav2_msgs/action/NavigateThroughPoses \
	nav2_msgs/action/FollowWaypoints \
	nav2_msgs/action/ComputePathToPose \
	nav2_msgs/action/FollowPath
do
	printf '===== %s\n' "$type"
	timeout 8 ros2 interface show "$type" 2>&1 || printf '[interface lookup failed: %s]\n' "$type"
done > "$out/ros/installed-interface-definitions.txt"
run ros/frames.txt bash -c 'cd "$1"; timeout 15 ros2 run tf2_tools view_frames 2>&1; find . -maxdepth 1 \( -name "frames*.pdf" -o -name "frames*.gv" \) -print' _ "$out/ros"

for path in \
	/etc/cyclonedds/config.xml \
	/etc/systemd/system/start_app_node.service \
	/etc/systemd/system/wifi.service \
	/etc/systemd/system/button_scan.service \
	/etc/systemd/system/find_device.service \
	/etc/systemd/system/remote.service \
	/home/ubuntu/ros2_ws/src/bringup/launch/bringup.launch.py \
	/home/ubuntu/ros2_ws/src/driver/controller/config/calibrate_params.yaml \
	/home/ubuntu/ros2_ws/src/driver/controller/config/ekf.yaml \
	/home/ubuntu/ros2_ws/src/peripherals/config/lidar_filters_config_a1.yaml \
	/home/ubuntu/ros2_ws/src/driver/servo_controller/config/servo_controller.yaml
do
	if [ -r "$path" ]; then
		(cd / && cp --parents "${path#/}" "$out/config")
	fi
done
find /etc/udev/rules.d -maxdepth 1 -type f -exec grep -liE 'lidar|rrc|ttyUSB|ttyACM' {} + 2>/dev/null | while IFS= read -r path; do
	(cd / && cp --parents "${path#/}" "$out/config")
done
find /home/ubuntu/ros2_ws/src /home/ubuntu/hurwan_ws/src /home/ubuntu/jubjub_ws/src -type f \( -name '*.msg' -o -name '*.srv' -o -name '*.action' \) -print0 2>/dev/null | while IFS= read -r -d '' path; do
	(cd / && cp --parents "${path#/}" "$out/config")
done
for path in \
	/home/ubuntu/ros2_ws/src/interfaces \
	/home/ubuntu/ros2_ws/src/driver/ros_robot_controller_msgs \
	/home/ubuntu/ros2_ws/src/driver/servo_controller_msgs \
	/home/ubuntu/ros2_ws/src/driver/kinematics_msgs \
	/home/ubuntu/ros2_ws/src/large_models/large_models_msgs \
	/home/ubuntu/ros2_ws/src/xf_mic_asr_offline_msgs \
	/home/ubuntu/third_party/orbbec_ws/src/OrbbecSDK_ROS2/orbbec_camera_msgs
do
	if [ -d "$path" ]; then
		(cd / && cp -a --parents "${path#/}" "$out/interface-packages")
	fi
done
for path in \
	/home/ubuntu/ros2_ws/src/app/app/object_tracking.py \
	/home/ubuntu/ros2_ws/src/app/app/line_following.py \
	/home/ubuntu/ros2_ws/src/app/app/lidar_controller.py \
	/home/ubuntu/ros2_ws/src/app/app/ar_app.py \
	/home/ubuntu/ros2_ws/src/app/app/hand_gesture.py \
	/home/ubuntu/ros2_ws/src/app/app/hand_trajectory_node.py \
	/home/ubuntu/ros2_ws/src/driver/controller/controller/odom_publisher_node.py \
	/home/ubuntu/ros2_ws/src/driver/ros_robot_controller/ros_robot_controller/ros_robot_controller_node.py \
	/home/ubuntu/ros2_ws/src/driver/kinematics/kinematics/search_kinematics_solutions_node.py \
	/home/ubuntu/ros2_ws/src/driver/servo_controller/servo_controller/joint_trajectory_action_controller.py \
	/home/ubuntu/ros2_ws/src/navigation/launch/navigation.launch.py \
	/home/ubuntu/ros2_ws/src/navigation/launch/include/navigation_base.launch.py \
	/home/ubuntu/ros2_ws/src/slam/launch/slam.launch.py
do
	if [ -r "$path" ]; then
		(cd / && cp --parents "${path#/}" "$out/source")
	fi
done

printf 'captured_at=%s\nhost=%s\n' "$(date -Is)" "$(hostname)" > "$out/manifest.txt"
printf 'file_count=%s\n' "$(find "$out" -type f | wc -l)" >> "$out/manifest.txt"
tar -C /tmp -czf "$out.tar.gz" "${out##*/}"
printf '%s\n' "$out.tar.gz"
