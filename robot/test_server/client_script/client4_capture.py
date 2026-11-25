import asyncio
import json
import time

import cv2
import rclpy
from cv_bridge import CvBridge
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data
from sensor_msgs.msg import Image
from websockets.asyncio.client import connect

SERVER_URL = "ws://192.168.45.220:8000/ws/robot"
CAMERA_TOPIC = "/depth_cam/rgb/image_raw"
SAVE_PATH = "/home/ubuntu/camera_test.jpg"

class CameraCapture(Node):
  def __init__(self):
    super().__init__("jubjub_camera_capture")

    self.bridge = CvBridge()
    self.saved = False
    self.error = None

    self.sub = self.create_subscription(
      Image,
      CAMERA_TOPIC,
      self.on_image,
      qos_profile_sensor_data
    )

  def on_image(self, msg):
    try:
      frame = self.bridge.imgmsg_to_cv2(
        msg, desired_encoding="bgr8"
      )
      self.saved = cv2.imwrite(SAVE_PATH, frame)

      if not self.saved:
        self.error = "Image save failed"
      else:
        print(f"[jubjub_camera_capture] image_path: {SAVE_PATH}")

    except Exception as exc:
      self.error = str(exc)

def capture_once():
  node = CameraCapture()

  try:
    deadline = time.monotonic() + 10

    while (
      not node.saved
      and node.error is None
      and time.monotonic() < deadline
    ):
      rclpy.spin_once(node, timeout_sec=0.5)

    if node.saved:
      return {
        "status": "saved", 
        "path": SAVE_PATH
      }

    return {
      "status": "failed",
      "error": node.error or "Camera timeout"
    }

  finally:
    node.destroy_node()

async def main():
  rclpy.init()

  try:
    async with connect(SERVER_URL) as ws:
      print("Connected to server")

      async for message in ws:
        data = json.loads(message)

        if data.get("type") != "save_image":
          continue

        result = await asyncio.to_thread(capture_once)

        await ws.send(json.dumps({
          "type": "save_image_result",
          "command_id": data.get("command_id"),
          **result
        }))
  finally:
    rclpy.shutdown()

if __name__ == "__main__":
  asyncio.run(main())