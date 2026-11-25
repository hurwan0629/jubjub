"""SQLAlchemy 모델 모음.

새 모델 파일을 만들면 여기에서 import 해 주세요. Alembic이 이 모듈을 읽어 테이블 변경을 찾아요.
    from app.models.point import Point  # noqa: F401
"""

from app.core.db import Base
from app.models.notification_push import NotificationPushDelivery
from app.models.operations import ParkChangeRequest
from app.models.park_catalog import ParkCatalogEntry
from app.models.patrol import Park, PatrolPoint, Route, RoutePoint, Schedule
from app.models.robot import Robot, RobotState
from app.models.robot_assignment import RobotAssignmentRequest, RobotAssignmentRequestRobot
from app.models.robot_protocol import RobotError, RobotMessageReceipt, RobotTaskPoint
from app.models.station import RecyclingStation
from app.models.telemetry import Detection, Notification, PushToken, RobotTask
from app.models.user import User

__all__ = [
    "Base",
    "ParkCatalogEntry",
    "User",
    "Park",
    "PatrolPoint",
    "Route",
    "RoutePoint",
    "Schedule",
    "Robot",
    "RobotState",
    "RobotTaskPoint",
    "RobotError",
    "RobotMessageReceipt",
    "RobotAssignmentRequest",
    "RobotAssignmentRequestRobot",
    "RecyclingStation",
    "ParkChangeRequest",
    "Detection",
    "RobotTask",
    "Notification",
    "NotificationPushDelivery",
    "PushToken",
]
