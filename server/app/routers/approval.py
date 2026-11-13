"""총관리자 공원 승인·로봇 관리 API예요. 웹 UI와 별도로 서버 권한도 검사해요."""

from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.routers.patrol import DB, Admin
from app.schemas.approval import ApprovalInput, ParkRequestResponse, RejectionInput, RobotInput, RobotResponse
from app.schemas.patrol import ManagedPark
from app.services import approval

router = APIRouter(tags=["administration"])
ParkID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/admin/park-requests", response_model=list[ParkRequestResponse])
def list_requests(
    db: DB,
    user: Admin,
    status: Literal["pending", "approved", "rejected"] | None = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
):
    return approval.list_requests(db, user, status, limit, offset)


@router.post("/admin/parks/{park_id}/approve", response_model=ManagedPark)
def approve(park_id: ParkID, body: ApprovalInput, db: DB, user: Admin):
    return approval.approve(db, user, park_id, body)


@router.post("/admin/parks/{park_id}/reject", response_model=ManagedPark)
def reject(park_id: ParkID, body: RejectionInput, db: DB, user: Admin):
    return approval.reject(db, user, park_id, body)


@router.post("/admin/robots", response_model=RobotResponse, status_code=201)
def register_robot(body: RobotInput, db: DB, user: Admin):
    return approval.register_robot(db, user, body)


@router.get("/admin/robots", response_model=list[RobotResponse])
def list_robots(
    db: DB,
    user: Admin,
    unassigned: bool = False,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0, le=10000),
):
    return approval.list_robots(db, user, unassigned, limit, offset)


@router.get("/robots", response_model=list[RobotResponse])
def my_robots(db: DB, user: Admin):
    return approval.my_robots(db, user)
