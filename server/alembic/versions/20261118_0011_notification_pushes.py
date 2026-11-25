"""Create durable Expo push delivery queue and token activation flag."""

import sqlalchemy as sa
from alembic import op

revision = "20261118_0011"
down_revision = "20261118_0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_push_deliveries",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), sa.Identity(always=True), nullable=False),
        sa.Column("notification_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("push_token_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("status", sa.Text(), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("receipt_checks", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ticket_id", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending','submitted','delivered','failed','cancelled')",
            name=op.f("ck_notification_push_deliveries_push_delivery_status"),
        ),
        sa.CheckConstraint(
            "status NOT IN ('submitted','delivered') OR (ticket_id IS NOT NULL AND length(trim(ticket_id)) > 0 AND submitted_at IS NOT NULL)",
            name=op.f("ck_notification_push_deliveries_push_delivery_ticket"),
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND receipt_checks >= 0", name=op.f("ck_notification_push_deliveries_push_delivery_attempts")
        ),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name=op.f("fk_notification_push_deliveries_notification_id_notifications"),
        ),
        sa.ForeignKeyConstraint(
            ["push_token_id"],
            ["push_tokens.id"],
            name=op.f("fk_notification_push_deliveries_push_token_id_push_tokens"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notification_push_deliveries")),
        sa.UniqueConstraint(
            "notification_id", "push_token_id", name=op.f("uq_notification_push_deliveries_notification_id")
        ),
    )
    op.create_index(
        "ix_notification_push_deliveries_due",
        "notification_push_deliveries",
        ["status", "next_attempt_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notification_push_deliveries_notification_id"),
        "notification_push_deliveries",
        ["notification_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_notification_push_deliveries_push_token_id"),
        "notification_push_deliveries",
        ["push_token_id"],
        unique=False,
    )
    op.add_column("push_tokens", sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False))
    op.execute(sa.text("ALTER TABLE notification_push_deliveries ENABLE ROW LEVEL SECURITY"))


def downgrade():
    op.drop_column("push_tokens", "is_active")
    op.drop_index(op.f("ix_notification_push_deliveries_push_token_id"), table_name="notification_push_deliveries")
    op.drop_index(op.f("ix_notification_push_deliveries_notification_id"), table_name="notification_push_deliveries")
    op.drop_index("ix_notification_push_deliveries_due", table_name="notification_push_deliveries")
    op.drop_table("notification_push_deliveries")
