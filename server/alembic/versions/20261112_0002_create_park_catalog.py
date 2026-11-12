"""검색용 공원 경계 목록을 만들어요."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20261112_0002"
down_revision: str | None = "20261112_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "park_catalog_entries",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("source_key", sa.Text(), nullable=False),
        sa.Column("dataset", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("center_lat", sa.Float(), nullable=False),
        sa.Column("center_lng", sa.Float(), nullable=False),
        sa.Column("bounds", postgresql.JSONB(), nullable=False),
        sa.Column("area", postgresql.JSONB(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("source_license", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_park_catalog_entries")),
        sa.UniqueConstraint("source_key", name=op.f("uq_park_catalog_entries_source_key")),
    )
    op.create_index(op.f("ix_park_catalog_entries_dataset"), "park_catalog_entries", ["dataset"])
    op.execute("ALTER TABLE park_catalog_entries ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.drop_index(op.f("ix_park_catalog_entries_dataset"), table_name="park_catalog_entries")
    op.drop_table("park_catalog_entries")
