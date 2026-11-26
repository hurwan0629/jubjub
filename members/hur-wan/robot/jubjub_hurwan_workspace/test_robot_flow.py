"""Small protocol and patrol checks that do not move robot hardware."""

import asyncio
import json
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

from jubjub_manager import JubjubManager, RobotState
from server_adapter import ServerAdapter


class RobotFlowTest(unittest.IsolatedAsyncioTestCase):
    """Exercise the boundary between the adapter and manager."""

    async def test_patrol_reports_arrival_and_completion(self):
        """A successful route produces one point event and one patrol end."""

        class Adapter:
            def __init__(self):
                self.events = []
                self.acks = []

            async def send_command_ack(self, *args):
                self.acks.append(args)

            async def send_event(self, kind, data):
                self.events.append((kind, data))

        class Navigator:
            def ready(self):
                return True

            async def go_to(self, x, y):
                return True

        class Inputs:
            def __init__(self):
                self.position = {"x": 0.0, "y": 0.0, "yaw": 0.0}

            def ready(self):
                return True

        adapter = Adapter()
        manager = JubjubManager(adapter, Navigator(), inputs=Inputs())
        await manager.handle_command(
            {
                "type": "patrol_start",
                "message_id": str(uuid4()),
                "data": {
                    "patrol_id": 7,
                    "home": {"x": 0, "y": 0},
                    "points": [{"seq": 3, "x": 1, "y": 2}],
                },
            }
        )
        await manager.patrol_task
        self.assertEqual(adapter.acks[0][1], True)
        self.assertEqual(
            [kind for kind, _ in adapter.events], ["point_arrived", "patrol_end"]
        )
        self.assertEqual(manager.state, RobotState.IDLE)

    async def test_event_ack_uses_request_id(self):
        """A robot event completes only after the matching server ACK."""
        from websockets.asyncio.server import serve

        seen = []

        async def server(socket):
            hello = json.loads(await socket.recv())
            await socket.send(
                json.dumps(
                    {
                        "type": "ack",
                        "request_id": hello["message_id"],
                        "data": {"result": "ok"},
                    }
                )
            )
            event = json.loads(await socket.recv())
            seen.append(event)
            await socket.send(
                json.dumps(
                    {
                        "type": "ack",
                        "request_id": event["message_id"],
                        "data": {"result": "ok"},
                    }
                )
            )
            await asyncio.sleep(0.05)

        async with serve(server, "127.0.0.1", 0) as listener:
            port = listener.sockets[0].getsockname()[1]
            adapter = ServerAdapter(f"ws://127.0.0.1:{port}", 1, "test-token")
            task = asyncio.create_task(
                adapter.run(
                    {
                        "state": "idle",
                        "patrol_id": None,
                        "position": {"x": 0.0, "y": 0.0, "yaw": 0.0},
                        "battery_voltage": 12.0,
                        "pending_count": 0,
                    }
                )
            )
            for _ in range(100):
                if adapter.ready:
                    break
                await asyncio.sleep(0.01)
            await adapter.send_event(
                "patrol_end", {"patrol_id": 7, "result": "completed"}
            )
            await task
        self.assertEqual(seen[0]["type"], "patrol_end")
        self.assertEqual(seen[0]["data"]["patrol_id"], 7)

    async def test_stop_cancels_navigation_and_returns_home(self):
        """Stopping an active leg yields a stopped result after reaching home."""

        class Adapter:
            def __init__(self):
                self.events = []

            async def send_command_ack(self, *_args):
                pass

            async def send_event(self, kind, data):
                self.events.append((kind, data))

        class Navigator:
            def __init__(self):
                self.started = asyncio.Event()
                self.cancelled = asyncio.Event()

            def ready(self):
                return True

            async def go_to(self, x, y):
                if x == 1:
                    self.started.set()
                    await self.cancelled.wait()
                    return False
                return True

            async def cancel(self):
                self.cancelled.set()

        class Inputs:
            def ready(self):
                return True

        adapter, navigator = Adapter(), Navigator()
        manager = JubjubManager(adapter, navigator, inputs=Inputs())
        await manager.handle_command(
            {
                "type": "patrol_start",
                "message_id": str(uuid4()),
                "data": {
                    "patrol_id": 8,
                    "home": {"x": 0, "y": 0},
                    "points": [{"seq": 0, "x": 1, "y": 0}],
                },
            }
        )
        await navigator.started.wait()
        await manager.handle_command(
            {
                "type": "patrol_stop",
                "message_id": str(uuid4()),
                "data": {"patrol_id": 8},
            }
        )
        await manager.patrol_task
        self.assertEqual(
            adapter.events, [("patrol_end", {"patrol_id": 8, "result": "stopped"})]
        )
        self.assertEqual(manager.state, RobotState.IDLE)

    async def test_event_retry_keeps_message_id(self):
        """A missing ACK causes an idempotent retry with the original ID."""
        from websockets.asyncio.server import serve

        seen = []

        async def server(socket):
            hello = json.loads(await socket.recv())
            await socket.send(
                json.dumps(
                    {
                        "type": "ack",
                        "request_id": hello["message_id"],
                        "data": {"result": "ok"},
                    }
                )
            )
            seen.append(json.loads(await socket.recv()))
            seen.append(json.loads(await socket.recv()))
            await socket.send(
                json.dumps(
                    {
                        "type": "ack",
                        "request_id": seen[1]["message_id"],
                        "data": {"result": "ok"},
                    }
                )
            )

        async with serve(server, "127.0.0.1", 0) as listener:
            port = listener.sockets[0].getsockname()[1]
            adapter = ServerAdapter(f"ws://127.0.0.1:{port}", 1, "test-token")
            task = asyncio.create_task(
                adapter.run(
                    {
                        "state": "idle",
                        "patrol_id": None,
                        "position": {"x": 0.0, "y": 0.0, "yaw": 0.0},
                        "battery_voltage": 12.0,
                        "pending_count": 0,
                    }
                )
            )
            for _ in range(100):
                if adapter.ready:
                    break
                await asyncio.sleep(0.01)
            with patch("server_adapter.EVENT_ACK_TIMEOUT_SECONDS", 0.05):
                await adapter.send_event(
                    "patrol_end", {"patrol_id": 7, "result": "completed"}
                )
            await task
        self.assertEqual(seen[0]["message_id"], seen[1]["message_id"])

    async def test_track_without_stable_field_can_be_selected(self):
        """The actual hurwan track message has no stable attribute."""

        class Adapter:
            def __init__(self):
                self.events = []

            async def send_event(self, kind, data):
                self.events.append((kind, data))

        class Pick:
            def ready(self):
                return True

            async def pick(self, track):
                return False, "grasp_failed"

        class Inputs:
            def __init__(self):
                self.position = {"x": 0.0, "y": 0.0, "yaw": 0.0}
                self.jpeg = b"jpeg"
                self.jpeg_received_at = time.monotonic()
                self.tracks_received_at = time.monotonic()

        adapter = Adapter()
        manager = JubjubManager(adapter, pick_executor=Pick(), inputs=Inputs())
        manager.patrol_id = 7
        manager.state = RobotState.PATROLLING
        manager.update_tracks(
            [
                {
                    "track_id": 12,
                    "class_id": 1,
                    "material": "can",
                    "confidence": 0.9,
                    "x": 0.1,
                    "y": 0.0,
                    "z": 0.0,
                }
            ]
        )
        await manager._pick_nearby()
        self.assertEqual(
            [kind for kind, _ in adapter.events], ["detection", "pick_result"]
        )
        self.assertEqual(adapter.events[1][1]["result"], "failed")


if __name__ == "__main__":
    unittest.main()
