# churn-value web

The static site: every number comes from a versioned artifacts release of the Python pipeline or from TypeScript that is parity-tested against it. No server (ADR 0006).

## Run it

```bash
npm ci
npm run artifacts            # the release pinned in artifacts.lock.json (checksums verified)
npm run dev                  # http://localhost:5173
```

`npm run artifacts` needs no token; with `GITHUB_TOKEN` in the environment it uses it, which only raises GitHub's rate limit. To use a local `uv run churnvalue export` instead of the release:

```bash
npm run artifacts -- --local
```

## Check it

| Command                                                     | What it checks                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run gen:contract`                                      | regenerates `src/contract` from `../contracts/schemas` (commit the result)                                         |
| `npm run palette`                                           | the data colours against the colour-vision and contrast checks (ADR 0013)                                          |
| `npm run lint`, `npm run typecheck`, `npm run format:check` | ESLint (strict, type-checked, a11y), tsc, Prettier                                                                 |
| `npm test`                                                  | unit and component tests, golden-vector parity, and a replay of the Python policy table on the installed artifacts |
| `npm run build && npm run check:bundle`                     | the production build and the 200 KB gzip budget for the first load                                                 |
| `npm run smoke -- <url>`                                    | a served copy of the site: the app, a direct link, the pinned release, the notebooks, the cache                    |
| `npm run og`                                                | with `npm run preview` running: remakes `public/og.png`, the social preview image (look at it before committing)   |
| `npm run e2e`                                               | Playwright on desktop and mobile, with axe on every page                                                           |
| `npm run lighthouse`                                        | Lighthouse budgets: performance ≥ 0.9, accessibility 1.0                                                           |

## Pin a new release

After the `train` workflow publishes a release (`artifacts-<date>-<sha>`):

```bash
npm run artifacts -- --pin artifacts-20260928-abc1234
```

This downloads the release, verifies it, installs it in `public/data` and rewrites `artifacts.lock.json`. Commit the lock file.

## Customers and the in-browser what-if

The Customers page ranks every holdout customer by the expected profit of a call under the
current scenario. Filters, search and the CSV work on the rows in view. `?customer=ID` opens a
customer's drawer: verdict, break-even gauge, the money, purchase history, the model's reasons
(SHAP, from `customers.json`) and a what-if.

The what-if runs the served `model.onnx` in a module worker with onnxruntime-web (WebAssembly,
one thread):

- The runtime's wasm, about 3.7 MB gzip, is fetched only when a what-if first runs, and is not
  part of the first-load budget.
- The worker checks `model.onnx` against its SHA-256 in `manifest.json` before using it, then
  applies the served calibrator.
- If the model cannot run, the what-if says so and the rest of the drawer keeps working.

Parity with Python is tested twice:

- `tests/unit/domain/onnx-parity.test.ts` (onnxruntime-node) reproduces `golden/model.json`.
  It also shows that the what-if's rebuilt input gives back every customer's served
  probability.
- `tests/e2e/customers.spec.ts` compares the browser's answer with the same computation in
  Node.

Both need the artifacts installed (`npm run artifacts`).

## Model and Method

Both pages show results at the default scenario and say so.

- **Model** reads `evaluation.json` and, on its own route, `experiments.json`.
- **Method** reads the release's `model_card.md` (contract 1.2.0) after checking its SHA-256 against the manifest. A missing or altered card is reported in its place; the rest of the page still renders. The Markdown renderer is a lazy chunk.

## Visual baselines

`tests/e2e/visual.spec.ts` screenshots the six pages at the default scenario. It runs only in the pinned Linux container (`mcr.microsoft.com/playwright:v1.63.0-noble`), where the CI `visual` job compares against `tests/e2e/__screenshots__/`. `npm run e2e` never runs it; fonts and anti-aliasing differ on other platforms.

To change the baselines after an intended visual change:

1. run the `visual-baselines` workflow on your branch (Actions → visual-baselines → Run workflow);
2. download its `visual-baselines` artifact into `web/tests/e2e/__screenshots__/`;
3. look at every image, then commit them with the change that caused them.

GitHub only runs a manual workflow once it is on the default branch. On a branch that adds or first needs baselines, the CI `visual` job fails without them and uploads the screenshots it took, as `*-actual.png` in its `visual-diffs` artifact. They come from the same container, so after review they are the baselines.

## Deploy

The site is a Cloudflare Worker with static assets and no script (`wrangler.jsonc`). Its address is in `.env` (`VITE_SITE_URL`; not a secret).

- **CI is the deploy path.** The `site` job builds the site, adds the notebook pages (`uv run churnvalue notebooks-site`, from `ml/`), serves the result with `wrangler dev` and runs the smoke test. On `main`, after every job passes, `deploy` publishes that same bundle, but only while its commit is the tip of `main`, and runs the smoke test until the live address serves that build. `npm run deploy` publishes whatever is in `dist` with none of those checks; it is for an emergency.
- **The bundle** is kept as a workflow artifact for one day. To deploy an older run again, re-run all its jobs, not only `deploy`.
- **Previews:** every pull request from the repository gets its own address, `https://pr-<number>-churn-value.<subdomain>.workers.dev`, written in a comment on the pull request and checked by the same smoke test. It is public to whoever has the link, and the live site does not change.
- **Secrets:** `CLOUDFLARE_API_TOKEN` (the "Edit Cloudflare Workers" template, one account) and `CLOUDFLARE_ACCOUNT_ID`, as repository secrets. Only the `deploy` and `preview` jobs receive them, and in each only the step that runs Wrangler.
- **Secrets scan:** the `secrets` job runs gitleaks over every commit on each pull request and on `main`; `deploy` waits for it. A finding is printed redacted. A real credential must be revoked first; removing it from the history comes second.
- **Headers:** `public/_headers` forbids framing by another site (`X-Frame-Options: DENY`), asks browsers for HTTPS (`Strict-Transport-Security`) and turns off content sniffing; the smoke test checks all three.
- **Cache:** every file is revalidated on each visit (Cloudflare's default), so nothing is downloaded twice and a new deploy shows at once. There is no long-lived rule for `/assets/*` on purpose: Cloudflare answers a missing path there with the app's page, and a browser would keep that page under a chunk's address (ADR 0006). The smoke test checks it.
- **Notebooks:** served under `/notebooks/`. The pages load MathJax and require.js from cdnjs.

Try the Worker locally:

```bash
npm run build
(cd ../ml && uv run churnvalue notebooks-site --out ../web/dist/notebooks)
npm run serve:worker                      # http://localhost:8787
npm run smoke -- http://localhost:8787    # in another terminal
```

`npm run smoke` with no address checks the live site.

Roll back:

1. `npx wrangler rollback` returns to the previous version at once. It needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment, or `npx wrangler login`.
2. Then revert the commit on `main`. Until it is reverted, the next push deploys it again. A revert alone also works; it only takes as long as CI.

## Layout

- `src/contract`: generated types and validators, the loader.
- `src/domain`: pure TypeScript (economics, campaign, policies, stress, formatting, headlines).
- `src/scenario`: the URL scenario.
- `src/workers`: the compute worker, and the inference worker (onnxruntime-web) with its client.
- `src/charts`: chart primitives and the palette.
- `src/pages`: one folder per page.
