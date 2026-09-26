# 0004 — Value at risk V

**Context.** V drives CRC, CAC and B. The BG/NBD CLV already discounts by P(alive), so multiplying it by the classifier's p would count churn risk twice. The origin project used `ticket × round(H / cadence)`, which is noisy and limited to the H window.

**Decision.**
- `V = m · AOV^GG · (T / cadence)`.
- `AOV^GG` is the Gamma-Gamma shrunk average order value.
- m is the gross margin, set by the user.
- T is the value horizon, set by the user (default 365 days). T = H reproduces the origin project's view.
- A floor on cadence bounds extreme values.

**Alternatives.**
- The origin formula: noisy, and it understates value.
- Full BG/NBD CLV: double counts churn risk.

**Consequences.**
- V can be recomputed in the browser from `AOV^GG` and cadence, so the margin and T sliders respond instantly.
- The Gamma-Gamma fit becomes part of the pipeline.
