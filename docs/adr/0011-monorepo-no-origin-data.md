# 0011 — Monorepo, typed contract, clean provenance

**Context.** Python and TS share an artifact contract and golden vectors, so the two must change together. The origin project contains company data and branding.

**Decision.**
- Use one repository with `ml/`, `web/`, `contracts/` and `docs/`.
- Generate JSON Schemas from Pydantic, then generate TS types from those schemas. A drift check runs in CI.
- Bring **no data, identifiers, branding or code from the origin project** — only reformulated concepts, credited in `docs/design.md` §1.

**Alternatives.**
- Separate repositories: the contract would drift between them.
- Building inside the origin folder: company data would be one `.gitignore` mistake away from being published.

**Consequences.**
- A single CI with path filters.
- A clean public history.
