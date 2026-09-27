"""Where an artifact came from: code version, data checksum and configuration hash."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

from churnvalue.config import Config

UNKNOWN = "unknown"


def git_sha(cwd: Path | None = None) -> str:
    """Commit of the working tree ("<sha>-dirty" with uncommitted changes), or "unknown"."""
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=cwd, capture_output=True, text=True, check=True
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return UNKNOWN
    return f"{sha}-dirty" if dirty else sha


def config_sha256(cfg: Config) -> str:
    """Hash of the validated configuration (canonical JSON), independent of YAML formatting."""
    return hashlib.sha256(cfg.model_dump_json().encode("utf-8")).hexdigest()


def run_tags(cfg: Config) -> dict[str, str]:
    return {
        "git_sha": git_sha(),
        "config_sha256": config_sha256(cfg),
        "data_sha256": cfg.data.sha256,
    }
