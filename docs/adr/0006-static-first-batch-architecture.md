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
