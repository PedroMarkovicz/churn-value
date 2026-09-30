# churn-value web

The static site: every number comes from a versioned artifacts release of the Python pipeline or from TypeScript that is parity-tested against it. No server (ADR 0006).

## Run it

```bash
npm ci
npm run artifacts            # the release pinned in artifacts.lock.json (checksums verified)
npm run dev                  # http://localhost:5173
```

A private repository needs `GITHUB_TOKEN` in the environment for `npm run artifacts`. To use a local `uv run churnvalue export` instead of the release:

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
| `npm run e2e`                                               | Playwright on desktop and mobile, with axe on every page                                                           |
| `npm run lighthouse`                                        | Lighthouse budgets: performance ≥ 0.9, accessibility 1.0                                                           |

## Pin a new release

After the `train` workflow publishes a release (`artifacts-<date>-<sha>`):

```bash
GITHUB_TOKEN=... npm run artifacts -- --pin artifacts-20260928-abc1234
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

## Layout

- `src/contract`: generated types and validators, the loader.
- `src/domain`: pure TypeScript (economics, campaign, policies, stress, formatting, headlines).
- `src/scenario`: the URL scenario.
- `src/workers`: the compute worker, and the inference worker (onnxruntime-web) with its client.
- `src/charts`: chart primitives and the palette.
- `src/pages`: one folder per page.
