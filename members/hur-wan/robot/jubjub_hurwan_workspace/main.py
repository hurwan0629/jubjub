"""Start ROS inputs, robot action clients, manager, and server transport."""

import asyncio
import os

from jubjub_manager import JubjubManager
from server_adapter import ServerAdapter


async def spin_ros(node) -> None:
    """Let ROS callbacks run beside the asyncio WebSocket loops."""
    import rclpy

    while rclpy.ok():
        rclpy.spin_once(node, timeout_sec=0.01)
        await asyncio.sleep(0)


async def status_loop(manager: JubjubManager) -> None:
    """Send measured status often enough for the server heartbeat."""
    while True:
        await asyncio.sleep(2)
        if (
            manager.adapter.ready
            and manager.inputs is not None
            and manager.inputs.ready()
        ):
            await manager.adapter.send_status(
                manager.status_data(
                    manager.inputs.position, manager.inputs.battery_voltage
                )
            )


async def main() -> None:
    """Initialize one robot session from environment variables."""
    server_url = os.environ["ROBOT_SERVER_URL"]
    robot_id = int(os.environ["ROBOT_ID"])
    token = os.environ["ROBOT_TOKEN"]
    adapter = ServerAdapter(server_url, robot_id, token)
    manager = JubjubManager(adapter)
    ros_node = None
    ros_initialized = False
    tasks = []
    try:
        import rclpy
        from navigator import Navigator
        from pick_executor import PickExecutor
        from robot_inputs import RobotInputs

        rclpy.init()
        ros_initialized = True
        ros_node = RobotInputs(manager)
        manager.inputs = ros_node
        manager.navigator = Navigator(ros_node)
        manager.pick_executor = PickExecutor()
        tasks.append(asyncio.create_task(spin_ros(ros_node)))
        for _ in range(200):
            if ros_node.ready():
                break
            await asyncio.sleep(0.05)
        if not ros_node.ready():
            raise RuntimeError("map -> base_footprint TF or battery is not ready")
        hello_data = manager.status_data(ros_node.position, ros_node.battery_voltage)
        tasks.append(asyncio.create_task(status_loop(manager)))
        hello_data.setdefault("pending_count", 0)
        tasks.append(asyncio.create_task(manager.command_loop()))
        await adapter.run(hello_data)
    finally:
        if manager.navigator is not None:
            await manager.navigator.cancel()
        if manager.patrol_task is not None:
            manager.patrol_task.cancel()
            tasks.append(manager.patrol_task)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        if ros_node is not None:
            ros_node.destroy_node()
        if ros_initialized:
            rclpy.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
