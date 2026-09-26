# 0008 — Lean ML engineering + local MLflow

**Context.** The project must be reproducible with one command, without infrastructure that has no matching problem.

**Decision.**
- Tooling: uv + pyproject, ruff, pyright, pytest and pre-commit.
- A Typer CLI organised in stages, with a YAML config validated by Pydantic, Pandera schemas and fixed seeds.
- The data download script verifies a SHA-256 checksum.
- Local MLflow tracks experiments. Visitors will not run MLflow, so the `evaluate` stage exports an `experiments.json` summary that the site displays.
- The model card is generated.

**Alternatives.**
- No tracking: leaves no experiment history.
- DVC: needs a storage remote.
- A full MLOps stack: no matching problem to solve.

**Consequences.**
- `mlruns/` stays local and is gitignored.
- The site's experiment page is only as fresh as the latest `train` release.
