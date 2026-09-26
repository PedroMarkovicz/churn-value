# 0012 — Analysis notebooks as a narrative layer over the package

**Context.** A portfolio has to show its reasoning as well as its code. The first version of this repository hid that reasoning:
- the data audit that set the cleaning rules;
- the seasonality found in the churn rate;
- the calibration drift that made the baselines lose money;
- the change to the economic defaults.

All of that research happened in scratch scripts, and the spec only states the results. The origin project had the opposite problem: its logic lived in notebooks, so nothing could be reproduced. The author's coursework uses a staged notebook sequence (ingestion → cleaning → EDA → preprocessing → training → evaluation).

**Decision.**
- Add 11 numbered notebooks. They adapt the staged sequence to non-contractual churn, adding problem framing and separating evaluation from business value (design §6.7).
- **The notebooks are narrative, not pipeline.** They import `churnvalue`, read the CLI's artifacts and write only reports (a summary JSON and figures). No business logic is defined in a notebook; reusable logic goes into the package, with tests.
- Executed `.ipynb` files are committed with their outputs. Styled HTML exports are published with the web app, because GitHub strips inline CSS.
- The visual design reuses the layout of the author's earlier project, with its own accent colour (indigo `#4A3AA7`) and a validated data palette.
- Notebooks 01–06 are built in Plan 1b, before Plan 1 is merged, and 07–11 in Plan 2, so each notebook is written alongside the code it narrates.

**Alternatives.**
- Notebooks as pipeline stages that write interim data: this duplicates the CLI and creates two sources of truth.
- A hybrid where the CLI runs notebooks through papermill: the pipeline would then depend on Jupyter.
- Committing only `.ipynb` files: the design would be invisible on GitHub.
- Quarto: one more tool, and a second site.
- Only three notebooks: too thin to carry the reasoning of a project of this scope.

**Consequences.**
- New package code that the notebooks need, each piece tested:
  - `CLEANING_RULES` with `apply_rules` and `cleaning_audit`, the single source of truth for the cleaning masks;
  - `same_day_reversals`;
  - the sheet row-count metadata and `label_sheets`;
  - `project_root`;
  - `FEATURE_CATALOGUE`, which the web feature spec will reuse;
  - `cliffs_delta`;
  - `StageSummary`, which writes strict JSON.
- Writing the notebooks surfaced a data issue: same-day order reversals. It became a cleaning rule, and the Plan 1 numbers shifted slightly.
- A `churnvalue.viz.style` module and a `churnvalue notebooks` command.
- Notebook dependencies go in a separate dependency group.
- Notebooks depend on the real data, so they run in a manual CI workflow. The regular CI lints them and checks that they were executed in order.
