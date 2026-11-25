"""Arm IK service + pick_and_store action (plan only, never moves the arm).

Kinematics come from the live /robot_description (URDF -> KDL chain built here because
kdl_parser_py is not installed). The JetRover arm is yaw (joint1) + three pitch joints
(joint2..4) + wrist roll (joint5), so IK is solved in closed form in the arm plane and
then verified with KDL forward kinematics.
"""
import math
import threading
import time
import xml.etree.ElementTree as ET

import PyKDL as kdl
import rclpy
from geometry_msgs.msg import Point, PointStamped
from rclpy.action import ActionServer, CancelResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.duration import Duration
from rclpy.executors import MultiThreadedExecutor
from rclpy.node import Node
from rclpy.qos import DurabilityPolicy, QoSProfile, ReliabilityPolicy
from rclpy.time import Time
from sensor_msgs.msg import JointState
from std_msgs.msg import String
from tf2_geometry_msgs import do_transform_point
from tf2_ros import Buffer, TransformException, TransformListener
from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint

from jubjub_claude.common import SANDBOX_ARM_PLAN
from jubjub_claude_interfaces.action import PickAndStore
from jubjub_claude_interfaces.srv import ComputeArmIK

ARM_JOINTS = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5']
MATERIALS = ('general', 'plastic', 'can', 'glass')


def _vec(text, default='0 0 0'):
    return [float(v) for v in (text or default).split()]


def urdf_chain(urdf_xml: str, root: str, tip: str):
    """Build a KDL chain root->tip from URDF text. Returns (chain, joints[{name, lower, upper, axis}])."""
    robot = ET.fromstring(urdf_xml)
    by_child = {j.find('child').get('link'): j for j in robot.findall('joint')}
    path, link = [], tip
    while link != root:
        if link not in by_child:
            raise ValueError(f'no path from {root} to {tip} (stuck at {link})')
        j = by_child[link]
        path.append(j)
        link = j.find('parent').get('link')
    path.reverse()
    chain, joints = kdl.Chain(), []
    for j in path:
        o = j.find('origin')
        xyz = _vec(o.get('xyz') if o is not None else None)
        rpy = _vec(o.get('rpy') if o is not None else None)
        f = kdl.Frame(kdl.Rotation.RPY(*rpy), kdl.Vector(*xyz))
        name = j.get('name')
        if j.get('type') in ('revolute', 'continuous'):
            ax = j.find('axis')
            axis = _vec(ax.get('xyz') if ax is not None else None, '1 0 0')
            # Same construction as kdl_parser: joint axis expressed in the parent frame.
            kj = kdl.Joint(name, f.p, f.M * kdl.Vector(*axis), kdl.Joint.RotAxis)
            lim = j.find('limit')
            lo = float(lim.get('lower', -math.pi)) if lim is not None else -math.pi
            hi = float(lim.get('upper', math.pi)) if lim is not None else math.pi
            joints.append({'name': name, 'lower': lo, 'upper': hi, 'axis': axis})
        else:
            kj = kdl.Joint(name, kdl.Joint.Fixed)
        chain.addSegment(kdl.Segment(j.find('child').get('link'), kj, f))
    return chain, joints


