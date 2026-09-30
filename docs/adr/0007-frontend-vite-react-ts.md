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

**Amendments after the Plan 3 design.**
- Charts use visx (scales and shapes) with small shared primitives, not Observable Plot: the linked highlight between the customer field and the account, the crosshairs and the direct labels need full control of the SVG.
- Routing is TanStack Router with plain query strings (`?g=0.4&bm=calls`). A typed parser validates the scenario, resets bad values to their defaults and says which. zod was dropped: it added about 15 KB for what one function does.
- Radix primitives (through shadcn) are restyled with the design tokens (ADR 0013); nothing of the default component look remains.
- The artifacts are validated at load time by Ajv standalone validators generated from the JSON Schemas at build time: no `eval`, no runtime Ajv.
- Fonts are self-hosted with `@fontsource`; the site makes no third-party requests.
- Toolchain pins: TypeScript 6.0 (typescript-eslint does not support 7 yet) and ESLint 9 (eslint-plugin-jsx-a11y does not support 10 yet).
