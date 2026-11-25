"""공원 공용 경로·시간표를 로봇별로 분리하고 기존 설정을 보존해요."""

import sqlalchemy as sa
from alembic import op

revision = "20261117_0005"
down_revision = "20261113_0004"
branch_labels = None
depends_on = None


def upgrade():
    for table in ("routes", "schedules"):
        op.add_column(table, sa.Column("robot_id", sa.BigInteger(), nullable=True))
        op.create_foreign_key(op.f(f"fk_{table}_robot_id_robots"), table, "robots", ["robot_id"], ["id"])
        op.create_index(f"ix_{table}_robot_id", table, ["robot_id"])
    op.drop_index("uq_routes_active_park", table_name="routes")
    op.drop_constraint(op.f("uq_schedules_park_id"), "schedules", type_="unique")
    # 기존 이력은 첫 로봇에 연결하고, 나머지 로봇에는 지점까지 독립적으로 복제해요.
    # 로봇 없는 공원은 NULL인 초기 설정으로 보존해요.
    op.execute(sa.text("""
DO $$
DECLARE
    source_route RECORD;
    source_point RECORD;
    target_robot BIGINT;
    first_robot BIGINT;
    new_route BIGINT;
    new_point BIGINT;
BEGIN
    FOR source_route IN SELECT * FROM routes WHERE robot_id IS NULL ORDER BY id LOOP
        SELECT min(id) INTO first_robot FROM robots WHERE park_id = source_route.park_id;
        IF first_robot IS NULL THEN CONTINUE; END IF;
        UPDATE routes SET robot_id = first_robot WHERE id = source_route.id;
        FOR target_robot IN SELECT id FROM robots WHERE park_id = source_route.park_id AND id <> first_robot LOOP
            INSERT INTO routes (park_id, robot_id, station_id, is_active, created_by, created_at, applied_at)
            VALUES (source_route.park_id, target_robot, source_route.station_id, source_route.is_active,
                    source_route.created_by, source_route.created_at, source_route.applied_at)
            RETURNING id INTO new_route;
            FOR source_point IN
                SELECT p.*, rp.seq FROM route_points rp JOIN points p ON p.id = rp.point_id
                WHERE rp.route_id = source_route.id ORDER BY rp.seq
            LOOP
                INSERT INTO points (park_id, name, type, lat, lng, slam_x, slam_y, created_at, deleted_at)
                VALUES (source_point.park_id, source_point.name, source_point.type, source_point.lat,
                        source_point.lng, source_point.slam_x, source_point.slam_y,
                        source_point.created_at, source_point.deleted_at)
                RETURNING id INTO new_point;
                INSERT INTO route_points (route_id, seq, point_id) VALUES (new_route, source_point.seq, new_point);
            END LOOP;
        END LOOP;
    END LOOP;
    INSERT INTO schedules (park_id, robot_id, run_at, enabled, label, repeat)
    SELECT s.park_id, r.id, s.run_at, s.enabled, s.label, s.repeat
    FROM schedules s JOIN robots r ON r.park_id = s.park_id
    WHERE s.robot_id IS NULL AND r.id <> (SELECT min(id) FROM robots WHERE park_id = s.park_id);
    UPDATE schedules s SET robot_id = (SELECT min(id) FROM robots WHERE park_id = s.park_id)
    WHERE s.robot_id IS NULL;
END $$;
"""))
    op.create_index("uq_routes_active_robot", "routes", ["park_id", "robot_id"], unique=True,
                    postgresql_where=sa.text("is_active AND robot_id IS NOT NULL"))
    op.create_index("uq_routes_active_draft", "routes", ["park_id"], unique=True,
                    postgresql_where=sa.text("is_active AND robot_id IS NULL"))
    op.create_unique_constraint(op.f("uq_schedules_park_id"), "schedules", ["park_id", "robot_id", "run_at", "repeat"])
    op.create_index("uq_schedules_draft", "schedules", ["park_id", "run_at", "repeat"], unique=True,
                    postgresql_where=sa.text("robot_id IS NULL"))


def downgrade():
    # 로봇별 설정을 하나로 합치면서 데이터를 잃지 않도록 충돌 시 되돌리기를 거부해요.
    op.execute(sa.text("""
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM routes WHERE is_active GROUP BY park_id HAVING count(*) > 1)
       OR EXISTS (SELECT 1 FROM schedules GROUP BY park_id, run_at, repeat HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'Cannot downgrade multiple robot configurations; export and consolidate them first';
    END IF;
END $$;
"""))
    op.drop_index("uq_schedules_draft", table_name="schedules")
    op.drop_constraint(op.f("uq_schedules_park_id"), "schedules", type_="unique")
    op.create_unique_constraint(op.f("uq_schedules_park_id"), "schedules", ["park_id", "run_at", "repeat"])
    op.drop_index("uq_routes_active_robot", table_name="routes")
    op.drop_index("uq_routes_active_draft", table_name="routes")
    op.create_index("uq_routes_active_park", "routes", ["park_id"], unique=True,
                    postgresql_where=sa.text("is_active"))
    for table in ("schedules", "routes"):
        op.drop_index(f"ix_{table}_robot_id", table_name=table)
        op.drop_constraint(op.f(f"fk_{table}_robot_id_robots"), table, type_="foreignkey")
        op.drop_column(table, "robot_id")
