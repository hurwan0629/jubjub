"""관리 공원·순찰 설정과 경로 변경 로그를 만들어요."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261113_0003"
down_revision = "20261112_0002"
branch_labels = None
depends_on = None


def identity():
    return sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True)


def timestamp(name="created_at", nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable, server_default=None if nullable else sa.func.now())


def upgrade():
    op.create_table(
        "parks", identity(),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False, unique=True),
        sa.Column("catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        timestamp(),
    )
    op.create_table(
        "points", identity(),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False), sa.Column("type", sa.Text(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False), sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("slam_x", sa.Float()), sa.Column("slam_y", sa.Float()), timestamp(), timestamp("deleted_at", True),
        sa.CheckConstraint("type IN ('patrol', 'station', 'charger', 'bin')", name=op.f("ck_points_point_type")),
        sa.CheckConstraint("lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name=op.f("ck_points_point_coordinates")),
    )
    op.create_index("ix_points_park_id", "points", ["park_id"])
    op.create_index("uq_points_live_station", "points", ["park_id"], unique=True,
                    postgresql_where=sa.text("type = 'station' AND deleted_at IS NULL"))
    op.create_table(
        "routes", identity(),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        # 버전별 출발·종료 위치를 고정해 과거 경로를 보존해요.
        sa.Column("station_id", sa.BigInteger(), sa.ForeignKey("points.id"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id")), timestamp(), timestamp("applied_at", True),
    )
    op.create_index("uq_routes_active_park", "routes", ["park_id"], unique=True, postgresql_where=sa.text("is_active"))
    op.create_table(
        "route_points",
        sa.Column("route_id", sa.BigInteger(), sa.ForeignKey("routes.id"), primary_key=True),
        sa.Column("seq", sa.SmallInteger(), primary_key=True),
        sa.Column("point_id", sa.BigInteger(), sa.ForeignKey("points.id"), nullable=False),
        sa.UniqueConstraint("route_id", "point_id"),
        sa.CheckConstraint("seq >= 0", name=op.f("ck_route_points_route_sequence")),
    )
    op.create_table(
        "schedules", identity(),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("run_at", sa.Time(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False), sa.Column("repeat", sa.Text(), nullable=False),
        sa.UniqueConstraint("park_id", "run_at", "repeat"),
        sa.CheckConstraint("repeat IN ('daily', 'weekdays', 'weekends')", name=op.f("ck_schedules_schedule_repeat")),
    )
    op.create_index("ix_schedules_park_id", "schedules", ["park_id"])
    op.create_table(
        "agent_runs", identity(),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("trigger", sa.Text(), nullable=False), sa.Column("status", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False), sa.Column("result", sa.Text(), nullable=False),
        timestamp("started_at"), timestamp("ended_at", True),
    )
    op.create_index("ix_agent_runs_park_id", "agent_runs", ["park_id"])
    op.create_table(
        "agent_steps", identity(),
        sa.Column("run_id", sa.BigInteger(), sa.ForeignKey("agent_runs.id"), nullable=False),
        sa.Column("step_type", sa.Text(), nullable=False), sa.Column("title", sa.Text(), nullable=False),
        sa.Column("details", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("input", postgresql.JSONB(), nullable=False), sa.Column("output", postgresql.JSONB(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False), sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("tool", sa.Text(), nullable=False), timestamp(),
    )
    op.create_index("ix_agent_steps_created_at", "agent_steps", ["created_at"])
    for table in ("parks", "points", "routes", "route_points", "schedules", "agent_runs", "agent_steps"):
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))


def downgrade():
    for table in ("agent_steps", "agent_runs", "schedules", "route_points", "routes", "points", "parks"):
        op.drop_table(table)
