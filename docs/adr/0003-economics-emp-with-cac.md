# 0003 — Economics: EMP extended with CAC

**Context.** The origin project computed `CRC balance = saved revenue − ΣCRC` and `CAC balance = saved revenue − ΣCAC`. It assumed every retention attempt succeeds and used a fixed 0.5 threshold. The CAC balance was inconsistent: it subtracted a replacement cost from revenue that, in that scenario, was never saved.

**Decision.**
- Keep `CRC = λc·V` and `CAC = λa·CRC` from the origin project.
- The benefit of preventing a churn is `B = min(V, CAC)`, because a rational firm covers a loss the cheapest way.
- The expected profit of contacting a customer is `E[π] = p·γ·(B − CRC) − (1 − p)·CRC − c`.
- Contact a customer iff `E[π] > 0`. The rule is analytic, so no threshold is searched on test data; it implies a different threshold for each customer.
- An optional budget or capacity mode takes the greedy top-k by `E[π]`.
- Compare these policies: do nothing, contact all, random, each model rung, and oracle.
- The framework follows Verbraken, Verbeke & Baesens (2013).

**Alternatives.**
- Keep the original formulas: they are inconsistent.
- `B = V + CAC`: double counts, because a replaced customer restores V at cost CAC.
- A replacement-policy toggle: allows irrational scenarios.

**Defaults (amended after the prototype).** λc = 0.10 and λa = 10, which gives CAC = V: exactly the boundary between the two regimes of B. The original defaults (λc = 0.25, λa = 5) were designed for a 90-day revenue window. Applied to a 12-month margin, they put the break-even probability at ≈ 0.53, and even the best untuned model lost money on the test cutoff. The original values remain reachable on the sliders. Details are in design §4.4.

**Consequences.**
- Probabilities must be calibrated (ADR 0005).
- The ratio CAC/V equals λa·λc. The UI must state which regime of B applies.
- γ is an assumption, which is why the app has a sensitivity page.
