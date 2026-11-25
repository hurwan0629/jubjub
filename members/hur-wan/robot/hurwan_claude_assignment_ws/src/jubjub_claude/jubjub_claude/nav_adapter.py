"""Navigation adapter between jubjub_manager and Nav2.

backend=plan_mock (default, sandbox): Nav2 planner_server computes a REAL path on the live
costmap (lidar + depth obstacles) with ComputePathToPose, then the robot is moved VIRTUALLY along
that path at `speed_mps`. Nothing is sent to any velocity topic.
backend=nav2: forwards to Nav2 NavigateToPose. Only safe if the Nav2 controller's cmd_vel is
remapped away from /cmd_vel (see launch/nav2_sandbox.launch.py).
"""
import math
import threading
import time

import rclpy
from action_msgs.msg import GoalStatus
from geometry_msgs.msg import Pose2D, PoseStamped
from nav2_msgs.action import ComputePathToPose, NavigateToPose
from rclpy.action import ActionClient, ActionServer, CancelResponse, GoalResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.duration import Duration
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.time import Time
from std_srvs.srv import Trigger
from tf2_ros import Buffer, TransformException, TransformListener

from jubjub_claude.common import quaternion_to_yaw, yaw_to_quaternion
from jubjub_claude_interfaces.action import NavigateTo
from jubjub_claude_interfaces.srv import PlanPath


def path_length(path):
    pts = [(p.pose.position.x, p.pose.position.y) for p in path.poses]
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


def wait_future(fut, timeout_s):
    end = time.monotonic() + timeout_s
    while not fut.done():
        if time.monotonic() > end:
            return None
        time.sleep(0.01)
    return fut.result()


