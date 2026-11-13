"""관리자 계정을 저장해요 (DB 설계서 v0.3, 4.1 users)."""

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Identity, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    """로그인 정보와 총관리자·하위관리자 역할을 관리해요."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('super_admin', 'manager')", name="user_role"),)

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), Identity(always=True), primary_key=True
    )
    login_id: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    role: Mapped[str] = mapped_column(Text, server_default="manager")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
