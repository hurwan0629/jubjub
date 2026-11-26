"""ROS observations needed for server status and map-frame trash decisions."""

import math
import time

from geometry_msgs.msg import PointStamped
from hurwan_robot_interfaces.msg import TrashTrackArray
from rclpy.node import Node
from rclpy.time import Time
from sensor_msgs.msg import CompressedImage
from std_msgs.msg import UInt16
from tf2_geometry_msgs import do_transform_point
from tf2_ros import Buffer, TransformException, TransformListener


class RobotInputs(Node):
    """Read battery, camera, tracks, and the map-to-base transform."""

    def __init__(self, manager):
        """Subscribe to robot topics and expose the latest measured values."""
        super().__init__("jubjub_robot_inputs")
        self.manager = manager
        self.position: dict[str, float] | None = None
        self.battery_voltage: float | None = None
        self.jpeg: bytes | None = None
        self.jpeg_received_at = 0.0
        self.tracks_received_at = 0.0
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)
        self.create_subscription(
            UInt16, "/ros_robot_controller/battery", self.on_battery, 10
        )
        self.create_subscription(
            CompressedImage, "/depth_cam/rgb/image_raw/compressed", self.on_image, 10
        )
        self.create_subscription(TrashTrackArray, "/trash_tracks", self.on_tracks, 10)

    def on_battery(self, message: UInt16) -> None:
        """Convert the controller's millivolts to server voltage in volts."""
        self.battery_voltage = message.data / 1000.0

    def on_image(self, message: CompressedImage) -> None:
        """Keep the latest JPEG for a server detection event."""
        if "jpeg" in message.format.lower() or "jpg" in message.format.lower():
            self.jpeg = bytes(message.data)
            self.jpeg_received_at = time.monotonic()

    def on_tracks(self, message: TrashTrackArray) -> None:
        """Convert tracker positions from odom to the server's map frame."""
        if message.header.frame_id != "odom":
            self.manager.update_tracks([])
            return
        try:
            odom_to_map = self.tf_buffer.lookup_transform(
                "map", "odom", Time.from_msg(message.header.stamp)
            )
        except TransformException:
            self.manager.update_tracks([])
            return
        self.tracks_received_at = time.monotonic()
        tracks = []
        for track in message.tracks:
            point = do_transform_point(
                PointStamped(header=message.header, point=track.position),
                odom_to_map,
            ).point
            tracks.append(
                {
                    "track_id": track.track_id,
                    "class_id": track.class_id,
                    "material": track.class_name,
                    "confidence": float(track.confidence),
                    "x": point.x,
                    "y": point.y,
                    "z": point.z,
                }
            )
        self.manager.update_tracks(tracks)

    def refresh_pose(self) -> None:
        """Read the current base pose in map coordinates from TF."""
        try:
            transform = self.tf_buffer.lookup_transform("map", "base_footprint", Time())
        except TransformException:
            self.position = None
            return
        if (
            self.get_clock().now() - Time.from_msg(transform.header.stamp)
        ).nanoseconds > 5_000_000_000:
            self.position = None
            return
        translation = transform.transform.translation
        rotation = transform.transform.rotation
        yaw = math.atan2(
            2 * (rotation.w * rotation.z + rotation.x * rotation.y),
            1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
        )
        if not all(
            math.isfinite(value) for value in (translation.x, translation.y, yaw)
        ):
            self.position = None
            return
        self.position = {"x": translation.x, "y": translation.y, "yaw": yaw}

    def ready(self) -> bool:
        """Return true only when the server can receive real pose and battery data."""
        self.refresh_pose()
        return (
            self.position is not None
            and self.battery_voltage is not None
            and 0 < self.battery_voltage <= 100
        )
