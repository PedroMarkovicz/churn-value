# 0006 — Static-first + batch architecture

**Context.** Churn scoring runs in batches, for example monthly campaigns. The economics are simple arithmetic over precomputed `p` and `V`. The demo must be always on, fast and free.

**Decision.**
- A Python batch pipeline produces versioned artifacts, published as GitHub Releases.
- A static SPA runs all the economics client-side. What-if inference runs in the browser with ONNX.
- The site is deployed to Cloudflare Workers (static assets) through GitHub Actions, with a preview for each PR.

**Alternatives.**
- An additional hosted FastAPI: cold starts and one more moving part.
- An API-driven UI: slow sliders, and the demo depends on the server being awake.
- Streamlit or Gradio: repeats the origin project's format.
- GitHub Pages: simpler, but no PR previews.

**Consequences.**
- The economics exist in both Python and TS, so parity is enforced (ADR 0009).
- The app cannot score arbitrary new customers.

**Amendments after Plan 4a (deploy).**
- The Worker has static assets and no script (`web/wrangler.jsonc`). `not_found_handling: "single-page-application"` serves the app for direct links; a path the app does not know shows the app's own 404 page.
- `web/public/_headers` marks `/assets/*` immutable for a year, because every file there has a content hash in its name (`npm run check:assets` fails otherwise). Everything else is revalidated on each visit, so a new release or a new deploy shows at once.
- CI builds the site once (the `site` job) and checks it under `wrangler dev` with a smoke test. On `main`, `deploy` publishes that same bundle after every other job passes, then runs the smoke test against the live address.
- The Cloudflare token is a repository secret that only the `deploy` job receives; `ml/tests/test_workflows.py` holds that.
- There is no Content-Security-Policy: the notebook pages have inline scripts and load MathJax from a CDN.
