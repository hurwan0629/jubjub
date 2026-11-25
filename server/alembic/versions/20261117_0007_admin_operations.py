"""공원 변경 신청과 장소별 일일 보고를 추가해요."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "20261117_0007"
down_revision = "20261117_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "park_change_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("to_catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('pending','approved','rejected','cancelled')", name=op.f("ck_park_change_requests_park_change_status")),
        sa.CheckConstraint("from_catalog_id <> to_catalog_id", name=op.f("ck_park_change_requests_park_change_distinct")),
    )
    op.create_index("ix_park_change_requests_park_id", "park_change_requests", ["park_id"])
    op.create_index("ix_park_change_requests_user_id", "park_change_requests", ["user_id"])
    op.create_index("uq_park_changes_pending", "park_change_requests", ["park_id"], unique=True,
                    postgresql_where=sa.text("status = 'pending'"))
    op.create_table(
        "daily_reports",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("catalog_id", "date", name=op.f("uq_daily_reports_catalog_id")),
    )
    op.create_index("ix_daily_reports_park_id", "daily_reports", ["park_id"])
    op.create_index("ix_daily_reports_catalog_id", "daily_reports", ["catalog_id"])
    for table in ("park_change_requests", "daily_reports"):
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))


def downgrade():
    op.drop_table("daily_reports")
    op.drop_table("park_change_requests")
