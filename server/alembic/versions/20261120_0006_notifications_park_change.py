"""알림(A-05 · A-06) · 공원 변경 요청(C-02) 테이블과 운영 설정(A-12) · 알림 설정(C-02) 컬럼을 추가해요."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261120_0006"
down_revision = "20261120_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("parks", sa.Column("charge_at", sa.SmallInteger(), server_default=sa.text("20"), nullable=False))
    op.add_column("parks", sa.Column("empty_at", sa.SmallInteger(), server_default=sa.text("80"), nullable=False))
    op.add_column("parks", sa.Column("agent_paused", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("notify_unpickable", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.add_column("users", sa.Column("notify_daily_report", sa.Boolean(), server_default=sa.true(), nullable=False))

    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), server_default="new", nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("place", sa.Text(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("pinned", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "type IN ('robotError', 'unpickable', 'lowBattery', 'dailyReport', 'parkChange')",
            name=op.f("ck_notifications_notification_type"),
        ),
        sa.CheckConstraint("status IN ('new', 'acked', 'resolved')", name=op.f("ck_notifications_notification_status")),
    )
    op.create_index("ix_notifications_park_created", "notifications", ["park_id", "created_at"])
    op.execute("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY")

    op.create_table(
        "park_change_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("from_catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("to_catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("reason_kind", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("resolved_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'canceled')",
            name=op.f("ck_park_change_requests_park_change_request_status"),
        ),
    )
    op.create_index("ix_park_change_requests_park_id", "park_change_requests", ["park_id"])
    op.create_index(
        "uq_park_change_requests_pending_park",
        "park_change_requests",
        ["park_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.execute("ALTER TABLE park_change_requests ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_index("uq_park_change_requests_pending_park", table_name="park_change_requests")
    op.drop_index("ix_park_change_requests_park_id", table_name="park_change_requests")
    op.drop_table("park_change_requests")
    op.drop_index("ix_notifications_park_created", table_name="notifications")
    op.drop_table("notifications")
    op.drop_column("users", "notify_daily_report")
    op.drop_column("users", "notify_unpickable")
    for column in ("agent_paused", "empty_at", "charge_at"):
        op.drop_column("parks", column)
