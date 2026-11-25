"""Whole JUBJUB pipeline in sandbox mode (no wheel/arm actuation).

ros2 launch jubjub_claude jubjub_sandbox.launch.py \
    use_detector:=true use_synthetic:=false use_fake_gps:=false \
    server_url:=ws://127.0.0.1:8765/ws/robots robot_id:=1 token:=test-token
"""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration as LC
from launch_ros.actions import Node


def generate_launch_description():
    share = get_package_share_directory('jubjub_claude')
    cfg = os.path.join(share, 'config', 'jubjub.yaml')

    def node(exe, name, cond=None, extra=None):
        return Node(package='jubjub_claude', executable=exe, name=name, output='screen',
                    parameters=[cfg, LC('overrides')] + ([extra] if extra else []),
                    condition=IfCondition(cond) if cond is not None else None)

    return LaunchDescription([
        DeclareLaunchArgument('overrides', default_value=cfg,
                              description='extra params yaml applied after config/jubjub.yaml'),
        DeclareLaunchArgument('use_nav2', default_value='true'),
        DeclareLaunchArgument('use_depth_obstacles', default_value='false'),
        DeclareLaunchArgument('use_detector', default_value='true'),
        DeclareLaunchArgument('use_synthetic', default_value='false'),
        DeclareLaunchArgument('use_fake_gps', default_value='false'),
        DeclareLaunchArgument('use_bridge', default_value='true'),
        DeclareLaunchArgument('server_url', default_value='ws://127.0.0.1:8765/ws/robots'),
        DeclareLaunchArgument('robot_id', default_value='1'),
        DeclareLaunchArgument('token', default_value=''),
        IncludeLaunchDescription(
            PythonLaunchDescriptionSource(os.path.join(share, 'launch', 'nav2_sandbox.launch.py')),
            launch_arguments={'use_depth_obstacles': LC('use_depth_obstacles')}.items(),
            condition=IfCondition(LC('use_nav2'))),
        node('sandbox_guard', 'claude_sandbox_guard'),
        node('nav_adapter', 'claude_nav_adapter'),
        node('arm_ik', 'claude_arm_ik'),
        node('geo_localizer', 'claude_geo_localizer'),
        node('trash_tracker', 'claude_trash_tracker'),
        node('jubjub_manager', 'claude_jubjub_manager'),
        node('trash_detector', 'claude_trash_detector', LC('use_detector')),
        node('synthetic_detections', 'claude_synthetic_detections', LC('use_synthetic')),
        node('fake_gps', 'claude_fake_gps', LC('use_fake_gps')),
        node('server_bridge', 'claude_server_bridge', LC('use_bridge'),
             {'server_url': LC('server_url'), 'robot_id': LC('robot_id'), 'token': LC('token')}),
    ])
