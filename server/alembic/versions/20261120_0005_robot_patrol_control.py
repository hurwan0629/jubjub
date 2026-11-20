"""로봇 순찰 제어 상태·최근 상태 값과 로봇 배정 요청 테이블을 추가해요 (A-01 순찰 멈추기 · A-13 로봇 목록)."""

import sqlalchemy as sa
from alembic import op

revision = "20261120_0005"
down_revision = "20261113_0004"
branch_labels = None
depends_on = None

ROBOT_COLUMNS = ("remaining_points", "next_point", "near_point", "battery", "paused_at", "patrol_state")


def upgrade():
    op.add_column("robots", sa.Column("patrol_state", sa.Text(), nullable=True))
    op.add_column("robots", sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("robots", sa.Column("battery", sa.SmallInteger(), nullable=True))
    op.add_column("robots", sa.Column("near_point", sa.Text(), nullable=True))
    op.add_column("robots", sa.Column("next_point", sa.Text(), nullable=True))
    op.add_column("robots", sa.Column("remaining_points", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_robots_robot_patrol_state"),
        "robots",
        "patrol_state IS NULL OR patrol_state IN ('patrolling', 'paused', 'returning')",
    )
    op.create_check_constraint(op.f("ck_robots_robot_battery"), "robots", "battery IS NULL OR battery BETWEEN 0 AND 100")
    # 이미 순찰 중인 로봇은 '순찰 중'으로 시작해요.
    op.execute("UPDATE robots SET patrol_state = 'patrolling' WHERE status = 'working'")

    op.create_table(
        "robot_requests",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("requested_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("count", sa.SmallInteger(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'canceled')", name=op.f("ck_robot_requests_robot_request_status")
        ),
        sa.CheckConstraint("count BETWEEN 1 AND 5", name=op.f("ck_robot_requests_robot_request_count")),
    )
    op.create_index("ix_robot_requests_park_id", "robot_requests", ["park_id"])
    op.create_index(
        "uq_robot_requests_pending_park",
        "robot_requests",
        ["park_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.execute("ALTER TABLE robot_requests ENABLE ROW LEVEL SECURITY")


def downgrade():
    op.drop_index("uq_robot_requests_pending_park", table_name="robot_requests")
    op.drop_index("ix_robot_requests_park_id", table_name="robot_requests")
    op.drop_table("robot_requests")
    op.drop_constraint(op.f("ck_robots_robot_battery"), "robots", type_="check")
    op.drop_constraint(op.f("ck_robots_robot_patrol_state"), "robots", type_="check")
    for column in ROBOT_COLUMNS:
        op.drop_column("robots", column)