class ArmModel:
    """Closed-form IK for yaw + 3 pitch joints, verified with KDL FK."""

    def __init__(self, urdf_xml, root='base_footprint', tip='end_effector_link'):
        self.root, self.tip = root, tip
        self.chain, self.joints = urdf_chain(urdf_xml, root, tip)
        self.names = [j['name'] for j in self.joints]
        if self.names[:5] != ARM_JOINTS:
            raise ValueError(f'unexpected arm joints {self.names}')
        self.fk = kdl.ChainFkSolverPos_recursive(self.chain)
        # Geometry measured at the zero configuration (all pitch links vertical).
        q = kdl.JntArray(self.chain.getNrOfJoints())
        seg_tip = []
        for seg in range(1, self.chain.getNrOfSegments() + 1):
            fr = kdl.Frame()
            self.fk.JntToCart(q, fr, seg)
            seg_tip.append(fr.p)
        movable = [s for s in range(self.chain.getNrOfSegments())
                   if self.chain.getSegment(s).getJoint().getType() != kdl.Joint.Fixed]
        # A movable segment's tip frame sits on its joint origin (joint offset is folded into f_tip).
        p_j = [seg_tip[s] for s in movable]
        p_tip = seg_tip[-1]
        self.base_xy = (p_j[0].x(), p_j[0].y())
        self.r0 = math.hypot(p_j[1].x() - p_j[0].x(), p_j[1].y() - p_j[0].y())
        self.z0 = p_j[1].z()
        self.L1 = (p_j[2] - p_j[1]).Norm()
        self.L2 = (p_j[3] - p_j[2]).Norm()
        self.L3 = (p_tip - p_j[3]).Norm()
        self.s1 = 1.0 if self.joints[0]['axis'][2] > 0 else -1.0   # yaw sign
        self.sp = 1.0 if self.joints[1]['axis'][1] > 0 else -1.0   # +y pitch leans the arm forward

    def describe(self):
        return (f'L1={self.L1:.4f} L2={self.L2:.4f} L3={self.L3:.4f} '
                f'joint2_height={self.z0:.4f} yaw_sign={self.s1:+.0f} pitch_sign={self.sp:+.0f}')

    def forward(self, q5):
        q = kdl.JntArray(self.chain.getNrOfJoints())
        for i, v in enumerate(q5):
            q[i] = v
        fr = kdl.Frame()
        self.fk.JntToCart(q, fr)
        return fr

    def within_limits(self, q):
        return all(j['lower'] - 1e-6 <= v <= j['upper'] + 1e-6 for j, v in zip(self.joints, q))

    def solve_pitch(self, x, y, z, phi):
        """phi = gripper direction from vertical-up in the arm plane (pi = pointing straight down)."""
        dx, dy = x - self.base_xy[0], y - self.base_xy[1]
        q1 = math.atan2(dy, dx) * self.s1
        r = math.hypot(dx, dy) - self.r0
        h = z - self.z0
        wr, wz = r - self.L3 * math.sin(phi), h - self.L3 * math.cos(phi)
        d = (wr * wr + wz * wz - self.L1 ** 2 - self.L2 ** 2) / (2 * self.L1 * self.L2)
        if abs(d) > 1.0:
            return None
        sols = []
        for sign in (1.0, -1.0):
            b = sign * math.acos(d)
            a1 = math.atan2(wr, wz) - math.atan2(self.L2 * math.sin(b), self.L1 + self.L2 * math.cos(b))
            a3 = phi - a1 - b
            q = [q1, a1 * self.sp, b * self.sp, a3 * self.sp, 0.0]
            if self.within_limits(q):
                sols.append(q)
        if not sols:
            return None
        return max(sols, key=lambda s: s[2] * self.sp)  # prefer elbow-up, like the stow pose

    def solve(self, x, y, z, pitch=None, pitch_min=math.radians(90), pitch_max=math.pi, step=0.05):
        cands, p = [], pitch_min
        while p <= pitch_max + 1e-9:
            cands.append(p)
            p += step
        if pitch is not None:
            cands.sort(key=lambda c: abs(c - pitch))
            cands.insert(0, pitch)
        else:
            cands.sort(key=lambda c: -c)  # prefer pointing down
        for phi in cands:
            q = self.solve_pitch(x, y, z, phi)
            if q is None:
                continue
            fr = self.forward(q)
            err = math.dist((fr.p.x(), fr.p.y(), fr.p.z()), (x, y, z))
            if err < 0.005:
                return q, phi, err
        return None, None, None


