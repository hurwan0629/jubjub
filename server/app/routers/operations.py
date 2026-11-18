"""하위관리자 공원 변경 신청과 총관리자 운영 API예요."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Path, Query

from app.routers.patrol import DB, Admin, CatalogID
from app.schemas.approval import RejectionInput, RobotResponse
from app.schemas.operations import (
    AdminParkResponse,
    AdminReportResponse,
    AssignmentInput,
    ParkChangeInput,
    ParkChangeResponse,
)
from app.services import operations

router = APIRouter(tags=["operations"])
ID = Annotated[int, Path(ge=1, le=9223372036854775807)]


@router.get("/park-change-requests", response_model=list[ParkChangeResponse])
def own_changes(db: DB, user: Admin):
    return operations.own_changes(db, user)


@router.post("/park-change-requests", response_model=ParkChangeResponse, status_code=201)
def submit_change(body: ParkChangeInput, db: DB, user: Admin):
    return operations.submit_change(db, user, body)


@router.post("/park-change-requests/{request_id}/cancel", response_model=ParkChangeResponse)
def cancel_change(request_id: ID, db: DB, user: Admin):
    return operations.cancel_change(db, user, request_id)


@router.get("/admin/park-change-requests", response_model=list[ParkChangeResponse])
def list_changes(
    db: DB,
    user: Admin,
    status: Literal["all", "pending", "approved", "rejected", "cancelled"] = "pending",
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0, le=9223372036854775807),
):
    return operations.list_changes(db, user, None if status == "all" else status, limit, offset)


@router.post("/admin/park-change-requests/{request_id}/approve", response_model=ParkChangeResponse)
def approve_change(request_id: ID, db: DB, user: Admin):
    return operations.approve_change(db, user, request_id)


@router.post("/admin/park-change-requests/{request_id}/reject", response_model=ParkChangeResponse)
def reject_change(request_id: ID, body: RejectionInput, db: DB, user: Admin):
    return operations.reject_change(db, user, request_id, body.reason)


@router.get("/admin/parks", response_model=list[AdminParkResponse])
def list_parks(
    db: DB, user: Admin, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=9223372036854775807)
):
    return operations.list_parks(db, user, limit, offset)


@router.patch("/admin/robots/{robot_id}/assignment", response_model=RobotResponse)
def assign_robot(robot_id: ID, body: AssignmentInput, db: DB, user: Admin):
    return operations.assign_robot(db, user, robot_id, int(body.park_id) if body.park_id is not None else None)


@router.get("/admin/parks/{park_id}/reports", response_model=list[AdminReportResponse])
def park_reports(park_id: ID, db: DB, user: Admin, date: date | None = None, catalog_id: CatalogID = None):
    return operations.park_reports(db, user, park_id, date, catalog_id)
