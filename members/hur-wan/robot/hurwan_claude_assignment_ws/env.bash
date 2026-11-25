# Bash equivalent of ~/ros2_ws/.robotrc (no echo banner), plus this workspace overlay if built.
export LIDAR_TYPE=A1 DEPTH_CAMERA_TYPE=Dabai MACHINE_TYPE=JetRover_Mecanum ROS_DOMAIN_ID=0
export CYCLONEDDS_URI=file:///etc/cyclonedds/config.xml
export PATH="$HOME/.local/bin:$PATH"
source /opt/ros/humble/setup.bash
source $HOME/ros2_ws/install/local_setup.bash
source $HOME/third_party/third_party_ws/install/local_setup.bash
source $HOME/third_party/orbbec_ws/install/local_setup.bash
[ -f $HOME/hurwan_claude_assignment_ws/install/local_setup.bash ] && source $HOME/hurwan_claude_assignment_ws/install/local_setup.bash
export PYTHONWARNINGS=ignore
