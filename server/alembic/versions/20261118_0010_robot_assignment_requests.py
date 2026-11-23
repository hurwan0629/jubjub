"""Create robot assignment requests and assigned robot history."""

import sqlalchemy as sa
from alembic import op

revision = "20261118_0010"
down_revision = "20261118_0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "robot_assignment_requests",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("user_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("park_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("catalog_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("robot_count", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND reject_reason IS NULL) OR (status IN ('approved','cancelled') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reject_reason IS NULL) OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reject_reason IS NOT NULL AND length(trim(reject_reason)) > 0)",
            name=op.f("ck_robot_assignment_requests_assignment_request_review"),
        ),
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected','cancelled')",
            name=op.f("ck_robot_assignment_requests_assignment_request_status"),
        ),
        sa.CheckConstraint(
            "length(reason) <= 1000", name=op.f("ck_robot_assignment_requests_assignment_request_reason")
        ),
        sa.CheckConstraint(
            "robot_count BETWEEN 1 AND 100", name=op.f("ck_robot_assignment_requests_assignment_request_count")
        ),
        sa.ForeignKeyConstraint(
            ["catalog_id"],
            ["park_catalog_entries.id"],
            name=op.f("fk_robot_assignment_requests_catalog_id_park_catalog_entries"),
        ),
        sa.ForeignKeyConstraint(["park_id"], ["parks.id"], name=op.f("fk_robot_assignment_requests_park_id_parks")),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"], name=op.f("fk_robot_assignment_requests_reviewed_by_users")
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_robot_assignment_requests_user_id_users")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_robot_assignment_requests")),
    )
    op.create_index(
        "ix_robot_assignment_requests_status_time", "robot_assignment_requests", ["status", "created_at"], unique=False
    )
    op.create_index(
        "ix_robot_assignment_requests_user_time", "robot_assignment_requests", ["user_id", "created_at"], unique=False
    )
    op.create_index(
        "uq_robot_assignment_requests_pending",
        "robot_assignment_requests",
        ["park_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "robot_assignment_request_robots",
        sa.Column("request_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("robot_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["robot_assignment_requests.id"],
            name=op.f("fk_robot_assignment_request_robots_request_id_robot_assignment_requests"),
        ),
        sa.ForeignKeyConstraint(
            ["robot_id"], ["robots.id"], name=op.f("fk_robot_assignment_request_robots_robot_id_robots")
        ),
        sa.PrimaryKeyConstraint("request_id", "robot_id", name=op.f("pk_robot_assignment_request_robots")),
    )
    op.create_index(
        op.f("ix_robot_assignment_request_robots_robot_id"),
        "robot_assignment_request_robots",
        ["robot_id"],
        unique=False,
    )
    op.execute(sa.text("ALTER TABLE robot_assignment_request_robots ENABLE ROW LEVEL SECURITY"))
    op.execute(sa.text("ALTER TABLE robot_assignment_requests ENABLE ROW LEVEL SECURITY"))


def downgrade():
    op.drop_index(op.f("ix_robot_assignment_request_robots_robot_id"), table_name="robot_assignment_request_robots")
    op.drop_table("robot_assignment_request_robots")
    op.drop_index(
        "uq_robot_assignment_requests_pending",
        table_name="robot_assignment_requests",
        postgresql_where=sa.text("status = 'pending'"),
        sqlite_where=sa.text("status = 'pending'"),
    )
    op.drop_index("ix_robot_assignment_requests_user_time", table_name="robot_assignment_requests")
    op.drop_index("ix_robot_assignment_requests_status_time", table_name="robot_assignment_requests")
    op.drop_table("robot_assignment_requests")
