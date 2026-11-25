"""현재 DB 확정 사항에 맞춰 순찰 지점과 공원 처리 기록을 정리해요."""

import sqlalchemy as sa
from alembic import op

revision = "20261119_0013"
down_revision = "20261118_0012"
branch_labels = None
depends_on = None


def upgrade():
    # 이전 도중 설정이 바뀌지 않게 관련 테이블을 잠가요.
    op.execute("LOCK TABLE parks, robots, points, routes, route_points, recycling_stations, station_selections IN ACCESS EXCLUSIVE MODE")
    op.execute(sa.text("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM points WHERE type IN ('charger','bin')) THEN
            RAISE EXCEPTION 'Resolve legacy charger/bin points before upgrading';
          END IF;
          IF EXISTS (SELECT 1 FROM route_points rp JOIN points p ON p.id=rp.point_id WHERE p.type <> 'patrol') THEN
            RAISE EXCEPTION 'Resolve non-patrol route_points before upgrading';
          END IF;
          IF EXISTS (SELECT 1 FROM routes r LEFT JOIN points p ON p.id=r.station_id
                     WHERE r.default_station_id IS NULL AND (p.id IS NULL OR p.type <> 'station' OR p.park_id <> r.park_id)) THEN
            RAISE EXCEPTION 'Cannot resolve legacy route station';
          END IF;
          IF EXISTS (SELECT 1 FROM routes r JOIN recycling_stations s ON s.id=r.default_station_id WHERE r.park_id <> s.park_id) THEN
            RAISE EXCEPTION 'Route station belongs to another park';
          END IF;
        END $$;
    """))
    # 0012 이후 생긴 스냅샷은 points ID와 분리수거장 ID가 다를 수 있어요.
    # 기존 default_station_id는 유지하고 빠진 참조만 공원·좌표로 연결해요.
    op.execute(sa.text("""
        SELECT setval(pg_get_serial_sequence('recycling_stations','id'),
                      COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM recycling_stations;
        CREATE TEMP TABLE legacy_station_map (point_id bigint PRIMARY KEY, station_id bigint NOT NULL) ON COMMIT DROP;
        DO $$ DECLARE p record; target_id bigint; BEGIN
          FOR p IN SELECT * FROM points WHERE type='station' ORDER BY id LOOP
            SELECT s.id INTO target_id FROM recycling_stations s
            WHERE s.park_id=p.park_id AND s.lat=p.lat AND s.lng=p.lng
              AND (s.deleted_at IS NULL) = (p.deleted_at IS NULL)
            ORDER BY s.id LIMIT 1;
            IF target_id IS NULL THEN
              INSERT INTO recycling_stations (park_id,name,lat,lng,created_at,updated_at,deleted_at)
              VALUES (p.park_id,p.name,p.lat,p.lng,p.created_at,p.created_at,p.deleted_at)
              RETURNING id INTO target_id;
            END IF;
            INSERT INTO legacy_station_map VALUES (p.id,target_id);
          END LOOP;
        END $$;
        UPDATE routes r SET default_station_id=m.station_id
        FROM legacy_station_map m WHERE r.station_id=m.point_id AND r.default_station_id IS NULL;
        INSERT INTO station_selections (park_id,robot_id,station_id)
        SELECT r.park_id,r.robot_id,r.default_station_id FROM routes r
        JOIN recycling_stations s ON s.id=r.default_station_id
        WHERE r.is_active AND s.deleted_at IS NULL AND NOT EXISTS
          (SELECT 1 FROM station_selections ss WHERE ss.park_id=r.park_id AND ss.robot_id IS NOT DISTINCT FROM r.robot_id);
    """))
    op.alter_column("routes", "default_station_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_constraint(op.f("fk_routes_station_id_points"), "routes", type_="foreignkey")
    op.drop_column("routes", "station_id")
    op.execute("DELETE FROM points WHERE type = 'station'")
    op.drop_constraint(op.f("ck_points_point_type"), "points", type_="check")
    op.drop_column("points", "type")

    op.execute("UPDATE robots SET status = 'idle' WHERE status = 'charging'")
    op.drop_constraint(op.f("ck_robots_robot_status"), "robots", type_="check")
    op.create_check_constraint(op.f("ck_robots_robot_status"), "robots", "status IN ('working','emptying','idle','error','offline')")

    op.drop_constraint(op.f("ck_parks_park_review_metadata"), "parks", type_="check")
    op.alter_column("parks", "approved_by", new_column_name="reviewed_by", existing_type=sa.BigInteger())
    op.alter_column("parks", "approved_at", new_column_name="reviewed_at", existing_type=sa.DateTime(timezone=True))
    op.execute("ALTER TABLE parks RENAME CONSTRAINT fk_parks_approved_by_users TO fk_parks_reviewed_by_users")
    # 과거 반려에는 처리자 기록이 없으므로 NULL 쌍을 보존해요. 새 처리는 API에서 두 값을 기록해요.
    op.create_check_constraint(
        op.f("ck_parks_park_review_metadata"), "parks",
        "(status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reject_reason IS NULL) OR "
        "(status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL) OR "
        "(status = 'rejected' AND ((reviewed_by IS NULL AND reviewed_at IS NULL) OR "
        "(reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)) AND length(trim(reject_reason)) > 0 AND reject_reason IS NOT NULL)",
    )


def downgrade():
    # 이전 스키마가 표현할 수 없는 반려 처리 기록을 버리지 않아요.
    op.execute(sa.text("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM parks WHERE status='rejected' AND reviewed_by IS NOT NULL) THEN
            RAISE EXCEPTION 'Cannot downgrade while rejected park review metadata exists';
          END IF;
        END $$;
    """))
    op.drop_constraint(op.f("ck_parks_park_review_metadata"), "parks", type_="check")
    op.alter_column("parks", "reviewed_by", new_column_name="approved_by", existing_type=sa.BigInteger())
    op.alter_column("parks", "reviewed_at", new_column_name="approved_at", existing_type=sa.DateTime(timezone=True))
    op.execute("ALTER TABLE parks RENAME CONSTRAINT fk_parks_reviewed_by_users TO fk_parks_approved_by_users")
    op.create_check_constraint(
        op.f("ck_parks_park_review_metadata"), "parks",
        "(status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND reject_reason IS NULL) OR "
        "(status = 'pending' AND approved_by IS NULL AND approved_at IS NULL AND reject_reason IS NULL) OR "
        "(status = 'rejected' AND approved_by IS NULL AND approved_at IS NULL AND length(trim(reject_reason)) > 0 AND reject_reason IS NOT NULL)",
    )
    op.drop_constraint(op.f("ck_robots_robot_status"), "robots", type_="check")
    op.create_check_constraint(op.f("ck_robots_robot_status"), "robots", "status IN ('idle','working','emptying','charging','offline','error')")
    op.add_column("points", sa.Column("type", sa.Text(), server_default="patrol", nullable=False))
    op.alter_column("points", "type", server_default=None)
    op.create_check_constraint(op.f("ck_points_point_type"), "points", "type IN ('patrol','station','charger','bin')")
    op.add_column("routes", sa.Column("station_id", sa.BigInteger(), nullable=True))
    op.execute(sa.text("""
        SELECT setval(pg_get_serial_sequence('points','id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM points;
        DO $$ DECLARE r record; point_id bigint; BEGIN
          FOR r IN SELECT routes.id AS route_id, s.* FROM routes
                   JOIN recycling_stations s ON s.id=routes.default_station_id LOOP
            INSERT INTO points (park_id,name,type,lat,lng,created_at,deleted_at)
            VALUES (r.park_id,r.name,'station',r.lat,r.lng,r.created_at,r.deleted_at) RETURNING id INTO point_id;
            UPDATE routes SET station_id=point_id WHERE id=r.route_id;
          END LOOP;
        END $$;
    """))
    op.alter_column("routes", "station_id", existing_type=sa.BigInteger(), nullable=False)
    op.create_foreign_key(op.f("fk_routes_station_id_points"), "routes", "points", ["station_id"], ["id"])
    op.alter_column("routes", "default_station_id", existing_type=sa.BigInteger(), nullable=True)
