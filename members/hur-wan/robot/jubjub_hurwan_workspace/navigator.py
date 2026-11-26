"""Thin Nav2 action client for map-frame x/y goals."""

import asyncio
import math

from action_msgs.msg import GoalStatus
from geometry_msgs.msg import PoseStamped
from nav2_msgs.action import NavigateToPose
from rclpy.action import ActionClient


async def await_ros_future(ros_future):
    """Allow an rclpy future to be awaited from the asyncio command loop."""
    loop = asyncio.get_running_loop()
    future = loop.create_future()

    def settle(value, error=None):
        """Ignore a late ROS callback after asyncio cancellation."""
        if not future.done():
            if error is None:
                future.set_result(value)
            else:
                future.set_exception(error)

    def complete(done):
        """Forward the ROS result to the asyncio loop thread."""
        try:
            result = done.result()
        except Exception as error:  # noqa: BLE001 - ROS future may raise action-specific errors.
            loop.call_soon_threadsafe(settle, None, error)
        else:
            loop.call_soon_threadsafe(settle, result)

    ros_future.add_done_callback(complete)
    return await future


class Navigator:
    """Send and cancel one Nav2 NavigateToPose goal at a time."""

    def __init__(self, node):
        """Attach the action client to the node that owns map pose data."""
        self.node = node
        self.client = ActionClient(node, NavigateToPose, "navigate_to_pose")
        self.goal_handle = None
        self.cancel_requested = False

    def ready(self) -> bool:
        """Check whether Nav2 currently advertises its action server."""
        return self.client.server_is_ready()

    async def go_to(self, x: float, y: float) -> bool:
        """Navigate to map x/y, facing the destination from the current pose."""
        if not self.ready() or not self.node.ready():
            return False
        self.cancel_requested = False
        pose = self.node.position
        yaw = math.atan2(y - pose["y"], x - pose["x"])
        goal = NavigateToPose.Goal()
        goal.pose = PoseStamped()
        goal.pose.header.frame_id = "map"
        goal.pose.header.stamp = self.node.get_clock().now().to_msg()
        goal.pose.pose.position.x = float(x)
        goal.pose.pose.position.y = float(y)
        goal.pose.pose.orientation.z = math.sin(yaw / 2)
        goal.pose.pose.orientation.w = math.cos(yaw / 2)
        handle = await await_ros_future(self.client.send_goal_async(goal))
        if not handle.accepted:
            return False
        self.goal_handle = handle
        try:
            if self.cancel_requested:
                await await_ros_future(handle.cancel_goal_async())
            result = await await_ros_future(handle.get_result_async())
            return result.status == GoalStatus.STATUS_SUCCEEDED
        finally:
            self.goal_handle = None

    async def cancel(self) -> None:
        """Cancel the current goal, including one still awaiting acceptance."""
        self.cancel_requested = True
        if self.goal_handle is not None:
            await await_ros_future(self.goal_handle.cancel_goal_async())
