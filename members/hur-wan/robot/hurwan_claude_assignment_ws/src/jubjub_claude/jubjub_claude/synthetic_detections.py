"""Test-only: pretends there is one piece of trash at a fixed world position and publishes it
as a camera-frame detection (inverse of the tracker's TF step), so the full
detect -> track -> approach -> pick flow can run when no real trash is in view."""
import math

import rclpy
from geometry_msgs.msg import PointStamped, PoseStamped
from rclpy.duration import Duration
from rclpy.node import Node
from rclpy.time import Time
from tf2_geometry_msgs import do_transform_point
from tf2_ros import Buffer, TransformException, TransformListener

from jubjub_claude.common import quaternion_to_yaw
from jubjub_claude_interfaces.msg import TrashDetection, TrashDetectionArray


class SyntheticDetections(Node):
    def __init__(self):
        super().__init__('claude_synthetic_detections')
        self.declare_parameter('global_frame', 'odom')
        self.declare_parameter('camera_frame', 'depth_cam_color_optical_frame')
        self.declare_parameter('class_id', 2)
        self.declare_parameter('class_name', 'can')
        self.declare_parameter('confidence', 0.87)
        self.declare_parameter('ahead_of_virtual_m', 1.6)   # place the trash this far ahead of the virtual robot
        self.declare_parameter('lateral_m', 0.4)
        self.declare_parameter('height_m', 0.03)
        self.declare_parameter('start_delay_s', 8.0)
        self.target = None
        self.t0 = self.get_clock().now()
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.create_subscription(PoseStamped, '/jubjub/virtual_pose', self.on_vpose, 10)
        self.pub = self.create_publisher(TrashDetectionArray, '/jubjub/detections', 10)
        self.create_timer(0.5, self.tick)
        self.get_logger().warn('SYNTHETIC detections for testing (not from the camera)')

    def on_vpose(self, msg):
        if self.target is not None:
            return
        if (self.get_clock().now() - self.t0) < Duration(seconds=float(self.get_parameter('start_delay_s').value)):
            return
        yaw = quaternion_to_yaw(msg.pose.orientation)
        a, l = float(self.get_parameter('ahead_of_virtual_m').value), float(self.get_parameter('lateral_m').value)
        x = msg.pose.position.x + a * math.cos(yaw) - l * math.sin(yaw)
        y = msg.pose.position.y + a * math.sin(yaw) + l * math.cos(yaw)
        self.target = (x, y, float(self.get_parameter('height_m').value))
        self.get_logger().info(f'synthetic trash placed at ({x:.2f},{y:.2f}) in {self.get_parameter("global_frame").value}')

    def tick(self):
        if self.target is None:
            return
        gf, cf = self.get_parameter('global_frame').value, self.get_parameter('camera_frame').value
        try:
            tf = self.tf_buffer.lookup_transform(cf, gf, Time(), timeout=Duration(seconds=0.2))
        except TransformException as e:
            self.get_logger().warn(f'TF {gf}->{cf}: {e}', throttle_duration_sec=5.0)
            return
        ps = PointStamped()
        ps.header.frame_id = gf
        ps.point.x, ps.point.y, ps.point.z = self.target
        p = do_transform_point(ps, tf).point
        out = TrashDetectionArray()
        out.header.frame_id = cf
        out.header.stamp = tf.header.stamp     # TF-consistent capture time
        d = TrashDetection()
        d.class_id = int(self.get_parameter('class_id').value)
        d.class_name = self.get_parameter('class_name').value
        d.confidence = float(self.get_parameter('confidence').value)
        d.bbox = [300, 200, 340, 260]
        d.depth_sample_ratio = 0.9
        d.has_depth, d.depth_m = True, float(p.z)
        d.has_point, d.point = True, p
        out.detections.append(d)
        self.pub.publish(out)


def main():
    rclpy.init()
    node = SyntheticDetections()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
