"""로봇 통신 설계 v27에 맞춰 상태와 활동 기록을 분리해요."""

from alembic import op
import sqlalchemy as sa

revision = "20261123_0015"
down_revision = "20261120_0014"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute("LOCK TABLE robots, robot_tasks, detections IN ACCESS EXCLUSIVE MODE")
    # 기존 탐지를 임의의 순찰이나 UUID에 연결하지 않아요.
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM detections) THEN
        RAISE EXCEPTION 'Resolve legacy detections task/UUID/confidence before upgrading';
      END IF;
    END $$""")
    op.execute("""
    CREATE TABLE robot_states (
        robot_id BIGINT NOT NULL,
        status TEXT DEFAULT 'offline' NOT NULL,
        slam_x DOUBLE PRECISION,
        slam_y DOUBLE PRECISION,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        battery_voltage REAL,
        last_seen_at TIMESTAMP WITH TIME ZONE,
        slam_yaw DOUBLE PRECISION,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_robot_states PRIMARY KEY (robot_id),
        CONSTRAINT ck_robot_states_robot_state_status CHECK (status IN ('idle','working','returning','emptying','offline','error')),
        CONSTRAINT fk_robot_states_robot_id_robots FOREIGN KEY(robot_id) REFERENCES robots (id) ON DELETE CASCADE
    )
    """)
    op.execute("ALTER TABLE robot_states ENABLE ROW LEVEL SECURITY")
    op.execute("""
    CREATE TABLE robot_task_points (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        task_id BIGINT NOT NULL,
        seq SMALLINT NOT NULL,
        point_id BIGINT NOT NULL,
        result TEXT NOT NULL,
        reason TEXT,
        occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT pk_robot_task_points PRIMARY KEY (id),
        CONSTRAINT uq_robot_task_points_task_id UNIQUE (task_id, seq),
        CONSTRAINT ck_robot_task_points_task_point_sequence CHECK (seq >= 0),
        CONSTRAINT ck_robot_task_points_task_point_result CHECK (result IN ('arrived','skipped')),
        CONSTRAINT ck_robot_task_points_task_point_reason CHECK ((result = 'arrived' AND reason IS NULL) OR (result = 'skipped' AND reason IS NOT NULL AND length(trim(reason)) > 0)),
        CONSTRAINT fk_robot_task_points_task_id_robot_tasks FOREIGN KEY(task_id) REFERENCES robot_tasks (id),
        CONSTRAINT fk_robot_task_points_point_id_points FOREIGN KEY(point_id) REFERENCES points (id)
    )
    """)
    op.execute("CREATE INDEX ix_robot_task_points_point_id ON robot_task_points (point_id)")
    op.execute("ALTER TABLE robot_task_points ENABLE ROW LEVEL SECURITY")
    op.execute("""
    CREATE TABLE robot_errors (
        id BIGINT GENERATED ALWAYS AS IDENTITY,
        park_id BIGINT NOT NULL,
        robot_id BIGINT NOT NULL,
        task_id BIGINT,
        code TEXT NOT NULL,
        action TEXT NOT NULL,
        slam_x DOUBLE PRECISION NOT NULL,
        slam_y DOUBLE PRECISION NOT NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        detail TEXT,
        occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT pk_robot_errors PRIMARY KEY (id),
        CONSTRAINT ck_robot_errors_robot_error_code CHECK (code IN ('path_blocked','pick_failed_repeatedly','low_battery','return_failed','device_failure')),
        CONSTRAINT ck_robot_errors_robot_error_action CHECK (action IN ('returning','stopped')),
        CONSTRAINT ck_robot_errors_robot_error_coordinates CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180),
        CONSTRAINT fk_robot_errors_park_id_parks FOREIGN KEY(park_id) REFERENCES parks (id),
        CONSTRAINT fk_robot_errors_robot_id_robots FOREIGN KEY(robot_id) REFERENCES robots (id),
        CONSTRAINT fk_robot_errors_task_id_robot_tasks FOREIGN KEY(task_id) REFERENCES robot_tasks (id)
    )
    """)
    op.execute("CREATE INDEX ix_robot_errors_park_time ON robot_errors (park_id, occurred_at)")
    op.execute("CREATE INDEX ix_robot_errors_robot_time ON robot_errors (robot_id, occurred_at)")
    op.execute("CREATE INDEX ix_robot_errors_task_id ON robot_errors (task_id)")
    op.execute("ALTER TABLE robot_errors ENABLE ROW LEVEL SECURITY")
    op.execute("""
    CREATE TABLE robot_message_receipts (
        robot_id BIGINT NOT NULL,
        message_id TEXT NOT NULL,
        message_type TEXT NOT NULL,
        received_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        CONSTRAINT pk_robot_message_receipts PRIMARY KEY (robot_id, message_id),
        CONSTRAINT fk_robot_message_receipts_robot_id_robots FOREIGN KEY(robot_id) REFERENCES robots (id)
    )
    """)
    op.execute("CREATE INDEX ix_robot_message_receipts_received_at ON robot_message_receipts (received_at)")
    op.execute("ALTER TABLE robot_message_receipts ENABLE ROW LEVEL SECURITY")
    # 값과 로봇 ID를 그대로 옮긴 뒤 기존 칼럼을 제거해요.
    op.execute("""INSERT INTO robot_states
        (robot_id,status,slam_x,slam_y,lat,lng,battery_voltage,last_seen_at)
        SELECT id,status,slam_x,slam_y,lat,lng,battery_voltage,last_seen_at FROM robots""")
    op.drop_constraint(op.f("ck_robots_robot_status"), "robots", type_="check")
    for name in ("status", "slam_x", "slam_y", "lat", "lng", "battery_voltage", "last_seen_at"):
        op.drop_column("robots", name)
    op.add_column("robots", sa.Column("auth_token_hash", sa.Text(), nullable=True))
    op.add_column("robots", sa.Column("token_issued_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("detections", sa.Column("task_id", sa.BigInteger(), nullable=False))
    op.add_column("detections", sa.Column("client_detection_id", sa.Uuid(), nullable=False))
    op.add_column("detections", sa.Column("confidence", sa.REAL(), nullable=False))
    op.add_column("detections", sa.Column("pickup_fail_reason", sa.Text(), nullable=True))
    op.create_foreign_key(op.f("fk_detections_task_id_robot_tasks"), "detections", "robot_tasks", ["task_id"], ["id"])
    op.create_unique_constraint(op.f("uq_detections_client_detection_id"), "detections", ["client_detection_id"])
    op.create_index("ix_detections_task_id", "detections", ["task_id"])
    op.create_check_constraint(op.f("ck_detections_detection_confidence"), "detections", "confidence BETWEEN 0 AND 1")
    op.create_check_constraint(
        op.f("ck_detections_detection_fail_reason"),
        "detections",
        "pickup_fail_reason IS NULL OR (pickup_result IS NOT NULL AND pickup_result = 'failed')",
    )
    op.drop_constraint(op.f("ck_robot_tasks_task_result"), "robot_tasks", type_="check")
    op.execute(
        "UPDATE robot_tasks SET result=CASE result WHEN 'success' THEN 'completed' WHEN 'failed' THEN 'aborted' ELSE result END"
    )
    op.create_check_constraint(
        op.f("ck_robot_tasks_task_result"),
        "robot_tasks",
        "result IS NULL OR result IN ('completed','stopped','aborted','missed')",
    )


def downgrade():
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.execute(
        "LOCK TABLE robots, robot_states, robot_tasks, detections, robot_task_points, robot_errors, robot_message_receipts IN ACCESS EXCLUSIVE MODE"
    )
    op.execute("""DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM robot_task_points) OR EXISTS (SELECT 1 FROM robot_errors)
         OR EXISTS (SELECT 1 FROM robot_message_receipts) OR EXISTS (SELECT 1 FROM detections)
         OR EXISTS (SELECT 1 FROM robots WHERE auth_token_hash IS NOT NULL OR token_issued_at IS NOT NULL)
         OR EXISTS (SELECT 1 FROM robot_states WHERE slam_yaw IS NOT NULL OR status='returning')
         OR EXISTS (SELECT 1 FROM robot_tasks WHERE result IN ('stopped','missed')) THEN
        RAISE EXCEPTION 'Cannot downgrade while new robot protocol data exists';
      END IF;
    END $$""")
    op.add_column("robots", sa.Column("status", sa.Text(), nullable=False, server_default="offline"))
    for name in ("slam_x", "slam_y", "lat", "lng"):
        op.add_column("robots", sa.Column(name, sa.Double(), nullable=True))
    op.add_column("robots", sa.Column("battery_voltage", sa.REAL(), nullable=True))
    op.add_column("robots", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("""UPDATE robots r SET status=s.status, slam_x=s.slam_x, slam_y=s.slam_y,
       lat=s.lat, lng=s.lng, battery_voltage=s.battery_voltage, last_seen_at=s.last_seen_at
       FROM robot_states s WHERE r.id=s.robot_id""")
    op.create_check_constraint(
        op.f("ck_robots_robot_status"), "robots", "status IN ('idle','working','emptying','offline','error')"
    )
    op.drop_column("robots", "auth_token_hash")
    op.drop_column("robots", "token_issued_at")
    op.drop_constraint(op.f("ck_robot_tasks_task_result"), "robot_tasks", type_="check")
    op.execute(
        "UPDATE robot_tasks SET result=CASE result WHEN 'completed' THEN 'success' WHEN 'aborted' THEN 'failed' ELSE result END"
    )
    op.create_check_constraint(
        op.f("ck_robot_tasks_task_result"), "robot_tasks", "result IS NULL OR result IN ('success','failed')"
    )
    op.drop_constraint(op.f("ck_detections_detection_confidence"), "detections", type_="check")
    op.drop_constraint(op.f("ck_detections_detection_fail_reason"), "detections", type_="check")
    op.drop_constraint(op.f("uq_detections_client_detection_id"), "detections", type_="unique")
    op.drop_constraint(op.f("fk_detections_task_id_robot_tasks"), "detections", type_="foreignkey")
    op.drop_index("ix_detections_task_id", table_name="detections")
    for name in ("task_id", "client_detection_id", "confidence", "pickup_fail_reason"):
        op.drop_column("detections", name)
    for name in ("robot_message_receipts", "robot_errors", "robot_task_points", "robot_states"):
        op.drop_table(name)
