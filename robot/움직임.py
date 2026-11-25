import time
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

TOPIC = "/controller/cmd_vel"

def main():
  rclpy.init()
  node = Node("move_test")

  pub = node.create_publisher(Twist, TOPIC, 10)

  try:
    deadline = time.monotonic() + 3.0
    while pub.get_subscription_count() == 0:
      if time.monotonic() >= deadline:
        raise RuntimeError("제어 토픽 구독자가 없습니다")
      time.sleep(0.1)
    
    cmd = Twist()
    cmd.linear.x = -0.8
    cmd.angular.z = 0.0

    start = time.monotonic()
    while time.monotonic() - start < 10.0:
      pub.publish(cmd)
      time.sleep(0.1)
  
  finally:
    stop = Twist()
    for _ in range(10):
      pub.publish(stop)
      time.sleep(0.1)

    node.destroy_node()
    rclpy.shutdown()

if __name__ == "__main__":
  main()