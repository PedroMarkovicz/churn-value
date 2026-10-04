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


CI = yaml.safe_load(
    (Path(__file__).parents[2] / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
)


def test_only_the_deploy_job_receives_secrets():
    """Pull request jobs run code from the branch; the Cloudflare token must never reach them."""
    with_secrets = [name for name, job in CI["jobs"].items() if "secrets." in yaml.safe_dump(job)]
    assert with_secrets == ["deploy"]


def test_deploy_waits_for_every_check_and_runs_only_on_main():
    deploy = CI["jobs"]["deploy"]
    assert sorted(deploy["needs"]) == ["ml", "site", "visual", "web"]
    assert deploy["if"] == "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    assert deploy["concurrency"] == {"group": "deploy-production", "cancel-in-progress": False}


def test_the_deploy_job_does_not_persist_the_checkout_token():
    checkouts = [
        step
        for step in CI["jobs"]["deploy"]["steps"]
        if str(step.get("uses", "")).startswith("actions/checkout")
    ]
    assert checkouts
    assert all(step.get("with", {}).get("persist-credentials") is False for step in checkouts)
