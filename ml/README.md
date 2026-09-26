# churnvalue — ML pipeline

Profit-optimal churn retention on UCI Online Retail II. Design: [`../docs/design.md`](../docs/design.md).

## Reproduce

Requires [uv](https://docs.astral.sh/uv/) ≥ 0.12. From this directory:

    uv sync
    uv run churnvalue download            # ~45 MB, SHA-256 verified, ~1 min
    uv run churnvalue build-snapshots     # 16 monthly snapshots
    uv run churnvalue evaluate-baselines  # reports/baseline_evaluation.json

All parameters live in `configs/default.yaml`.

## Analysis notebooks

Numbered notebooks in `notebooks/` narrate every decision; the CLI remains the pipeline. After the
three pipeline commands above:

    uv run churnvalue notebooks            # execute 01–06 in place and export styled HTML
    uv run churnvalue notebooks --only 03  # one stage

| # | Notebook | Question |
|---|---|---|
| 01 | `data_ingestion` | Where does the data come from, and can we trust our copy? |
| 02 | `data_cleaning` | Which rows do we drop, and why? |
| 03 | `eda` | How do these customers buy? |
| 04 | `problem_framing` | How does "stopped buying" become a label we can trust? |
| 05 | `feature_engineering` | What do we know about a customer at the cutoff — and nothing more? |
| 06 | `baselines` | How far do customer-base models get, and what does trusting them cost? |

Figures and summaries go to `reports/figures` and `reports/results`; styled HTML to
`reports/notebooks` (GitHub strips the notebooks' inline styles; the HTML keeps them).

## Test

    uv run pytest            # fast suite, synthetic data, no network
    uv run pytest -m slow    # checks against the real dataset (after the pipeline ran)
    uv run ruff check . && uv run pyright

## Baseline results (test cutoff 2011-09-10, default economics)

| Policy | Contacted | Realized profit | 95 % CI |
|---|---|---|---|
| Do nothing | 0 | £0 | — |
| Contact all | 1,920 | −£128,345 | [−£165.3k, −£93.3k] |
| Cadence rule | 1,920 | −£128,345 | [−£165.3k, −£93.3k] |
| BG/NBD (calibrated) | 1,565 | −£23,067 | [−£39.7k, −£7.8k] |
| Oracle | 592 | £88,558 | [£78.0k, £98.8k] |

BG/NBD ranks reasonably well (ROC-AUC 0.71), but its calibration does not transfer across seasons, so it loses money. The supervised models in Plan 2 have to fix exactly this.
