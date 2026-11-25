"""현재 DB 문서의 공원 기준점과 로봇 위치·전압·수신 시각 컬럼을 추가해요."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "20261117_0006"
down_revision = "20261117_0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("parks", sa.Column("anchor_points", postgresql.JSONB(), nullable=False,
                                    server_default=sa.text("'[]'")))
    for name in ("slam_x", "slam_y", "lat", "lng"):
        op.add_column("robots", sa.Column(name, sa.Double(), nullable=True))
    op.add_column("robots", sa.Column("battery_voltage", sa.REAL(), nullable=True))
    op.add_column("robots", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.drop_constraint(op.f("ck_robots_robot_status"), "robots", type_="check")
    op.create_check_constraint(op.f("ck_robots_robot_status"), "robots",
                               "status IN ('idle', 'working', 'emptying', 'charging', 'offline', 'error')")


def downgrade():
    # 새 상태를 구 버전의 임의 상태로 바꾸지 않고 명시적으로 정리하도록 해요.
    op.execute(sa.text("""
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM robots WHERE status = 'emptying') THEN
        RAISE EXCEPTION 'Cannot downgrade while a robot is emptying';
    END IF;
END $$;
"""))
    op.drop_constraint(op.f("ck_robots_robot_status"), "robots", type_="check")
    op.create_check_constraint(op.f("ck_robots_robot_status"), "robots",
                               "status IN ('idle', 'working', 'charging', 'offline', 'error')")
    for name in ("last_seen_at", "battery_voltage", "lng", "lat", "slam_y", "slam_x"):
        op.drop_column("robots", name)
    op.drop_column("parks", "anchor_points")
