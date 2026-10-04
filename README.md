# churn-value

Which customers are worth a retention offer, and what is that worth in money? A churn model for a UK online wholesaler, judged by the profit of the campaign it drives and not by its ranking score.

**Live site:** https://churn-value.pedromarkovicz.workers.dev

[![The Overview page: 1,920 customers drawn as squares beside the campaign's account](web/public/og.png)](https://churn-value.pedromarkovicz.workers.dev)

## The finding

Three supervised models rank customers about equally well (ROC-AUC 0.76 to 0.77). Only one of them makes close to the money it promises.

On the September 2011 holdout, at the default assumptions:

| Policy | Customers called | Expected profit | Realized profit [95% CI] |
|---|---|---|---|
| Call everyone | 1,920 | – | −£128,345 [−£165,289, −£93,323] |
| Cadence rule | 1,920 | £155,221 | −£128,345 [−£165,289, −£93,323] |
| BG/NBD | 1,565 | £125,850 | −£23,067 [−£39,697, −£7,762] |
| Logistic regression | 1,367 | £67,245 | £8,089 [−£2,418, £18,773] |
| LightGBM | 1,294 | £62,859 | £14,972 [£5,941, £25,086] |
| **LightGBM + season** (deployed) | 993 | £25,621 | **£23,139 [£15,660, £31,729]** |
| Perfect foresight | 592 | – | £88,558 [£78,016, £98,844] |

An offer is priced with the model's probabilities, so a model that expects more churn than happens promises profit it never makes. Plain LightGBM expected £62,859 and made £14,972. Adding the cutoff month as a feature keeps the probabilities right after the season turns: the deployed model predicted 31.6% churn and 30.8% happened.

Refitted with six seeds, the deployed configuration realizes £19.4k to £23.1k. The table shows the pipeline's seed, which is at the top of that range.

## What the site shows

- **Overview:** every holdout customer as a square, linked to the campaign's account.
- **Simulator:** change the assumptions (acceptance, incentive, margin, budget) and the list and its profit change.
- **Sensitivity:** how far acceptance can fall before the list loses money, and which assumption matters most.
- **Customers:** the ranked list; for each customer the reasons, the purchase history, and a what-if that runs the model in the browser.
- **Model:** calibration over time, expected against realized profit, ranking metrics, reliability, drift.
- **Method:** how the label is built, how the model was validated, the assumptions and their sources, and the model card.

The eleven analysis notebooks are on the site under [/notebooks/](https://churn-value.pedromarkovicz.workers.dev/notebooks/).

## How it is built

```
UCI Online Retail II
        │
        ▼
ml/  (Python)   clean → monthly snapshots → label → train → calibrate → evaluate
        │   churnvalue export
        ▼
GitHub release  artifacts + manifest: a versioned contract, a SHA-256 per file
        │   pinned in web/artifacts.lock.json
        ▼
web/ (React)    a static site: the economics run in the browser, the what-if runs ONNX
        │   CI: build once, smoke test, deploy
        ▼
Cloudflare Workers (static assets)
```

- **The label is built, not given.** Nobody tells a wholesaler they are leaving. A customer who was due to reorder and buys nothing in the next 90 days counts as churned; customers who were not due are not labelled.
- **The decision is economic.** A call's expected profit is `p·γ·(B − CRC) − (1 − p)·CRC − c`, with the benefit `B = min(V, CAC)`: what keeping the customer is worth, capped by what replacing them would cost. A customer is called when that is positive.
- **A ladder of models**, from a cadence rule and BG/NBD to logistic regression and LightGBM, tuned with Optuna under rolling-origin cross-validation, calibrated on June 2011 and judged once on September 2011.
- **Nothing on the site is invented.** Every number comes from the pinned release or from TypeScript that is tested against golden vectors written by the Python code. The what-if runs the served model with onnxruntime-web after checking its SHA-256.

The decisions and their alternatives are in [docs/design.md](docs/design.md) and the [architecture decision records](docs/adr). The model's intended use, data and results are in the [model card](docs/model-card.md).

## Reproduce it

The pipeline, from the public dataset to the site's artifacts, needs [uv](https://docs.astral.sh/uv/):

```bash
cd ml
uv sync
uv run churnvalue pipeline
```

The site, on the pinned release, needs Node 24:

```bash
cd web
npm ci
npm run artifacts     # the pinned release, checksums verified
npm run dev           # http://localhost:5173
```

`npm run artifacts -- --local` uses the artifacts your own pipeline run exported. More in [ml/README.md](ml/README.md) and [web/README.md](web/README.md).

## The repository

| Path | What is there |
|---|---|
| [ml/](ml) | the `churnvalue` package and CLI, its tests, and the analysis notebooks |
| [web/](web) | the site: contract loader, economics, charts, pages, tests |
| [contracts/](contracts) | the JSON Schemas of the artifacts and the golden vectors both sides test against |
| [docs/](docs) | the design document, the decision records and the model card |
| [.github/workflows/](.github/workflows) | CI and deploy, the manual training run, the visual baselines |

## How it is checked

- **Python:** unit tests, property-based leakage tests (no feature may see the label window), and tests of the committed notebooks.
- **Contract:** the TypeScript types and validators are generated from the schemas, and CI fails if they drift.
- **Parity:** the browser's economics and its ONNX inference reproduce the Python pipeline on golden vectors.
- **Site:** component tests; Playwright on desktop and a phone profile with accessibility checks on every page; visual regression in a pinned container; Lighthouse budgets.
- **Deploy:** the bundle is built once, served locally as the Worker will serve it and smoke-tested; `main` deploys that same bundle and checks the live address. Every pull request gets its own preview.
- **History:** a secrets scan runs over the whole history on every pull request.

## What it cannot tell you

- Whether an offer works: there is no campaign history, so the acceptance rate is an assumption.
- Anything about one-time buyers: a cadence needs two purchase days.
- A second season: the holdout is one autumn, before a Christmas peak.
- New customers: the site scores the holdout; it does not take uploads.

## Data and licence

Data: Chen, D. (2012). *Online Retail II* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D, licensed CC BY 4.0. The dataset is downloaded by the pipeline and is not in this repository.

Code: [MIT](LICENSE).
