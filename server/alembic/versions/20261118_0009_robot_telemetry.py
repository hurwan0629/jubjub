"""Create detections, robot tasks, notifications and push tokens."""

import sqlalchemy as sa
from alembic import op

revision = "20261118_0009"
down_revision = "20261118_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_tokens",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("user_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("platform", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("platform IN ('android', 'ios')", name=op.f("ck_push_tokens_push_platform")),
        sa.CheckConstraint("length(trim(token)) > 0", name=op.f("ck_push_tokens_push_token_nonempty")),
        sa.CheckConstraint("updated_at >= created_at", name=op.f("ck_push_tokens_push_token_timestamps")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_push_tokens_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_tokens")),
        sa.UniqueConstraint("token", name=op.f("uq_push_tokens_token")),
    )
    op.create_index(op.f("ix_push_tokens_user_id"), "push_tokens", ["user_id"], unique=False)
    op.create_table(
        "detections",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("park_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("robot_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("material", sa.Text(), nullable=False),
        sa.Column("slam_x", sa.Double(), nullable=False),
        sa.Column("slam_y", sa.Double(), nullable=False),
        sa.Column("lat", sa.Double(), nullable=False),
        sa.Column("lng", sa.Double(), nullable=False),
        sa.Column("image_path", sa.Text(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("pickup_result", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "material IN ('plastic', 'can', 'glass', 'general')", name=op.f("ck_detections_detection_material")
        ),
        sa.CheckConstraint(
            "pickup_result IS NULL OR pickup_result IN ('collected', 'failed')",
            name=op.f("ck_detections_detection_result"),
        ),
        sa.CheckConstraint(
            "lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180", name=op.f("ck_detections_detection_coordinates")
        ),
        sa.ForeignKeyConstraint(["park_id"], ["parks.id"], name=op.f("fk_detections_park_id_parks")),
        sa.ForeignKeyConstraint(["robot_id"], ["robots.id"], name=op.f("fk_detections_robot_id_robots")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_detections")),
    )
    op.create_index("ix_detections_park_time", "detections", ["park_id", "detected_at"], unique=False)
    op.create_index("ix_detections_robot_time", "detections", ["robot_id", "detected_at"], unique=False)
    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("user_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("recipient_role", sa.Text(), nullable=False),
        sa.Column("park_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True),
        sa.Column("robot_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True),
        sa.Column("notification_type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("lat", sa.Double(), nullable=True),
        sa.Column("lng", sa.Double(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.CheckConstraint(
            "recipient_role IN ('manager', 'super_admin')", name=op.f("ck_notifications_notification_role")
        ),
        sa.CheckConstraint(
            "(lat IS NULL AND lng IS NULL) OR (lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)",
            name=op.f("ck_notifications_notification_coordinates"),
        ),
        sa.ForeignKeyConstraint(["park_id"], ["parks.id"], name=op.f("fk_notifications_park_id_parks")),
        sa.ForeignKeyConstraint(["robot_id"], ["robots.id"], name=op.f("fk_notifications_robot_id_robots")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_notifications_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index("ix_notifications_inbox", "notifications", ["user_id", "is_read", "occurred_at"], unique=False)
    op.create_index(op.f("ix_notifications_park_id"), "notifications", ["park_id"], unique=False)
    op.create_index(op.f("ix_notifications_robot_id"), "notifications", ["robot_id"], unique=False)
    op.create_table(
        "robot_tasks",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("park_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("robot_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("task_type", sa.Text(), nullable=False),
        sa.Column("route_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True),
        sa.Column("trigger", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "(task_type = 'patrol' AND route_id IS NOT NULL AND trigger IN ('schedule', 'request') AND trigger IS NOT NULL) OR (task_type = 'station_move' AND route_id IS NULL AND trigger IS NULL)",
            name=op.f("ck_robot_tasks_task_patrol_metadata"),
        ),
        sa.CheckConstraint(
            "result IS NULL OR result IN ('success', 'failed')", name=op.f("ck_robot_tasks_task_result")
        ),
        sa.CheckConstraint("task_type IN ('patrol', 'station_move')", name=op.f("ck_robot_tasks_task_type")),
        sa.CheckConstraint(
            "(ended_at IS NULL AND result IS NULL) OR (ended_at IS NOT NULL AND result IS NOT NULL AND ended_at >= started_at)",
            name=op.f("ck_robot_tasks_task_completion"),
        ),
        sa.ForeignKeyConstraint(["park_id"], ["parks.id"], name=op.f("fk_robot_tasks_park_id_parks")),
        sa.ForeignKeyConstraint(["robot_id"], ["robots.id"], name=op.f("fk_robot_tasks_robot_id_robots")),
        sa.ForeignKeyConstraint(["route_id"], ["routes.id"], name=op.f("fk_robot_tasks_route_id_routes")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_robot_tasks")),
    )
    op.create_index("ix_robot_tasks_park_time", "robot_tasks", ["park_id", "started_at"], unique=False)
    op.create_index("ix_robot_tasks_robot_time", "robot_tasks", ["robot_id", "started_at"], unique=False)
    op.create_index(op.f("ix_robot_tasks_route_id"), "robot_tasks", ["route_id"], unique=False)
    op.execute(sa.text("ALTER TABLE detections ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("ALTER TABLE notifications ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("ALTER TABLE robot_tasks ENABLE ROW LEVEL SECURITY"))


def downgrade():
    op.drop_index(op.f("ix_robot_tasks_route_id"), table_name="robot_tasks")
    op.drop_index("ix_robot_tasks_robot_time", table_name="robot_tasks")
    op.drop_index("ix_robot_tasks_park_time", table_name="robot_tasks")
    op.drop_table("robot_tasks")
    op.drop_index(op.f("ix_notifications_robot_id"), table_name="notifications")
    op.drop_index(op.f("ix_notifications_park_id"), table_name="notifications")
    op.drop_index("ix_notifications_inbox", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_detections_robot_time", table_name="detections")
    op.drop_index("ix_detections_park_time", table_name="detections")
    op.drop_table("detections")
    op.drop_index(op.f("ix_push_tokens_user_id"), table_name="push_tokens")
    op.drop_table("push_tokens")
