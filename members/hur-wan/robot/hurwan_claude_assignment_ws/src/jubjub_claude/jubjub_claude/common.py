"""Shared constants and small helpers for the sandboxed JUBJUB pipeline."""
import math
from datetime import datetime, timedelta, timezone

from geometry_msgs.msg import Quaternion

# Topics that physically move the JetRover (measured on 2026-11-24 with `ros2 topic info -v`).
# No node in this package may ever create a publisher on these.
FORBIDDEN_TOPICS = (
    '/cmd_vel',                                     # odom_publisher -> set_motor (wheels!)
    '/controller/cmd_vel',                          # odom_publisher -> set_motor
    '/ros_robot_controller/set_motor',
    '/ros_robot_controller/bus_servo/set_position',
    '/ros_robot_controller/bus_servo/set_state',
    '/ros_robot_controller/pwm_servo/set_state',
    '/servo_controller',
    '/joint_controller',
    '/set_odom',
    '/set_pose',
)

# Where this package sends "would-be" actuator commands instead.
SANDBOX_CMD_VEL = '/claude_sandbox/cmd_vel'
SANDBOX_ARM_PLAN = '/claude_sandbox/arm_joint_plan'

NODE_PREFIX = 'claude_'

KST = timezone(timedelta(hours=9))


def yaw_to_quaternion(yaw: float) -> Quaternion:
    q = Quaternion()
    q.z = math.sin(yaw / 2.0)
    q.w = math.cos(yaw / 2.0)
    return q


def quaternion_to_yaw(q) -> float:
    return math.atan2(2.0 * (q.w * q.z + q.x * q.y), 1.0 - 2.0 * (q.y * q.y + q.z * q.z))


def normalize_angle(a: float) -> float:
    return math.atan2(math.sin(a), math.cos(a))


def ros_time_to_iso(stamp) -> str:
    """builtin_interfaces/Time -> ISO 8601 with +09:00 (server protocol)."""
    t = stamp.sec + stamp.nanosec * 1e-9
    return datetime.fromtimestamp(t, tz=KST).isoformat(timespec='milliseconds')


def now_iso() -> str:
    return datetime.now(tz=KST).isoformat(timespec='milliseconds')
