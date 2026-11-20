"""분리수거장을 공원마다 여러 곳 둘 수 있게 하고, 로봇마다 비우러 가는 분리수거장을 정해요 (C-02 분리수거장 관리)."""

import sqlalchemy as sa
from alembic import op

revision = "20261120_0007"
down_revision = "20261120_0006"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("uq_points_live_station", table_name="points")
    op.add_column("robots", sa.Column("station_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(op.f("fk_robots_station_id_points"), "robots", "points", ["station_id"], ["id"])


def downgrade():
    op.drop_constraint(op.f("fk_robots_station_id_points"), "robots", type_="foreignkey")
    op.drop_column("robots", "station_id")
    # 여러 곳이 남아 있으면 되돌리기 전에 정리해야 해요 (기본 분리수거장만 남기기)
    op.create_index(
        "uq_points_live_station",
        "points",
        ["park_id"],
        unique=True,
        postgresql_where=sa.text("type = 'station' AND deleted_at IS NULL"),
    )
