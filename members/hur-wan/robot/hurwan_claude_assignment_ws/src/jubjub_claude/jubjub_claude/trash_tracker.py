"""Turns per-frame camera detections into persistent tracks in the global frame.
TF is looked up at the image capture time, so the arm pose (camera on link4) is included."""
import math
from dataclasses import dataclass

import rclpy
from geometry_msgs.msg import Point, PointStamped
from rclpy.duration import Duration
from rclpy.node import Node
from rclpy.time import Time
from tf2_geometry_msgs import do_transform_point
from tf2_ros import Buffer, TransformException, TransformListener

from jubjub_claude_interfaces.msg import TrashDetectionArray, TrashTrack, TrashTrackArray


@dataclass
class Track:
    track_id: int
    class_id: int
    class_name: str
    confidence: float
    position: Point
    hits: int
    last_seen: Time


class TrashTracker(Node):
    def __init__(self):
        super().__init__('claude_trash_tracker')
        self.declare_parameter('global_frame', 'odom')
        self.declare_parameter('match_distance_m', 0.25)
        self.declare_parameter('track_timeout_s', 5.0)
        self.declare_parameter('min_hits', 3)
        self.declare_parameter('smoothing', 0.3)   # EMA weight of the new observation
        self.tracks: dict[int, Track] = {}
        self.next_id = 1
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.create_subscription(TrashDetectionArray, '/jubjub/detections', self.on_detections, 10)
        self.pub = self.create_publisher(TrashTrackArray, '/jubjub/tracks', 10)
        self.tf_fail = 0

    def to_global(self, header, p):
        gf = self.get_parameter('global_frame').value
        ps = PointStamped(header=header, point=p)
        try:
            tf = self.tf_buffer.lookup_transform(gf, header.frame_id, Time.from_msg(header.stamp),
                                                 timeout=Duration(seconds=0.2))
        except TransformException as e:
            self.tf_fail += 1
            if self.tf_fail % 20 == 1:
                self.get_logger().warn(f'TF at capture time failed ({e}); detection dropped')
            return None
        return do_transform_point(ps, tf).point

    def on_detections(self, msg: TrashDetectionArray):
        now = Time.from_msg(msg.header.stamp)
        md = float(self.get_parameter('match_distance_m').value)
        alpha = float(self.get_parameter('smoothing').value)
        used = set()
        for d in msg.detections:
            if not d.has_point:
                continue
            p = self.to_global(msg.header, d.point)
            if p is None:
                continue
            best, best_dist = None, md
            for t in self.tracks.values():
                if t.track_id in used or t.class_id != d.class_id:
                    continue
                dist = math.dist((t.position.x, t.position.y), (p.x, p.y))
                if dist < best_dist:
                    best, best_dist = t, dist
            if best is None:
                best = Track(self.next_id, d.class_id, d.class_name, d.confidence, p, 0, now)
                self.tracks[best.track_id] = best
                self.next_id += 1
            else:
                best.position = Point(x=(1 - alpha) * best.position.x + alpha * p.x,
                                      y=(1 - alpha) * best.position.y + alpha * p.y,
                                      z=(1 - alpha) * best.position.z + alpha * p.z)
                best.confidence = max(best.confidence, d.confidence)
            best.hits += 1
            best.last_seen = now
            used.add(best.track_id)
        timeout = Duration(seconds=float(self.get_parameter('track_timeout_s').value))
        for tid in [tid for tid, t in self.tracks.items() if now - t.last_seen > timeout]:
            del self.tracks[tid]
        self.publish(msg.header.stamp)

    def publish(self, stamp):
        out = TrashTrackArray()
        out.header.stamp = stamp
        out.header.frame_id = self.get_parameter('global_frame').value
        min_hits = int(self.get_parameter('min_hits').value)
        for t in self.tracks.values():
            out.tracks.append(TrashTrack(
                track_id=t.track_id, class_id=t.class_id, class_name=t.class_name, confidence=t.confidence,
                position=t.position, hits=t.hits, stable=t.hits >= min_hits, last_seen=t.last_seen.to_msg()))
        self.pub.publish(out)


def main():
    rclpy.init()
    node = TrashTracker()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
