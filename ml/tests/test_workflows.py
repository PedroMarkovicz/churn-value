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


def test_only_the_deploy_and_preview_jobs_receive_secrets():
    """Every other job runs the branch's code with nothing worth stealing in reach."""
    with_secrets = sorted(
        name for name, job in CI["jobs"].items() if "secrets." in yaml.safe_dump(job)
    )
    assert with_secrets == ["deploy", "preview"]


def test_secrets_reach_only_the_wrangler_step():
    for name in ("deploy", "preview"):
        steps = [step for step in CI["jobs"][name]["steps"] if "secrets." in yaml.safe_dump(step)]
        assert len(steps) == 1, name
        assert "wrangler" in steps[0]["run"], name


def test_preview_runs_only_for_pull_requests_from_this_repository():
    """A fork's pull request gets no secrets, so it must get no preview job either."""
    preview = CI["jobs"]["preview"]
    assert preview["if"] == (
        "github.event_name == 'pull_request' && "
        "github.event.pull_request.head.repo.full_name == github.repository"
    )
    assert preview["needs"] == ["site"]
    assert preview["permissions"] == {"contents": "read", "pull-requests": "write"}
    assert preview["timeout-minutes"] <= 20
    checkouts = [
        step
        for step in preview["steps"]
        if str(step.get("uses", "")).startswith("actions/checkout")
    ]
    assert checkouts
    assert all(step.get("with", {}).get("persist-credentials") is False for step in checkouts)


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


def test_deploy_publishes_only_the_tip_of_main():
    """An older run that finishes last, or is re-run, must not put an older commit live."""
    steps = CI["jobs"]["deploy"]["steps"]
    tip = [step.get("id") for step in steps].index("tip")
    assert "commits/main" in steps[tip]["run"]
    after = steps[tip + 1 :]
    assert after
    assert all(step.get("if") == "steps.tip.outputs.current == 'true'" for step in after)


def test_the_site_bundle_is_kept_for_one_day():
    """Every pull request push uploads the bundle; a week of them would fill the quota."""
    upload = next(
        step for step in CI["jobs"]["site"]["steps"] if step.get("with", {}).get("name") == "site"
    )
    assert upload["with"]["retention-days"] == 1


def test_the_site_and_deploy_jobs_have_a_time_limit():
    for name in ("site", "deploy"):
        assert CI["jobs"][name]["timeout-minutes"] <= 20


def test_preview_runs_one_at_a_time_and_fails_where_wrangler_fails():
    """Two pushes close together must not leave the alias on the older commit."""
    preview = CI["jobs"]["preview"]
    assert preview["concurrency"] == {
        "group": "preview-${{ github.event.pull_request.number }}",
        "cancel-in-progress": True,
    }
    upload = next(
        step for step in preview["steps"] if "wrangler versions upload" in str(step.get("run", ""))
    )
    assert upload["shell"] == "bash"  # with pipefail: `wrangler | tee` fails when wrangler fails
