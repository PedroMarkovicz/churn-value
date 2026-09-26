# 0007 — Frontend: Vite + React + TypeScript

**Context.** The frontend is a fully static dashboard SPA with no SSR or SEO requirements.

**Decision.**
- Vite + React + TS.
- Tailwind + shadcn/ui for components and TanStack Table for tables.
- Observable Plot or visx for charts.
- Scenario state is kept in the URL.
- Vitest for unit tests and Playwright for end-to-end tests.

**Alternatives.**
- SvelteKit: smaller ecosystem.
- Next.js static export: SSR and RSC would go unused.
- Astro islands: better suited to content-heavy sites.

**Consequences.**
- Strong market recognition and a wide ecosystem, including `onnxruntime-web`.
- Every scenario can be shared as a link.
