"""기본 분리수거장 선택을 활성 경로의 참조로 통일해요."""

import sqlalchemy as sa
from alembic import op

revision = "20261120_0014"
down_revision = "20261119_0013"
branch_labels = None
depends_on = None


def upgrade():
    # 확인 이후 선택이 바뀌지 않게 삭제까지 같은 트랜잭션에서 잠가요.
    op.execute("LOCK TABLE routes, recycling_stations, station_selections IN ACCESS EXCLUSIVE MODE")
    op.execute(
        sa.text("""
        DO $$ BEGIN
          IF EXISTS (
            SELECT 1 FROM station_selections ss
            WHERE NOT EXISTS (
              SELECT 1 FROM routes r
              JOIN recycling_stations s ON s.id = r.default_station_id
              WHERE r.park_id = ss.park_id
                AND r.robot_id IS NOT DISTINCT FROM ss.robot_id
                AND r.is_active
                AND r.default_station_id = ss.station_id
                AND s.park_id = ss.park_id AND s.deleted_at IS NULL
            )
          ) THEN
            RAISE EXCEPTION 'Resolve station selections into active routes before upgrading';
          END IF;
        END $$;
    """)
    )
    op.drop_table("station_selections")


def downgrade():
    op.execute("LOCK TABLE routes, recycling_stations IN ACCESS EXCLUSIVE MODE")
    op.create_table(
        "station_selections",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("robot_id", sa.BigInteger(), sa.ForeignKey("robots.id"), nullable=True),
        sa.Column("station_id", sa.BigInteger(), sa.ForeignKey("recycling_stations.id"), nullable=False),
    )
    op.create_index("ix_station_selections_station_id", "station_selections", ["station_id"])
    op.create_index(
        "uq_station_selections_robot",
        "station_selections",
        ["park_id", "robot_id"],
        unique=True,
        postgresql_where=sa.text("robot_id IS NOT NULL"),
    )
    op.create_index(
        "uq_station_selections_draft",
        "station_selections",
        ["park_id"],
        unique=True,
        postgresql_where=sa.text("robot_id IS NULL"),
    )
    op.execute(
        sa.text("""
        INSERT INTO station_selections (park_id, robot_id, station_id)
        SELECT r.park_id, r.robot_id, r.default_station_id FROM routes r
        JOIN recycling_stations s ON s.id = r.default_station_id
        WHERE r.is_active AND s.park_id = r.park_id AND s.deleted_at IS NULL;
    """)
    )
    op.execute("ALTER TABLE station_selections ENABLE ROW LEVEL SECURITY")
