"""Test-only NavSatFix source. Converts the virtual robot pose to lat/lng with the anchor
transform and adds noise, so the GPS path can be exercised without a GPS receiver."""
import random

import rclpy
from geometry_msgs.msg import PoseStamped
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix, NavSatStatus

from jubjub_claude.geo_localizer import DEFAULT_ANCHORS, AnchorTransform, anchors_from_param


class FakeGps(Node):
    def __init__(self):
        super().__init__('claude_fake_gps')
        self.declare_parameter('anchors', DEFAULT_ANCHORS)
        self.declare_parameter('noise_m', 1.5)
        self.tf = AnchorTransform(anchors_from_param(list(self.get_parameter('anchors').value)))
        self.pose = None
        self.create_subscription(PoseStamped, '/jubjub/virtual_pose', self.on_pose, 10)
        self.pub = self.create_publisher(NavSatFix, '/gps/fix', 10)
        self.create_timer(1.0, self.tick)
        self.get_logger().warn('FAKE GPS for testing only (this robot has no GPS receiver)')

    def on_pose(self, msg):
        self.pose = msg

    def tick(self):
        if self.pose is None:
            return
        n = float(self.get_parameter('noise_m').value)
        x = self.pose.pose.position.x + random.gauss(0, n)
        y = self.pose.pose.position.y + random.gauss(0, n)
        lat, lng = self.tf.to_geo(x, y)
        fix = NavSatFix()
        fix.header.stamp = self.get_clock().now().to_msg()
        fix.header.frame_id = 'gps_link'
        fix.status.status = NavSatStatus.STATUS_FIX
        fix.status.service = NavSatStatus.SERVICE_GPS
        fix.latitude, fix.longitude, fix.altitude = lat, lng, 30.0
        fix.position_covariance = [n * n, 0.0, 0.0, 0.0, n * n, 0.0, 0.0, 0.0, 9.0]
        fix.position_covariance_type = NavSatFix.COVARIANCE_TYPE_APPROXIMATED
        self.pub.publish(fix)


def main():
    rclpy.init()
    node = FakeGps()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
