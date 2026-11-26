"""Make patrol decisions; the adapter owns WebSocket and ROS clients own actions."""

import asyncio
import base64
import logging
import math
import time
from enum import Enum
from uuid import uuid4

logger = logging.getLogger(__name__)


class RobotState(str, Enum):
    """Local states; two active phases map to the server's working state."""

    IDLE = "idle"
    PATROLLING = "patrolling"
    PICKING = "picking"
    RETURNING = "returning"
    ERROR = "error"
    EMPTYING = "emptying"


def to_server_state(state: RobotState) -> str:
    """Convert the manager's detailed state to a server Status.state value."""
    if state in (RobotState.PATROLLING, RobotState.PICKING):
        return "working"
    return state.value


class JubjubManager:
    """Accept server commands and run one patrol through injected robot interfaces."""

    def __init__(self, adapter, navigator=None, pick_executor=None, inputs=None):
        """Keep the transport, action clients, and latest robot observations."""
        self.adapter = adapter
        self.navigator = navigator
        self.pick_executor = pick_executor
        self.inputs = inputs
        self.state = RobotState.IDLE
        self.patrol_id: int | None = None
        self.home: dict[str, float] | None = None
        self.points: list[dict] = []
        self.latest_tracks: list[dict] = []
        self.stop_requested = False
        self.patrol_task: asyncio.Task | None = None
        self.handled_tracks: set[int] = set()

    def update_tracks(self, tracks: list[dict]) -> None:
        """Remember the latest map-frame tracks from hurwan_robot_interfaces."""
        self.latest_tracks = tracks

    def status_data(self, position: dict, battery_voltage: float) -> dict:
        """Build server status from a measured map pose and battery voltage."""
        return {
            "state": to_server_state(self.state),
            "patrol_id": self.patrol_id,
            "position": position,
            "battery_voltage": battery_voltage,
        }

    async def command_loop(self) -> None:
        """Wait on the adapter queue while navigation runs in another task."""
        while True:
            command = await self.adapter.server_commands.get()
            await self.handle_command(command)

    async def handle_command(self, command: dict) -> None:
        """Dispatch one complete server message and ACK its message_id."""
        if command["type"] == "patrol_start":
            accepted, reason = await self.accept_start(command["data"])
        elif command["type"] == "patrol_stop":
            accepted, reason = await self.accept_stop(command["data"])
        else:
            accepted, reason = False, "unsupported_command"
        await self.adapter.send_command_ack(command["message_id"], accepted, reason)
        if accepted and command["type"] == "patrol_start":
            self.patrol_task = asyncio.create_task(self.run_patrol())

    async def accept_start(self, data: dict) -> tuple[bool, str | None]:
        """Validate a new patrol and save its home and ordered route."""
        if self.state != RobotState.IDLE:
            return False, "already_working"
        if self.navigator is None or not self.navigator.ready():
            return False, "navigation_not_ready"
        if self.inputs is None or not self.inputs.ready():
            return False, "map_pose_or_battery_not_ready"
        try:
            patrol_id = data["patrol_id"]
            home = data["home"]
            points = data["points"]
            if (
                type(patrol_id) is not int
                or patrol_id <= 0
                or not isinstance(points, list)
            ):
                raise ValueError
            for point in [home, *points]:
                if not all(math.isfinite(float(point[key])) for key in ("x", "y")):
                    raise ValueError
            if len({point["seq"] for point in points}) != len(points):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            return False, "invalid_patrol_route"
        self.patrol_id = patrol_id
        self.home = home
        self.points = sorted(points, key=lambda point: point["seq"])
        self.stop_requested = False
        self.handled_tracks.clear()
        self.state = RobotState.PATROLLING
        return True, None

    async def accept_stop(self, data: dict) -> tuple[bool, str | None]:
        """Request a return home; the patrol task cancels its active navigation."""
        if self.patrol_id is None or data.get("patrol_id") != self.patrol_id:
            return False, "no_active_patrol"
        self.stop_requested = True
        if self.state == RobotState.PATROLLING:
            await self.navigator.cancel()
        return True, None

    async def run_patrol(self) -> None:
        """Visit points in order, report arrivals or skips, then return home."""
        skipped = 0
        try:
            for point in self.points:
                if self.stop_requested:
                    break
                arrived = await self.navigator.go_to(point["x"], point["y"])
                if not arrived and not self.stop_requested:
                    arrived = await self.navigator.go_to(point["x"], point["y"])
                if self.stop_requested:
                    break
                if arrived:
                    skipped = 0
                    await self.adapter.send_event(
                        "point_arrived",
                        {
                            "patrol_id": self.patrol_id,
                            "seq": point["seq"],
                            "result": "arrived",
                        },
                    )
                    await self._pick_nearby()
                else:
                    skipped += 1
                    await self.adapter.send_event(
                        "point_arrived",
                        {
                            "patrol_id": self.patrol_id,
                            "seq": point["seq"],
                            "result": "skipped",
                            "reason": "navigation_failed",
                        },
                    )
                    if skipped >= 2:
                        await self._report_error(
                            "path_blocked", "Two consecutive points were skipped"
                        )
                        await self.return_home("aborted")
                        return
            await self.return_home("stopped" if self.stop_requested else "completed")
        except Exception:
            self.state = RobotState.ERROR
            logger.exception("Patrol failed")
            raise

    async def return_home(self, end_result: str) -> None:
        """Navigate to the server's home point and report the final result."""
        self.state = RobotState.RETURNING
        if self.home is None:
            raise RuntimeError("No home point")
        for _ in range(2):
            if await self.navigator.go_to(self.home["x"], self.home["y"]):
                await self.adapter.send_event(
                    "patrol_end", {"patrol_id": self.patrol_id, "result": end_result}
                )
                self.state = RobotState.IDLE
                self.patrol_id = None
                self.home = None
                self.points = []
                return
        await self._report_error(
            "return_failed", "Navigation to home failed twice", action="stopped"
        )
        self.state = RobotState.ERROR

    async def _pick_nearby(self) -> None:
        """Choose one recent, confident track when physical picking is enabled."""
        if (
            self.pick_executor is None
            or not self.pick_executor.ready()
            or self.inputs is None
        ):
            return
        if self.inputs.jpeg is None or self.inputs.position is None:
            return
        if time.monotonic() - self.inputs.jpeg_received_at > 5:
            return
        if time.monotonic() - self.inputs.tracks_received_at > 5:
            return
        pose = self.inputs.position
        for track in self.latest_tracks:
            if track["track_id"] in self.handled_tracks:
                continue
            if track["material"] not in ("plastic", "can", "glass", "general"):
                continue
            if not math.isfinite(track["confidence"]) or track["confidence"] < 0.5:
                continue
            if not all(math.isfinite(track[key]) for key in ("x", "y", "z")):
                continue
            if math.dist((track["x"], track["y"]), (pose["x"], pose["y"])) > 0.25:
                continue
            self.handled_tracks.add(track["track_id"])
            await self.handle_detection(track)
            break

    async def handle_detection(self, detection: dict) -> None:
        """Store a detection before asking the pick action to collect it."""
        detection_id = str(uuid4())
        await self.adapter.send_event(
            "detection",
            {
                "detection_id": detection_id,
                "patrol_id": self.patrol_id,
                "material": detection["material"],
                "confidence": detection["confidence"],
                "position": {"x": detection["x"], "y": detection["y"]},
                "image": base64.b64encode(self.inputs.jpeg).decode("ascii"),
            },
        )
        self.state = RobotState.PICKING
        try:
            success, reason = await self.pick_executor.pick(detection)
            result = {
                "detection_id": detection_id,
                "patrol_id": self.patrol_id,
                "result": "collected" if success else "failed",
            }
            if not success:
                result["reason"] = (reason or "pick_failed")[:1000]
            await self.adapter.send_event("pick_result", result)
        finally:
            self.state = RobotState.PATROLLING

    async def _report_error(
        self, code: str, detail: str, action: str = "returning"
    ) -> None:
        """Send a server error with the latest measured map position."""
        pose = self.inputs.position
        await self.adapter.send_event(
            "error",
            {
                "code": code,
                "patrol_id": self.patrol_id,
                "action": action,
                "position": {"x": pose["x"], "y": pose["y"]},
                "detail": detail,
            },
        )
