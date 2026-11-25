"""RGB+Depth trash detector: YOLO on RGB, median depth of the bbox center ROI, pinhole back-projection
with CameraInfo K. Output stays in the camera optical frame; the tracker does the TF step with the
capture timestamp (the camera is on the arm, so the arm pose at capture time matters)."""
import threading
import time

import numpy as np
import rclpy
from cv_bridge import CvBridge
from geometry_msgs.msg import Point
from message_filters import ApproximateTimeSynchronizer, Subscriber
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import CameraInfo, Image

from jubjub_claude_interfaces.msg import TrashDetection, TrashDetectionArray


class TrashDetector(Node):
    def __init__(self):
        super().__init__('claude_trash_detector')
        self.declare_parameter('model_path', '/home/ubuntu/hurwan_ws/models/best.pt')  # read-only use
        self.declare_parameter('confidence', 0.4)
        self.declare_parameter('imgsz', 640)
        self.declare_parameter('max_hz', 2.0)              # processing cap, not the camera rate
        self.declare_parameter('depth_unit_m', 0.001)      # 16UC1 in mm (REP 118); re-check on device
        self.declare_parameter('roi_ratio', 0.4)           # central part of the bbox used for depth
        self.declare_parameter('min_valid_ratio', 0.15)    # below this the depth is treated as unknown
        self.declare_parameter('min_depth_m', 0.15)
        self.declare_parameter('max_depth_m', 4.0)
        self.declare_parameter('rgb_topic', '/depth_cam/rgb/image_raw')
        self.declare_parameter('depth_topic', '/depth_cam/depth/image_raw')
        self.declare_parameter('info_topic', '/depth_cam/rgb/camera_info')
        self.declare_parameter('publish_debug_image', False)

        self.bridge = CvBridge()
        self.K = None
        self.model = None
        self.names = {}
        self.last_t = 0.0
        self.busy = threading.Lock()
        self.stats = {'frames': 0, 'dets': 0, 'with_point': 0, 'infer_ms': 0.0}

        self.pub = self.create_publisher(TrashDetectionArray, '/jubjub/detections', 10)
        self.debug_pub = self.create_publisher(Image, '/jubjub/detector/debug_image', 2)
        self.create_subscription(CameraInfo, self.get_parameter('info_topic').value, self.on_info, 10)
        rgb = Subscriber(self, Image, self.get_parameter('rgb_topic').value, qos_profile=qos_profile_sensor_data)
        depth = Subscriber(self, Image, self.get_parameter('depth_topic').value, qos_profile=qos_profile_sensor_data)
        self.sync = ApproximateTimeSynchronizer([rgb, depth], queue_size=5, slop=0.05)
        self.sync.registerCallback(self.on_pair)
        self.create_timer(10.0, self.report)
        threading.Thread(target=self.load_model, daemon=True).start()

    def load_model(self):
        path = self.get_parameter('model_path').value
        t0 = time.time()
        try:
            from ultralytics import YOLO
            self.model = YOLO(path, task='detect')
            self.names = self.model.names
        except Exception as e:  # noqa: BLE001
            self.get_logger().error(f'model load failed ({path}): {e}')
            return
        self.get_logger().info(f'model {path} loaded in {time.time() - t0:.1f}s classes={self.names}')

    def on_info(self, msg: CameraInfo):
        if msg.k[0] > 0:
            self.K = (msg.k[0], msg.k[4], msg.k[2], msg.k[5])

    def report(self):
        s = self.stats
        if s['frames']:
            self.get_logger().info(
                f"10s: frames={s['frames']} detections={s['dets']} with_3d={s['with_point']} "
                f"avg_infer={s['infer_ms'] / s['frames']:.0f}ms")
        self.stats = {'frames': 0, 'dets': 0, 'with_point': 0, 'infer_ms': 0.0}

    def on_pair(self, rgb_msg: Image, depth_msg: Image):
        if self.model is None or self.K is None:
            return
        now = time.monotonic()
        if now - self.last_t < 1.0 / max(0.1, float(self.get_parameter('max_hz').value)):
            return
        if not self.busy.acquire(blocking=False):
            return
        try:
            self.last_t = now
            self.process(rgb_msg, depth_msg)
        finally:
            self.busy.release()

    def depth_at(self, depth, box):
        x1, y1, x2, y2 = box
        r = float(self.get_parameter('roi_ratio').value)
        cx, cy, hw, hh = (x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) * r / 2, (y2 - y1) * r / 2
        h, w = depth.shape[:2]
        xa, xb = max(0, int(cx - hw)), min(w, int(cx + hw) + 1)
        ya, yb = max(0, int(cy - hh)), min(h, int(cy + hh) + 1)
        roi = depth[ya:yb, xa:xb].astype(np.float32) * float(self.get_parameter('depth_unit_m').value)
        if roi.size == 0:
            return 0.0, None
        lo, hi = float(self.get_parameter('min_depth_m').value), float(self.get_parameter('max_depth_m').value)
        valid = roi[(roi > lo) & (roi < hi)]
        ratio = valid.size / roi.size
        if ratio < float(self.get_parameter('min_valid_ratio').value):
            return ratio, None
        return ratio, float(np.median(valid))

    def process(self, rgb_msg, depth_msg):
        rgb = self.bridge.imgmsg_to_cv2(rgb_msg, desired_encoding='bgr8')
        depth = self.bridge.imgmsg_to_cv2(depth_msg, desired_encoding='passthrough')
        t0 = time.time()
        res = self.model.predict(rgb, conf=float(self.get_parameter('confidence').value),
                                 imgsz=int(self.get_parameter('imgsz').value), verbose=False)[0]
        self.stats['infer_ms'] += (time.time() - t0) * 1000
        self.stats['frames'] += 1
        fx, fy, cx, cy = self.K
        sx = depth.shape[1] / rgb.shape[1]
        sy = depth.shape[0] / rgb.shape[0]
        out = TrashDetectionArray()
        out.header = rgb_msg.header   # capture time + optical frame (tracker needs both)
        for b in res.boxes:
            x1, y1, x2, y2 = [float(v) for v in b.xyxy[0].tolist()]
            d = TrashDetection()
            d.class_id = int(b.cls[0])
            d.class_name = str(self.names.get(d.class_id, d.class_id))
            d.confidence = float(b.conf[0])
            d.bbox = [int(x1), int(y1), int(x2), int(y2)]
            ratio, z = self.depth_at(depth, (x1 * sx, y1 * sy, x2 * sx, y2 * sy))
            d.depth_sample_ratio = float(ratio)
            if z is not None:
                d.has_depth, d.depth_m = True, z
                u, v = (x1 + x2) / 2, (y1 + y2) / 2
                d.has_point = True
                d.point = Point(x=(u - cx) * z / fx, y=(v - cy) * z / fy, z=z)
                self.stats['with_point'] += 1
            out.detections.append(d)
        self.stats['dets'] += len(out.detections)
        self.pub.publish(out)
        if self.get_parameter('publish_debug_image').value and self.debug_pub.get_subscription_count() > 0:
            img = res.plot()
            m = self.bridge.cv2_to_imgmsg(img, encoding='bgr8')
            m.header = rgb_msg.header
            self.debug_pub.publish(m)


def main():
    rclpy.init()
    node = TrashDetector()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
