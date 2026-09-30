# 0013 — Visual design system

**Context.** The site is the portfolio's front door. A reviewer should grasp the model's value in money within a minute, and the charts must be readable by people with colour-vision deficiency.

**Decision.**
- **One bold element.** The Overview shows every holdout customer as a square, ranked by expected profit and coloured by outcome. It is linked to an itemised campaign account: pointing at a line of the account lights the customers behind it. Everything else is quiet: white panels, hairline rules, ink text.
- **Answer-first headlines.** Every page opens with its answer as one sentence, generated from the live scenario and unit-tested, including the empty states.
- **Light only.** No dark mode.
- **Type.** Newsreader for statements and money totals; Public Sans for everything the user operates. Both are self-hosted.
- **Colour by job.**
  - Interface indigo `#4A3AA7` is never a data colour.
  - Money is diverging: profit blue `#2F5BD3`, loss red `#B8352F`, grey midpoint.
  - Customer outcome: blue for called (dark if the customer would have churned, light if they would have stayed); red `#D9423F` only for churners the list missed.
  - Models take an 8-slot categorical palette by ladder position: slots 1–5 are the notebooks' colours, 6–8 are green `#008300`, teal `#0E8BA6` and brown `#A0662B`.
- **Blue, not green, for "called" and profit.** Measured in OKLab under simulated deuteranopia (Machado et al., 2009), green against red on the field falls to ΔE 6.0, below the safe band; blue against red holds ΔE 24. The finance convention "green is gain" is carried by words and signs instead.
- **Motion.** One entrance: the field is uncovered in rank order by a single compositor-only transform. Animating the 1,920 squares one by one blocked the main thread for 1.2 s (Lighthouse TBT).
- **Every chart** has a takeaway title, a table view, a hover tooltip, direct labels on the few points that matter, and one y-axis.

**Alternatives.**
- A profit-curve hero: the right chart for the Simulator, but it needs reading.
- A dark stage for the field: more dramatic, but it adds a second theme for one element.
- Green for profit: rejected on the measured colour-blind separation.

**Consequences.**
- `npm run palette` checks the data palettes in CI with its own OKLab and colour-vision implementation.
- The outcome tints fail the lightness and contrast checks by design, so the field always ships with a counted legend, the linked account and a table view.
- A ninth model never gets a generated hue: charts fold extra models into small multiples or a table.
