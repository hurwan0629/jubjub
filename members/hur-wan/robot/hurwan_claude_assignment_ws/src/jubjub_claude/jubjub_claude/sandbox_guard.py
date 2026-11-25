"""Second line of defence: every 2 s, check that no node of this assignment (name starts with
claude_) or Nav2 started by our sandbox launch publishes on a topic that moves the robot."""
import rclpy
from rclpy.node import Node
from std_msgs.msg import Bool

from jubjub_claude.common import FORBIDDEN_TOPICS, NODE_PREFIX, SANDBOX_ARM_PLAN, SANDBOX_CMD_VEL

# Nav2 nodes launched by nav2_sandbox.launch.py (their outputs must be remapped).
OUR_NAV2_NODES = ('planner_server', 'controller_server', 'behavior_server', 'bt_navigator',
                  'lifecycle_manager_claude_nav')


class SandboxGuard(Node):
    def __init__(self):
        super().__init__('claude_sandbox_guard')
        self.ok_pub = self.create_publisher(Bool, '/jubjub/sandbox_ok', 10)
        self.create_timer(2.0, self.check)
        self.reported = set()
        self.checks = 0
        self.get_logger().info(f'watching {len(FORBIDDEN_TOPICS)} actuator topics')

    def check(self):
        self.checks += 1
        violations = []
        for topic in FORBIDDEN_TOPICS:
            for info in self.get_publishers_info_by_topic(topic):
                n = info.node_name
                if n.startswith(NODE_PREFIX) or n in OUR_NAV2_NODES:
                    violations.append(f'{n} publishes {topic}')
        for v in violations:
            if v not in self.reported:
                self.get_logger().fatal(f'SANDBOX VIOLATION: {v} -> stop the launch now (Ctrl-C)')
                self.reported.add(v)
        for topic in (SANDBOX_CMD_VEL, SANDBOX_ARM_PLAN):
            subs = [i.node_name for i in self.get_subscriptions_info_by_topic(topic)
                    if not i.node_name.startswith(NODE_PREFIX) and not i.node_name.startswith('_ros2cli')]
            key = f'sub:{topic}:{sorted(subs)}'
            if subs and key not in self.reported:
                self.get_logger().warn(f'unexpected subscriber(s) on {topic}: {subs}')
                self.reported.add(key)
        self.ok_pub.publish(Bool(data=not violations))
        if self.checks % 15 == 1:
            self.get_logger().info(f'check #{self.checks}: {"OK" if not violations else "VIOLATION"}')


def main():
    rclpy.init()
    node = SandboxGuard()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.try_shutdown()


if __name__ == '__main__':
    main()