class ArmIKNode(Node):
    def __init__(self):
        super().__init__('claude_arm_ik')
        self.declare_parameter('root_frame', 'base_footprint')
        self.declare_parameter('tip_frame', 'end_effector_link')
        self.declare_parameter('pregrasp_height_m', 0.08)
        self.declare_parameter('grasp_height_m', 0.02)
        self.declare_parameter('gripper_joint', 'r_joint')
        self.declare_parameter('gripper_open', 0.0)     # UNVERIFIED on hardware
        self.declare_parameter('gripper_closed', 0.8)   # UNVERIFIED on hardware
        self.declare_parameter('travel_pose', [0.0, -0.695, 1.923, 1.223, 0.0])  # measured 11/24 camera-look pose
        for m in MATERIALS:
            # Bin slots are not mounted yet (Confluence 7: undecided) -> placeholder joint poses.
            self.declare_parameter(f'store_pose_{m}', [0.0, -0.9, 1.6, 1.4, 0.0])
        self.declare_parameter('simulated_step_s', 0.4)
        self.declare_parameter('simulate_grasp_success', True)

        self.model = None
        self.model_lock = threading.Lock()
        self.current = {}
        cb = ReentrantCallbackGroup()
        latched = QoSProfile(depth=1, durability=DurabilityPolicy.TRANSIENT_LOCAL,
                             reliability=ReliabilityPolicy.RELIABLE)
        self.create_subscription(String, '/robot_description', self.on_description, latched, callback_group=cb)
        self.create_subscription(JointState, '/joint_states', self.on_joints, 10, callback_group=cb)
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.plan_pub = self.create_publisher(JointTrajectory, SANDBOX_ARM_PLAN, 10)
        self.create_service(ComputeArmIK, 'compute_arm_ik', self.on_ik, callback_group=cb)
        self.action = ActionServer(self, PickAndStore, 'pick_and_store', self.execute_pick,
                                   cancel_callback=lambda _g: CancelResponse.ACCEPT, callback_group=cb)
        self.get_logger().info(f'plan-only arm IK ready; arm plans go to {SANDBOX_ARM_PLAN} (never to servos)')

    def on_description(self, msg):
        try:
            m = ArmModel(msg.data, self.get_parameter('root_frame').value, self.get_parameter('tip_frame').value)
        except Exception as e:  # noqa: BLE001
            self.get_logger().error(f'cannot build arm model: {e}')
            return
        with self.model_lock:
            self.model = m
        self.get_logger().info(f'arm model from URDF: {m.describe()}')
        cur = [self.current.get(n) for n in ARM_JOINTS]
        if None not in cur:
            fr = m.forward(cur)
            self.get_logger().info(
                f'FK of current joints -> end_effector at ({fr.p.x():.3f},{fr.p.y():.3f},{fr.p.z():.3f}) in {m.root}')

    def on_joints(self, msg):
        for n, p in zip(msg.name, msg.position):
            self.current[n] = p

    def to_root(self, ps: PointStamped) -> Point:
        root = self.get_parameter('root_frame').value
        if ps.header.frame_id in ('', root):
            return ps.point
        try:
            tf = self.tf_buffer.lookup_transform(root, ps.header.frame_id, Time(), timeout=Duration(seconds=0.5))
        except TransformException as e:
            raise RuntimeError(f'TF {ps.header.frame_id}->{root}: {e}') from e
        return do_transform_point(ps, tf).point

    def solve(self, p, pitch=None, pmin=math.radians(90), pmax=math.pi):
        with self.model_lock:
            model = self.model
        if model is None:
            return None, None, None, 'no robot_description yet'
        q, phi, err = model.solve(p.x, p.y, p.z, pitch, pmin, pmax)
        if q is None:
            return None, None, None, 'unreachable (no IK solution within joint limits)'
        return q, phi, err, 'ok'

    def on_ik(self, req, res):
        res.joint_names = list(ARM_JOINTS)
        try:
            p = self.to_root(req.target)
        except RuntimeError as e:
            res.success, res.message = False, str(e)
            return res
        res.target_in_base = p
        ranged = req.pitch_max > req.pitch_min
        pmin = req.pitch_min if ranged else math.radians(90)
        pmax = req.pitch_max if ranged else math.pi
        q, phi, err, msg = self.solve(p, req.pitch if req.use_pitch else None, pmin, pmax)
        res.success, res.message = q is not None, msg
        if q is not None:
            res.positions, res.solved_pitch, res.position_error_m = [float(v) for v in q], phi, err
        return res

    def execute_pick(self, goal_handle):
        g = goal_handle.request
        result = PickAndStore.Result()
        result.attempts = 1

        def stage(name):
            fb = PickAndStore.Feedback()
            fb.stage = name
            goal_handle.publish_feedback(fb)
            self.get_logger().info(f'[pick] {name}')

        try:
            p = self.to_root(g.target)
        except RuntimeError as e:
            goal_handle.abort()
            result.success, result.reason = False, f'tf: {e}'
            return result
        pre = Point(x=p.x, y=p.y, z=p.z + self.get_parameter('pregrasp_height_m').value)
        grasp = Point(x=p.x, y=p.y, z=p.z + self.get_parameter('grasp_height_m').value)
        stage(f'ik target(base)=({p.x:.3f},{p.y:.3f},{p.z:.3f})')
        q_pre, _, _, msg = self.solve(pre, math.pi)
        q_grasp, phi, err, msg2 = self.solve(grasp, math.pi)
        if q_pre is None or q_grasp is None:
            goal_handle.abort()
            result.success, result.reason = False, 'unreachable'
            self.get_logger().warn(f'[pick] unreachable: pregrasp={msg} grasp={msg2}')
            return result

        gj = self.get_parameter('gripper_joint').value
        g_open = float(self.get_parameter('gripper_open').value)
        g_closed = float(self.get_parameter('gripper_closed').value)
        travel = list(self.get_parameter('travel_pose').value)
        material = g.material if g.material in MATERIALS else 'general'
        store = list(self.get_parameter(f'store_pose_{material}').value)
        seq = [('open_at_pregrasp', q_pre, g_open), ('descend', q_grasp, g_open),
               ('close_gripper', q_grasp, g_closed), ('lift', q_pre, g_closed),
               (f'move_to_bin_{material}', store, g_closed), ('release', store, g_open),
               ('back_to_travel', travel, g_open)]
        traj = JointTrajectory()
        traj.header.stamp = self.get_clock().now().to_msg()
        traj.header.frame_id = self.get_parameter('root_frame').value
        traj.joint_names = ARM_JOINTS + [gj]
        for i, (_name, q, grip) in enumerate(seq):
            pt = JointTrajectoryPoint()
            pt.positions = [float(v) for v in q] + [grip]
            pt.time_from_start = Duration(seconds=1.5 * (i + 1)).to_msg()
            traj.points.append(pt)
        self.plan_pub.publish(traj)   # sandbox topic only, nothing subscribes to it on the robot
        step = float(self.get_parameter('simulated_step_s').value)
        for name, _q, _g in seq:
            if goal_handle.is_cancel_requested:
                goal_handle.canceled()
                result.success, result.reason = False, 'canceled'
                return result
            stage(name)
            time.sleep(step)
        result.plan = traj
        if self.get_parameter('simulate_grasp_success').value:
            goal_handle.succeed()
            result.success = True
        else:
            goal_handle.abort()
            result.success, result.reason = False, 'grasp_failed'
        self.get_logger().info(
            f'[pick] grasp pitch={math.degrees(phi):.0f}deg fk_err={err * 1000:.2f}mm -> success={result.success}')
        return result


def main():
    rclpy.init()
    node = ArmIKNode()
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
