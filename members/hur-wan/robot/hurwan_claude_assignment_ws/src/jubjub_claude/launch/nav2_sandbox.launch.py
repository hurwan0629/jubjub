"""Nav2 planner_server only (+ lifecycle manager). No controller/behavior servers are started,
so no Nav2 node can publish a velocity command. use_depth_obstacles:=true adds the depth
point cloud to the costmap (more CPU)."""
import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, OpaqueFunction
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node
from nav2_common.launch import RewrittenYaml


def setup(context):
    share = get_package_share_directory('jubjub_claude')
    sources = 'scan depth' if LaunchConfiguration('use_depth_obstacles').perform(context) == 'true' else 'scan'
    params = RewrittenYaml(source_file=os.path.join(share, 'config', 'nav2_planner_sandbox.yaml'),
                           param_rewrites={'observation_sources': sources}, convert_types=True)
    return [
        Node(package='nav2_planner', executable='planner_server', name='planner_server', output='screen',
             parameters=[params]),
        Node(package='nav2_lifecycle_manager', executable='lifecycle_manager', name='lifecycle_manager_claude_nav',
             output='screen',
             parameters=[{'autostart': True, 'node_names': ['planner_server'], 'bond_timeout': 0.0}]),
    ]


def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('use_depth_obstacles', default_value='false'),
        OpaqueFunction(function=setup),
    ])
