# churnvalue — ML pipeline

Profit-optimal churn retention on UCI Online Retail II. Design: [`../docs/design.md`](../docs/design.md).
Model card: [`../docs/model-card.md`](../docs/model-card.md).

## Reproduce

Requires [uv](https://docs.astral.sh/uv/) ≥ 0.12. From this directory:

    uv sync
    uv run churnvalue download            # ~45 MB, SHA-256 verified, ~1 min
    uv run churnvalue build-snapshots     # 16 monthly snapshots
    uv run churnvalue evaluate-baselines  # reports/baseline_evaluation.json (notebook 06)
    uv run churnvalue train               # Optuna + rolling-origin CV, ~4 min; models/ and MLflow
    uv run churnvalue evaluate            # reports/evaluation.json, test metrics logged to MLflow
    uv run churnvalue export              # artifacts/ for the web app and docs/model-card.md

All parameters live in `configs/default.yaml`. Runs are tracked in a local MLflow store
(`mlflow.db`); browse them with `uv run mlflow ui --backend-store-uri sqlite:///mlflow.db`.

`uv run churnvalue contracts` regenerates the JSON Schemas and the code-only golden vectors under
[`../contracts`](../contracts); a test fails if the committed ones are stale.

## Analysis notebooks

Numbered notebooks in `notebooks/` narrate every decision; the CLI remains the pipeline. After the
pipeline commands above:

    uv run churnvalue notebooks            # execute 01–11 in place and export styled HTML
    uv run churnvalue notebooks --only 08  # one stage

| # | Notebook | Question |
|---|---|---|
| 01 | `data_ingestion` | Where does the data come from, and can we trust our copy? |
| 02 | `data_cleaning` | Which rows do we drop, and why? |
| 03 | `eda` | How do these customers buy? |
| 04 | `problem_framing` | How does "stopped buying" become a label we can trust? |
| 05 | `feature_engineering` | What do we know about a customer at the cutoff — and nothing more? |
| 06 | `baselines` | How far do customer-base models get, and what does trusting them cost? |
| 07 | `model_training` | Which supervised models, tuned how, under temporal CV? |
| 08 | `evaluation` | How good are the models, with CIs, and does calibration survive the season? |
| 09 | `explainability` | Why does the model flag a given customer? |
| 10 | `business_value` | What is the model worth in money, and under which assumptions? |
| 11 | `ablation` | What do the month features buy, and which calibration fixes fail? |

Figures and summaries go to `reports/figures` and `reports/results`; styled HTML to
`reports/notebooks` (GitHub strips the notebooks' inline styles; the HTML keeps them).

## Test

    uv run pytest            # fast suite, synthetic data, no network
    uv run pytest -m slow    # checks against the real pipeline outputs (after the commands above)
    uv run ruff check . && uv run pyright

## Results (test cutoff 2011-09-10, default economics)

Every model is calibrated on the 2011-06-10 cutoff; each policy contacts the customers whose
expected profit is positive. 95 % customer-clustered bootstrap CIs.

| Policy | ROC-AUC | Mean p (actual 0.308) | Contacted | Expected profit | Realized profit [95 % CI] |
|---|---|---|---|---|---|
| Contact all | — | — | 1,920 | — | −£128,345 [−£165.3k, −£93.3k] |
| Cadence rule | 0.551 | 0.438 | 1,920 | £155,221 | −£128,345 [−£165.3k, −£93.3k] |
| BG/NBD | 0.712 | 0.489 | 1,565 | £125,850 | −£23,067 [−£39.7k, −£7.8k] |
| Logistic regression | 0.761 | 0.416 | 1,367 | £67,245 | £8,089 [−£2.4k, £18.8k] |
| LightGBM | 0.771 | 0.434 | 1,294 | £62,859 | £14,972 [£5.9k, £25.1k] |
| **LightGBM + season** (deployed) | 0.766 | 0.316 | 993 | £25,621 | **£23,139 [£15.7k, £31.7k]** |
| Oracle | — | — | 592 | — | £88,558 [£78.0k, £98.8k] |

The supervised models rank alike; only the one that knows the cutoff month stays calibrated
after the season turns, so only its expected profit is close to what it realizes. Refitted with
six seeds, the deployed configuration realizes £19.4k–£23.1k (notebook 11).
