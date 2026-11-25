"""Remove daily reports and agent execution logs."""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = "20261118_0008"
down_revision = "20261117_0007"
branch_labels = None
depends_on = None


def identity():
    return sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True)


def timestamp(name="created_at", nullable=False):
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable, server_default=None if nullable else sa.func.now())


def upgrade():
    op.drop_table("agent_steps")
    op.drop_table("agent_runs")
    op.drop_table("daily_reports")


def downgrade():
    # Downgrade restores schemas only, not deleted records.
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
    op.create_table(
        "daily_reports",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("park_id", sa.BigInteger(), sa.ForeignKey("parks.id"), nullable=False),
        sa.Column("catalog_id", sa.BigInteger(), sa.ForeignKey("park_catalog_entries.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("catalog_id", "date", name=op.f("uq_daily_reports_catalog_id")),
    )
    op.create_index("ix_daily_reports_park_id", "daily_reports", ["park_id"])
    op.create_index("ix_daily_reports_catalog_id", "daily_reports", ["catalog_id"])
    op.add_column("agent_runs", sa.Column("robot_id", sa.BigInteger(), sa.ForeignKey("robots.id"), nullable=True))
    op.create_index("ix_agent_runs_robot_id", "agent_runs", ["robot_id"])
    for table in ("daily_reports", "agent_runs", "agent_steps"):
        op.execute(sa.text(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY"))
