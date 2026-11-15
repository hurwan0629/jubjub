import asyncio
import json
import math

import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist
from websockets.asyncio.client import connect

SERVER_URL = "ws://192.168.45.220:8000/ws/robot"

async def main():
  rclpy.init()

  node = Node("jubjub_robot_agent")
  pub = node.create_publisher(
    Twist, "/controller/cmd_vel", 10
  )

  # wait 5 sec until ros2 subscriptor (gazebo bridge in simulation)
  for _ in range(50):
    if pub.get_subscription_count() > 0:
      break
    await asyncio.sleep(0.1)


  # connection start
  try:
    # check subscription
    if pub.get_subscription_count() == 0:
      raise RuntimeError("no subscriptor for /controller/cmd_vel")
    print(f"publisher count: {pub.get_subscription_count()}")

    # event loop start
    async with connect(SERVER_URL) as ws:
      print(f"Connected to server [{SERVER_URL}]")

      while True:
        message = await ws.recv()

        data = json.loads(message)

        print(f"[message from server] {data}")

        message_type = data.get("type", "")
        # 종료 요청
        if not message_type or message_type == "disconnect":
          break
        # 토픽 정보 확인
        elif message_type == "check_topic_info":
          topic = data.get("topic")
          string = ""
          
          string += f"[check_topic_info] {topic}"

          string += f"  [publishers] {node.count_publishers(topic)}"
          for info in node.get_publishers_info_by_topic(topic):
            string += f"    [info] {info.node_name}"
          
          string += f"  [subscribers] {node.count_subscribers(topic)}"
          for info in node.get_subscriptions_info_by_topic(topic):
            string += f"    [info] {info.node_name}"
          
          print(string)
          await ws.send(json.dumps({
            "type": "topic_info_result",
            "command_id": data.get("command_id"),
            "topic": topic,
            "info": string
          }))

        elif message_type == "move":
          try:
            vx, vy, wz = (
              data.get("vx", 0.0),
              data.get("vy", 0.0),
              data.get("wz", 0.0),
            )
            msg = Twist()
            msg.linear.x = vx
            msg.linear.y = vy
            msg.angular.z = wz

            # publish movement for 0.5 sec
            for _ in range(5):
              pub.publish(msg)
              await asyncio.sleep(0.1)
            status = "command_published"

          except Exception as exc:
            print(f"[Motion error] {exc}")
            status = "failed"

          finally:
            # stop movement after movement
            for _ in range(10):
              pub.publish(Twist())
              await asyncio.sleep(0.1)

          print(f"[ws.send] {data.get('command_id')}")
          await ws.send(json.dumps({
            "type": "motion_test_result",
            "command_id": data.get("command_id"),
            "status": status
          }))
      # [end] while True: 
  # connection end
  finally:
    node.destroy_node()
    rclpy.shutdown()

asyncio.run(main())