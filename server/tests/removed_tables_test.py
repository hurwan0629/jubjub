from app.models import Base


def test_removed_tables_are_not_registered():
    assert not {"daily_reports", "agent_runs", "agent_steps"} & Base.metadata.tables.keys()
