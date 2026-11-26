"""Pick interface reserved until hurwan_ws defines a real robot action."""


class PickExecutor:
    """Keep the manager's pick interface without pretending an action exists."""

    def ready(self) -> bool:
        """No pick action or physical driver is available in hurwan_ws yet."""
        return False

    async def pick(self, track: dict) -> tuple[bool, str | None]:
        """Reject direct use until a physical pick implementation is connected."""
        raise RuntimeError("hurwan_ws has no pick action or physical pick executor")
