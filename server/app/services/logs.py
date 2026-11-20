"""에이전트 판단 기록(agent_steps)을 관리자 앱의 판단 로그로 보여 줘요.

agent_steps 한 줄이 판단 하나예요. 화면에 그릴 묶음(사진 · 재촬영 · 표 · 상자)은 에이전트가 output에 남긴 값을 그대로 쓰고,
없으면 decision(고른 행동) · reason(이유)으로 "이렇게 판단했어요" 표를 만들어요.
"""

from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import AgentRun, AgentStep, PatrolPoint, RoutePoint, User
from app.schemas.logs import DECISION_TYPES, DecisionDetail, DecisionItem
from app.services.manager import KST, _local, long_time
from app.services.patrol import _park, transaction

# 화면 묶음으로 쓰는 output 키
DETAIL_KEYS = ("heading", "tag", "kicker", "headline", "photoSlot", "shots", "boxes", "cards", "footer")


def _type(step: AgentStep) -> str:
    return step.step_type if step.step_type in DECISION_TYPES else "plan"


def _item(step: AgentStep) -> DecisionItem:
    output = step.output or {}
    details = [d for d in (step.details or []) if d]
    return DecisionItem(
        id=str(step.id),
        type=_type(step),
        time=_local(step.created_at).strftime("%H:%M"),
        title=step.title,
        summary=output.get("summary") or (details[0] if details else step.decision or ""),
        details=details,
        photo_url=output.get("photoUrl"),
    )


def _route_extra(db: Session, step: AgentStep) -> dict:
    """관리자 경로 수정 기록: 저장된 순찰 지점과 바꾼 주체 · 적용 시점 (Figma A-09 경로 변경)"""
    route_id = (step.output or {}).get("routeId")
    names = []
    if route_id:
        names = list(
            db.scalars(
                select(PatrolPoint.name)
                .join(RoutePoint, RoutePoint.point_id == PatrolPoint.id)
                .where(RoutePoint.route_id == int(route_id))
                .order_by(RoutePoint.seq)
            )
        )
    return {
        "kicker": {"text": f"관리자 수정 · {long_time(step.created_at)}", "tone": "brand"},
        "heading": "순찰 경로를 변경했어요",
        "facts": [],
        "boxes": [
            {"title": "바꾼 주체", "body": "관리자님이 순찰 경로를 수정했어요"},
            {"title": "적용 시점", "body": "지금 진행 중인 순찰은 유지하고, 다음 순찰부터 적용해요"},
        ],
        "cards": [{"title": "현재 저장된 순찰 지점", "lines": [f"{i} · {n}" for i, n in enumerate(names, 1)]}]
        if names
        else [],
    }


def _detail(step: AgentStep, db: Session | None = None) -> DecisionDetail:
    output = dict(step.output or {})
    if db is not None and step.step_type == "route" and "routeId" in output:
        output = {**_route_extra(db, step), **{k: v for k, v in output.items() if k in DETAIL_KEYS}}
    facts = output.get("facts")
    if facts is None:
        facts = [{"label": "고른 행동", "value": step.decision}, {"label": "이유", "value": step.reason}]
        facts = [f for f in facts if f["value"]]
    extra = {key: output[key] for key in DETAIL_KEYS if key in output}
    return DecisionDetail(
        **_item(step).model_dump(),
        happened_at=long_time(step.created_at),
        facts=facts,
        reason=output.get("reason"),
        photo_slot=extra.pop("photoSlot", bool(output.get("photoUrl"))),
        **extra,
    )


def _day_range(date: str) -> tuple[datetime, datetime]:
    try:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError as exc:
        raise AppError(422, "날짜는 YYYY-MM-DD 형식으로 보내 주세요", code="invalid_date") from exc
    start = datetime.combine(day, time.min, tzinfo=KST).astimezone(UTC)
    return start, start + timedelta(days=1)


@transaction()
def list_logs(
    db: Session, user: User, type: str | None, date: str | None, order: str, limit: int
) -> list[DecisionItem]:
    park = _park(db, user)
    statement = select(AgentStep).join(AgentRun, AgentStep.run_id == AgentRun.id).where(AgentRun.park_id == park.id)
    if type:
        statement = statement.where(AgentStep.step_type == type)
    if date:
        start, end = _day_range(date)
        # SQLite는 시간대 없이 저장하므로 비교 값도 시간대를 빼요
        if db.get_bind().dialect.name == "sqlite":
            start, end = start.replace(tzinfo=None), end.replace(tzinfo=None)
        statement = statement.where(AgentStep.created_at >= start, AgentStep.created_at < end)
    column = AgentStep.created_at.asc() if order == "asc" else AgentStep.created_at.desc()
    steps = db.scalars(statement.order_by(column, AgentStep.id).limit(limit))
    return [_item(step) for step in steps]


@transaction()
def get_log(db: Session, user: User, log_id: int) -> DecisionDetail:
    park = _park(db, user)
    step = db.scalar(
        select(AgentStep)
        .join(AgentRun, AgentStep.run_id == AgentRun.id)
        .where(AgentStep.id == log_id, AgentRun.park_id == park.id)
    )
    if step is None:
        raise AppError(404, "판단 기록을 찾을 수 없어요", code="log_not_found")
    return _detail(step, db)
