"""DB 설계서 v0.3에 맞춰 관리자 계정 테이블을 만들어요."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261112_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """관리자 계정과 기본값·유일 제약을 만들어요."""
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("login_id", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phone", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("route_setup_done", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("login_id", name=op.f("uq_users_login_id")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    # 앱은 FastAPI를 거쳐요. 공개 Data API로 계정 정보가 노출되지 않게 막아요.
    op.execute("ALTER TABLE users ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    """관리자 계정 테이블을 제거해요. 저장된 계정도 삭제돼요."""
    op.drop_table("users")
