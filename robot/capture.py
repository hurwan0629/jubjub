import rclpy
import cv2
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import Image
from cv_bridge import CvBridge

class CameraCapture(Node):
  def __init__(self):
    super().__init__("camera_capture")
    self.bridge = CvBridge()
    self.saved = False

    self.sub = self.create_subscription(
      Image,
      "/depth_cam/rgb/image_raw",
      self.on_image,
      qos_profile_sensor_data
    )

  def on_image(self, msg):
    if self.saved:
      return
    
    frame = self.bridge.imgmsg_to_cv2(
      msg, desired_encoding="bgr8"
    )
    self.saved = cv2.imwrite(
      "/home/ubuntu/camera_test.jpg", frame
    )
    print("저장 성공" if self.saved else "저장 실패")

rclpy.init()
node = CameraCapture()

try:
    import time
    deadline = time.monotonic() + 10

    while not node.saved and time.monotonic() < deadline:
        rclpy.spin_once(node, timeout_sec=0.5)
finally:
    node.destroy_node()
    rclpy.shutdown()