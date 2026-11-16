"""총관리자 역할·공원 승인·로봇 할당을 추가하고 설정 완료 상태를 이전해요."""

import sqlalchemy as sa
from alembic import op

revision = "20261113_0004"
down_revision = "20261113_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("role", sa.Text(), server_default="manager", nullable=False))
    op.create_check_constraint(op.f("ck_users_user_role"), "users", "role IN ('super_admin', 'manager')")
    op.add_column("parks", sa.Column("status", sa.Text(), server_default="pending", nullable=False))
    op.add_column("parks", sa.Column("approved_by", sa.BigInteger(), nullable=True))
    op.add_column("parks", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parks", sa.Column("reject_reason", sa.Text(), nullable=True))
    op.add_column("parks", sa.Column("route_setup_done", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_foreign_key(op.f("fk_parks_approved_by_users"), "parks", "users", ["approved_by"], ["id"])
    op.create_check_constraint(op.f("ck_parks_park_status"), "parks", "status IN ('pending', 'approved', 'rejected')")
    op.create_check_constraint(op.f("ck_parks_park_review_metadata"), "parks",
        "(status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND reject_reason IS NULL) OR "
        "(status = 'pending' AND approved_by IS NULL AND approved_at IS NULL AND reject_reason IS NULL) OR "
        "(status = 'rejected' AND approved_by IS NULL AND approved_at IS NULL AND length(trim(reject_reason)) > 0 AND reject_reason IS NOT NULL)")
    op.create_index("uq_parks_approved_catalog", "parks", ["catalog_id"], unique=True, postgresql_where=sa.text("status = 'approved'"))
    # 기존 완료 값을 공원으로 복사한 다음 사용자 쪽 컬럼을 제거해요.
    op.execute("UPDATE parks SET route_setup_done = users.route_setup_done FROM users WHERE parks.user_id = users.id")
    op.drop_column("users", "route_setup_done")
    op.create_table(
        "robots",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("serial_no", sa.Text(), nullable=False, unique=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=True),
        sa.Column("status", sa.Text(), server_default="offline", nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('idle', 'working', 'charging', 'offline', 'error')", name=op.f("ck_robots_robot_status")),
        sa.CheckConstraint("(park_id IS NULL AND assigned_at IS NULL) OR (park_id IS NOT NULL AND assigned_at IS NOT NULL)", name=op.f("ck_robots_robot_assignment")),
    )
    op.create_index("ix_robots_park_id", "robots", ["park_id"])
    op.execute("ALTER TABLE robots ENABLE ROW LEVEL SECURITY")
    op.add_column("agent_runs", sa.Column("robot_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(op.f("fk_agent_runs_robot_id_robots"), "agent_runs", "robots", ["robot_id"], ["id"])
    op.create_index("ix_agent_runs_robot_id", "agent_runs", ["robot_id"])


def downgrade():
    op.drop_index("ix_agent_runs_robot_id", table_name="agent_runs")
    op.drop_constraint(op.f("fk_agent_runs_robot_id_robots"), "agent_runs", type_="foreignkey")
    op.drop_column("agent_runs", "robot_id")
    op.drop_table("robots")
    op.add_column("users", sa.Column("route_setup_done", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE users SET route_setup_done = parks.route_setup_done FROM parks WHERE parks.user_id = users.id")
    op.drop_index("uq_parks_approved_catalog", table_name="parks")
    op.drop_constraint(op.f("ck_parks_park_review_metadata"), "parks", type_="check")
    op.drop_constraint(op.f("ck_parks_park_status"), "parks", type_="check")
    op.drop_constraint(op.f("fk_parks_approved_by_users"), "parks", type_="foreignkey")
    for column in ("route_setup_done", "reject_reason", "approved_at", "approved_by", "status"):
        op.drop_column("parks", column)
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.drop_column("users", "role")
