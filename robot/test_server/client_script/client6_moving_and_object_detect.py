import asyncio
import json
import time

import cv2
import rclpy # ros client 
from cv_bridge import CvBridge
from geometry_msgs.msg import Twist
from rclpy.node import Node
from sensor_msgs.msg import Image
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

SERVER_URL = "ws://192.168.0.99:8000/ws/robot"
MOVE_TOPIC = "/controller/cmd_vel"
CAMERA_TOPIC = "/depth_cam/depth_cam"

# 로봇 제어 이동
class MotionNode(Node):
  def __init__(self):
    super().__init__("jubjub_robot_agent")
    self.pub = self.create_publisher(Twist, MOVE_TOPIC, 10)

  def move(self, vx, vy, wz):
    msg = Twist()
    msg.linear.x = vx
    msg.linear.y = vy
    msg.angular.z = wz
    self.pub.publish(msg)

  def stop(self):
    self.pub.publish(Twist())

# 2. ROS 카메라에서 사진 한장 받기
def capture_jpeg() -> bytes:
  node = Node("jubjub_capture_once")
  bridge = CvBridge()

  jpeg = None
  error = None

  def on_image(msg: Image):
    nonlocal jpeg, error

    try:
      frame = bridge.imgmsg_to_cv2(
        msg, desired_encoding="bgr8"
      )

      ok, encoded = cv2.imencode(
        ".jpg",
        frame,
        [cv2.IMWRITE_JPEG_QUALITY, 80]
      )

      if not ok:
        raise RuntimeError("JPEG encoding failed")

      jpeg = encoded.tobytes()

    except Exception as exc:
      error = exc
  # [end] def on_image(msg: Image):

  node.create_subscription(
    Image, CAMERA_TOPIC, on_image, 10
  )

  try:
    deadline = time.monotonic() + 8.0

    while(
      rclpy.ok()
      and jpeg is None
      and error is None
      and time.monotonic() < deadline
    ):
      rclpy.spin_once(node, timeout_sec=0.1)

    if error is not None:
      raise RuntimeError(f"Camera error: {error}") from error

    if jpeg is None:
      raise TimeoutError(f"No image on {CAMERA_TOPIC}")

    return jpeg

  finally:
    node.destroy_node()

# 3. 지정된 시간동안 이동
async def run_move(node, vx, vy, wz, duration):
  end = asyncio.get_running_loop().time() + duration

  try:
    while asyncio.get_running_loop().time() < end:
      node.move(vx, vy, wz)
      await asyncio.sleep(0.1)

  finally:
    node.stop()

# 4. 이미지 촬영 후 서버로 전송
async def capture_and_send(ws, request_id):
  try:
    jpeg_bytes = await asyncio.to_thread(capture_jpeg)

    # 먼저 이미지 메타데이터 전송
    await ws.send(json.dumps({
      "type": "image_meta",
      "request_id": request_id
    }))

    # 이어서 JPEG 바이너리 전송
    await ws.send(jpeg_bytes)

    print(f"Image sent: {len(jpeg_bytes)} bytes")

  except Exception as exc:
    print("Capture error:", exc)

    try:
      await ws.send(json.dumps({
        "type": "error",
        "request_id": request_id,
        "detail": str(exc)
      }))

    except ConnectionClosed:
      pass

# 5. WebSocket 연결 및 이벤트 처리
async def main():
  rclpy.init()

  node = MotionNode()
  move_task = None
  capture_task = None

  try:
    async for ws in connect(SERVER_URL, proxu=None):
      print("Connected:", SERVER_URL)

      async for raw in ws:
        if not isinstance(raw, str):
          continue

        data = json.loads(raw)
        command_type = data.get("type")

        # 이동 및 정지 명령
        if command_type in ("move", "stop"):
          # 기존 이동 작업 취소
          if move_task is not None and not move_task.done():
            move_task.cancel()

            try:
              await move_task
            except asyncio.CancelledError:
              pass

          node.stop()

          if command_type == "move": 
            vx = float(data["vx"])
            vy = float(data["vy"])
            wz = float(data["wz"])
            duration = float(data["duration_sec"])

            # 클라이언트에서도 이동 범위 제한 
            # 유효성 검사 
            if not (
              abs(vx) <= 0.2
              and abs(vy) <= 0.2
              and abs(wz) <= 0.8 # 회전은 0.8 rad만 가능하게
              and 0 < duration <= 3 # 최대 3초
            ):
              print("rejected movement command")
              continue

            move_task = asyncio.create_task(
              run_move(node, vx, vy, wz, duration)
            )

            print("Moving:", vx, vy, wz, duration)

          else:
            print("Stopped")
        # [end] if command_type in ("move", "stop"):
        elif command_type == "capture":
          request_id = data["request_id"]

          if capture_task is not None and not capture_task.done():
            await ws.send(json.dumps({
              "type": "error",
              "request_id": request_id,
              "detail": "camera is busy"
            }))
          else:
            capture_task = asyncio.create_task(
              capture_and_send(ws, request_id)
            )

        else: 
          print("Unknown command:", data)

  except (OSError, ConnectionClosed, json.JSONDecodeError) as exc:
    print("WebScoket error:", exc)

  finally:
    # 연결 종료 시 이동 중단
    if move_task is not None and not move_task.done():
      move_task.cancel()

      try:
        await capture_task
      except Exception as exc:
        print("Captuure cleanup:", exc)

    node.destroy_node()
    rclpy.shutdown()

if __name__=="__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    print("Client stopped")
