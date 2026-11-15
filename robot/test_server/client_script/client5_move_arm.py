import asyncio
import json
import time
import math

import cv2
from cv_bridge import CvBridge

import rclpy
from rclpy.node import Node
from rclpy.qos import qos_profile_sensor_data

from sensor_msgs.msg import Image, JointState
from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint
from builtin_interfaces.msg import Duration
from websockets.asyncio.client import connect

SERVER_URL = "ws://192.168.45.220:8000/ws/robot"
CAMERA_TOPIC = "depth_cam/depth_cam"
SAVE_PATH = "/home/ubuntu/camera_test.jpg"

ARM_TOPIC = "/arm_controller/joint_trajectory"
ARM_JOINTS = [
  "joint" + str(c) for c in [1, 2, 3, 4, 5]
]

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

class ArmMover(Node):
  def __init__(self):
    super().__init__("jubjub_arm_mover")

    self.positions = None

    self.pub = self.create_publisher(
      JointTrajectory,
      ARM_TOPIC,
      10
    )

    self.sub = self.create_subscription(
      JointState,
      "/joint_states",
      self.on_joint_state,
      qos_profile_sensor_data
    )

  def on_joint_state(self, msg):
    joints = dict(zip(msg.name, msg.position))

    if all(name in joints for name in ARM_JOINTS):
      self.positions = [
        joints[name]
        for name
        in ARM_JOINTS
      ]

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

def move_joint1_once(delta_rad):
  if (
    not isinstance(delta_rad, (int, float))
    or isinstance(delta_rad, bool)
    or not math.isfinite(delta_rad)
    or abs(delta_rad) > 0.1
  ):
    return {
      "status": "failed",
      "error": "Invalid delta_rad"
    }
  node = ArmMover()

  try:
    deadline = time.monotonic() + 5

    while time.monotonic() < deadline:
      if (
        node.positions is not None
        and node.pub.get_subscription_count() > 0
      ):
        break

      rclpy.spin_once(node, timeout_sec=0.2)

    if node.positions is None:
      return {
        "status": "failed",
        "error": "Joint states unavailable"
      }

    if node.pub.get_subscription_count() == 0:
      return {
        "status": "failed",
        "error": "Arm subscriber unavailable"
      }

    current = list(node.positions)
    target = current.copy()

    # joint1만 현재 위치에서 상대 이동
    target[0] += delta_rad

    msg = JointTrajectory()
    msg.joint_names = ARM_JOINTS

    point = JointTrajectoryPoint()
    point.positions = target
    point.time_from_start = Duration(sec=2)

    msg.points = [point]

    node.pub.publish(msg)

    # 발생 직후 노드가 사라지지 않도록 잠시 유지
    time.sleep(0.3)

    return {
      "status": "command_published",
      "joint": "joint1",
      "from": current[0],
      "target": target[0]
    }

  except Exception as exc:
    return {
      "status": "failed",
      "error": str(exc)
    }

  finally:
    node.destroy_node()

async def main():
  rclpy.init()

  try:
    async with connect(SERVER_URL) as ws:
      async for message in ws:
        data = json.loads(message)
        command_type = data.get("type")

        if command_type == "save_image":
          result = await asyncio.to_thread(capture_once)
          response_type = "save_image_result"

        elif command_type == "move_arm":
          result = await asyncio.to_thread(
            move_joint1_once,
            data.get("delta_rad")
          )
          response_type = "move_arm_result"

        else:
          continue

        await ws.send(json.dumps({
          "type": response_type,
          "command_id": data.get("command_id"),
          **result
        }))
  finally:
    rclpy.shutdown()

if __name__ == "__main__":
  asyncio.run(main())