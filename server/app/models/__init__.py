"""SQLAlchemy 모델 모음.

새 모델 파일을 만들면 여기에서 import 해 주세요. Alembic이 이 모듈을 읽어 테이블 변경을 찾아요.
    from app.models.point import Point  # noqa: F401
"""

from app.core.db import Base
from app.models.park_catalog import ParkCatalogEntry
from app.models.patrol import AgentRun, AgentStep, Park, PatrolPoint, Route, RoutePoint, Schedule
from app.models.robot import Robot
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
    "AgentRun",
    "AgentStep",
    "Robot",
]
