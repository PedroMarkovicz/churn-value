"""Security properties of the GitHub Actions workflows."""

from pathlib import Path

import pytest
import yaml

WORKFLOWS = sorted((Path(__file__).parents[2] / ".github" / "workflows").glob("*.yml"))


def _can_write(workflow: dict) -> bool:
    permissions = workflow.get("permissions") or {}
    return isinstance(permissions, dict) and "write" in permissions.values()


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_write_scoped_workflows_do_not_persist_the_token(path: Path):
    """A write token left in .git/config is readable by every later step (dependencies, tests)."""
    workflow = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not _can_write(workflow):
        pytest.skip("read-only workflow")
    for job in workflow["jobs"].values():
        for step in job["steps"]:
            if str(step.get("uses", "")).startswith("actions/checkout"):
                assert step.get("with", {}).get("persist-credentials") is False, path.name
