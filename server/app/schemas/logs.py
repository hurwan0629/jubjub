"""판단 로그 계약이에요 (A-08 · A-09 · 홈 "에이전트가 방금 한 일"). 앱 api/types.ts의 Decision · DecisionDetailResponse와 같아요."""

from typing import Literal

from pydantic import Field

from app.schemas.parks import ParkSchema

DecisionType = Literal["plan", "recapture", "pick", "store", "empty", "notify", "route", "teleop", "report"]
DECISION_TYPES: tuple[str, ...] = DecisionType.__args__


class DecisionItem(ParkSchema):
    id: str
    type: DecisionType
    time: str = Field(description="한국 시각 HH:mm")
    title: str
    summary: str
    details: list[str]
    photo_url: str | None = None


class Tone(ParkSchema):
    text: str
    tone: Literal["brand", "warn", "body"]


class Shot(ParkSchema):
    photo_url: str | None = None
    caption: str
    highlight: bool = False


class Fact(ParkSchema):
    label: str
    value: str


class Box(ParkSchema):
    title: str
    body: str


class InfoCard(ParkSchema):
    title: str
    lines: list[str] = Field(default_factory=list)
    emphasis: str | None = None


class DecisionDetail(DecisionItem):
    happened_at: str
    heading: str | None = None
    tag: str | None = None
    kicker: Tone | None = None
    headline: Tone | None = None
    photo_slot: bool = False
    shots: list[Shot] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    reason: str | None = None
    boxes: list[Box] = Field(default_factory=list)
    cards: list[InfoCard] = Field(default_factory=list)
    footer: str | None = None
