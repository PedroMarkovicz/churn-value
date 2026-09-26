# 0001 — Dataset: UCI Online Retail II

**Context.** The new project must use a public, churn-relevant dataset. It should also preserve the origin project's transactional concepts: purchase cadence, expected next purchase, and revenue within a window.

**Decision.** Use UCI Online Retail II (Chen, 2012; CC BY 4.0; 1,067,371 lines; 2009-12-01 to 2011-12-09; amounts in £). Like the origin project, it is a non-contractual, B2B-like wholesale setting.

**Alternatives.**
- KKBox: contractual, large and temporal, but its competition licence restricts redistribution, the data is heavy, and the cadence concept would be lost.
- IBM Telco: it has a CLTV column, but it is overused, small and a single static snapshot.
- Cell2Cell: a static snapshot without transactions.

**Consequences.**
- The churn label has to be defined (ADR 0002).
- The population is only a few thousand customers, so confidence intervals are mandatory.
- The data supports out-of-time validation and BTYD baselines.
- The licence allows redistributing derived artifacts, with attribution.