class NavAdapter(Node):
    def __init__(self):
        super().__init__('claude_nav_adapter')
        self.declare_parameter('backend', 'plan_mock')
        self.declare_parameter('global_frame', 'odom')
        self.declare_parameter('base_frame', 'base_footprint')
        self.declare_parameter('planner_id', 'GridBased')
        self.declare_parameter('speed_mps', 0.3)
        self.declare_parameter('time_scale', 1.0)       # >1 = simulated drive runs faster than real time
        self.declare_parameter('planner_timeout_s', 10.0)
        self.cb = ReentrantCallbackGroup()
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.planner = ActionClient(self, ComputePathToPose, 'compute_path_to_pose', callback_group=self.cb)
        self.nav2 = ActionClient(self, NavigateToPose, 'navigate_to_pose', callback_group=self.cb)
        self.vpose = None            # virtual robot pose (Pose2D) in global frame
        self.vlock = threading.Lock()
        self.active = False
        self.pose_pub = self.create_publisher(PoseStamped, '/jubjub/virtual_pose', 10)
        self.create_timer(0.2, self.publish_pose, callback_group=self.cb)
        self.create_service(PlanPath, 'plan_path', self.on_plan_path, callback_group=self.cb)
        self.create_service(Trigger, 'sync_virtual_pose', self.on_sync, callback_group=self.cb)
        self.server = ActionServer(self, NavigateTo, 'navigate_to', self.execute,
                                   goal_callback=self.on_goal,
                                   cancel_callback=lambda _g: CancelResponse.ACCEPT, callback_group=self.cb)
        self.get_logger().info(f"backend={self.get_parameter('backend').value} "
                               f"(plan_mock: real Nav2 planning, virtual driving, no cmd_vel)")

    # --- virtual pose -------------------------------------------------------------------------
    def real_pose(self):
        gf, bf = self.get_parameter('global_frame').value, self.get_parameter('base_frame').value
        try:
            tf = self.tf_buffer.lookup_transform(gf, bf, Time(), timeout=Duration(seconds=0.2))
        except TransformException:
            return None
        t = tf.transform
        return Pose2D(x=t.translation.x, y=t.translation.y, theta=quaternion_to_yaw(t.rotation))

    def on_sync(self, _req, res):
        p = self.real_pose()
        if p is None:
            res.success, res.message = False, 'no TF'
            return res
        with self.vlock:
            self.vpose = p
        res.success, res.message = True, f'virtual pose = real pose ({p.x:.2f},{p.y:.2f},{p.theta:.2f})'
        return res

    def publish_pose(self):
        with self.vlock:
            if self.vpose is None:
                self.vpose = self.real_pose()
            p = self.vpose
        if p is None:
            return
        msg = PoseStamped()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = self.get_parameter('global_frame').value
        msg.pose.position.x, msg.pose.position.y = p.x, p.y
        msg.pose.orientation = yaw_to_quaternion(p.theta)
        self.pose_pub.publish(msg)

    def pose_stamped(self, p2d):
        ps = PoseStamped()
        ps.header.frame_id = self.get_parameter('global_frame').value
        ps.header.stamp = self.get_clock().now().to_msg()
        ps.pose.position.x, ps.pose.position.y = p2d.x, p2d.y
        ps.pose.orientation = yaw_to_quaternion(p2d.theta)
        return ps

    # --- planning -----------------------------------------------------------------------------
    def plan(self, start, goal):
        """Returns (path, message). start=None -> Nav2 uses the real robot pose from TF."""
        if not self.planner.wait_for_server(timeout_sec=2.0):
            return None, 'planner_server not available'
        g = ComputePathToPose.Goal()
        g.goal = goal
        g.planner_id = self.get_parameter('planner_id').value
        if start is not None:
            g.start, g.use_start = start, True
        gh = wait_future(self.planner.send_goal_async(g), 5.0)
        if gh is None or not gh.accepted:
            return None, 'planner rejected goal'
        res = wait_future(gh.get_result_async(), float(self.get_parameter('planner_timeout_s').value))
        if res is None:
            return None, 'planner timeout'
        if res.status != GoalStatus.STATUS_SUCCEEDED or not res.result.path.poses:
            return None, f'no path (status={res.status})'
        return res.result.path, 'ok'

    def on_plan_path(self, req, res):
        start = req.start if req.use_start else None
        if start is None:
            with self.vlock:
                vp = self.vpose
            start = self.pose_stamped(vp) if vp is not None else None
        path, msg = self.plan(start, req.goal)
        res.success, res.message = path is not None, msg
        if path is not None:
            res.path, res.length_m = path, path_length(path)
        return res

    # --- NavigateTo action --------------------------------------------------------------------
    def on_goal(self, _goal):
        return GoalResponse.REJECT if self.active else GoalResponse.ACCEPT

    def execute(self, gh):
        self.active = True
        try:
            if self.get_parameter('backend').value == 'nav2':
                return self.execute_nav2(gh)
            return self.execute_mock(gh)
        finally:
            self.active = False

    def execute_mock(self, gh):
        result = NavigateTo.Result()
        with self.vlock:
            vp = self.vpose
        if vp is None:
            gh.abort()
            result.reason = 'no_pose'
            return result
        goal = gh.request.goal
        goal.header.frame_id = goal.header.frame_id or self.get_parameter('global_frame').value
        path, msg = self.plan(self.pose_stamped(vp), goal)
        if path is None:
            self.get_logger().warn(f'plan failed: {msg}')
            gh.abort()
            result.reason = 'planner_failed'
            return result
        total = path_length(path)
        result.path_length_m = total
        speed = float(self.get_parameter('speed_mps').value) * float(self.get_parameter('time_scale').value)
        self.get_logger().info(f'path {len(path.poses)} poses, {total:.2f} m -> virtual drive '
                               f'{total / max(speed, 1e-3):.1f}s')
        pts = [(p.pose.position.x, p.pose.position.y) for p in path.poses]
        travelled, dt = 0.0, 0.1
        i = 0
        x, y = pts[0]
        yaw = vp.theta
        while i < len(pts) - 1:
            if gh.is_cancel_requested:
                gh.canceled()
                result.reason = 'canceled'
                return result
            step = speed * dt
            while step > 0 and i < len(pts) - 1:
                nx, ny = pts[i + 1]
                seg = math.dist((x, y), (nx, ny))
                if seg <= step:
                    step -= seg
                    travelled += seg
                    if seg > 1e-6:
                        yaw = math.atan2(ny - y, nx - x)
                    x, y = nx, ny
                    i += 1
                else:
                    yaw = math.atan2(ny - y, nx - x)
                    x += (nx - x) * step / seg
                    y += (ny - y) * step / seg
                    travelled += step
                    step = 0
            with self.vlock:
                self.vpose = Pose2D(x=x, y=y, theta=yaw)
            fb = NavigateTo.Feedback()
            fb.distance_remaining_m = max(0.0, total - travelled)
            fb.current = Pose2D(x=x, y=y, theta=yaw)
            gh.publish_feedback(fb)
            time.sleep(dt)
        with self.vlock:
            self.vpose = Pose2D(x=x, y=y, theta=quaternion_to_yaw(goal.pose.orientation))
        gh.succeed()
        result.success = True
        return result

    def execute_nav2(self, gh):
        result = NavigateTo.Result()
        if not self.nav2.wait_for_server(timeout_sec=2.0):
            gh.abort()
            result.reason = 'nav2_unavailable'
            return result
        g = NavigateToPose.Goal()
        g.pose = gh.request.goal
        ngh = wait_future(self.nav2.send_goal_async(g), 5.0)
        if ngh is None or not ngh.accepted:
            gh.abort()
            result.reason = 'nav2_rejected'
            return result
        fut = ngh.get_result_async()
        while not fut.done():
            if gh.is_cancel_requested:
                ngh.cancel_goal_async()
                gh.canceled()
                result.reason = 'canceled'
                return result
            time.sleep(0.05)
        if fut.result().status == GoalStatus.STATUS_SUCCEEDED:
            gh.succeed()
            result.success = True
        else:
            gh.abort()
            result.reason = 'nav2_failed'
        return result


def main():
    rclpy.init()
    node = NavAdapter()
    ex = MultiThreadedExecutor(num_threads=4)
    ex.add_node(node)
    try:
        ex.spin()
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
