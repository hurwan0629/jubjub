"""Lat/lng <-> map conversion with the same 2-anchor similarity transform as the server
(server/app/services/robot_coordinates.py on dev). The robot has no GPS receiver, so the
NavSatFix input is optional (claude_fake_gps can feed it for testing)."""
import math

import rclpy
from geometry_msgs.msg import PoseWithCovarianceStamped
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix, NavSatStatus

from jubjub_claude_interfaces.srv import GeoToMap, MapToGeo

EARTH_RADIUS = 6371000.0
DEFAULT_ANCHORS = [37.5283, 126.9330, 0.0, 0.0, 37.5286, 126.9334, 40.0, 0.0]  # example only


class AnchorTransform:
    """map = (x0, y0) + R(theta) * s * ENU(lat, lng), fitted from two anchors."""

    def __init__(self, anchors):
        (lat0, lng0, x0, y0), (lat1, lng1, x1, y1) = anchors[:2]
        east = math.radians(lng1 - lng0) * EARTH_RADIUS * math.cos(math.radians(lat0))
        north = math.radians(lat1 - lat0) * EARTH_RADIUS
        dx, dy = x1 - x0, y1 - y0
        norm = east * east + north * north
        if norm < 0.01 or dx * dx + dy * dy < 0.01:
            raise ValueError('two distinct anchors are required')
        self.lat0, self.lng0, self.x0, self.y0 = lat0, lng0, x0, y0
        self.a = (dx * east + dy * north) / norm
        self.b = (dy * east - dx * north) / norm

    @property
    def scale(self):
        return math.hypot(self.a, self.b)

    @property
    def rotation(self):
        return math.atan2(self.b, self.a)

    def to_map(self, lat, lng):
        east = math.radians(lng - self.lng0) * EARTH_RADIUS * math.cos(math.radians(self.lat0))
        north = math.radians(lat - self.lat0) * EARTH_RADIUS
        return self.x0 + self.a * east - self.b * north, self.y0 + self.b * east + self.a * north

    def to_geo(self, x, y):
        a, b, n = self.a, self.b, self.a * self.a + self.b * self.b
        east = (a * (x - self.x0) + b * (y - self.y0)) / n
        north = (-b * (x - self.x0) + a * (y - self.y0)) / n
        return (self.lat0 + math.degrees(north / EARTH_RADIUS),
                self.lng0 + math.degrees(east / (EARTH_RADIUS * math.cos(math.radians(self.lat0)))))


def anchors_from_param(flat):
    if len(flat) < 8:
        raise ValueError('anchors must be [lat0,lng0,x0,y0, lat1,lng1,x1,y1]')
    return [tuple(flat[0:4]), tuple(flat[4:8])]


class GeoLocalizer(Node):
    def __init__(self):
        super().__init__('claude_geo_localizer')
        self.declare_parameter('anchors', DEFAULT_ANCHORS)  # replace with parks.anchor_points
        self.declare_parameter('global_frame', 'odom')
        self.tf = AnchorTransform(anchors_from_param(list(self.get_parameter('anchors').value)))
        self.create_service(GeoToMap, 'geo_to_map', self.on_geo_to_map)
        self.create_service(MapToGeo, 'map_to_geo', self.on_map_to_geo)
        self.pose_pub = self.create_publisher(PoseWithCovarianceStamped, '/jubjub/gps_pose', 10)
        self.create_subscription(NavSatFix, '/gps/fix', self.on_fix, 10)
        self.get_logger().info(
            f'anchor transform scale={self.tf.scale:.4f} rotation={math.degrees(self.tf.rotation):.2f}deg '
            '(no GPS receiver on this robot; /gps/fix is optional)')

    def on_geo_to_map(self, req, res):
        try:
            res.x, res.y = self.tf.to_map(req.latitude, req.longitude)
            res.success, res.message = True, 'ok'
        except Exception as e:  # noqa: BLE001
            res.success, res.message = False, str(e)
        return res

    def on_map_to_geo(self, req, res):
        try:
            res.latitude, res.longitude = self.tf.to_geo(req.x, req.y)
            res.success, res.message = True, 'ok'
        except Exception as e:  # noqa: BLE001
            res.success, res.message = False, str(e)
        return res

    def on_fix(self, fix: NavSatFix):
        if fix.status.status < NavSatStatus.STATUS_FIX or math.isnan(fix.latitude):
            return
        x, y = self.tf.to_map(fix.latitude, fix.longitude)
        out = PoseWithCovarianceStamped()
        out.header.stamp = fix.header.stamp
        out.header.frame_id = self.get_parameter('global_frame').value
        out.pose.pose.position.x, out.pose.pose.position.y = x, y
        out.pose.pose.orientation.w = 1.0
        s2 = self.tf.scale ** 2
        cov = [0.0] * 36
        cov[0] = fix.position_covariance[0] * s2 if fix.position_covariance[0] > 0 else 4.0
        cov[7] = fix.position_covariance[4] * s2 if fix.position_covariance[4] > 0 else 4.0
        cov[14] = 1e6
        cov[21] = cov[28] = cov[35] = 1e6  # GPS gives no orientation
        out.pose.covariance = cov
        self.pose_pub.publish(out)


def main():
    rclpy.init()
    node = GeoLocalizer()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
