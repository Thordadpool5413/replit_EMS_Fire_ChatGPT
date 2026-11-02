---
name: PulseIQ scoring explanations
description: Keep score calculations and every user-facing explanation tied to the same active factors and weights.
---

All PulseIQ score details must come from the shared factor evaluator. Do not duplicate thresholds, contributions, or active weights in a display component. Pass the current calibrated weights through profiles, regional views, and methodology dialogs. Claim records and demographic fields are not scored factors.

**Why:** Earlier explanations had independent factor logic and continued showing excluded claims, so they could contradict the calculated score after scoring changes.

**How to apply:** Use the shared evaluator for per-agency factor values and contributions, the shared weight/formula helpers for methodology, and calculate regional scores with current weights rather than persisted legacy breakdowns.

Keep the pure score-explanation mapper separate from `syncStore`. That module initializes baseline agency data, including a compressed county feed that is only supported through Vite's asset handling. `syncStore` can re-export the explanation API for compatibility, while UI and Node tests should import the pure module directly.

**Why:** Importing the storage module from Node-based rendered-view tests loads Vite-only compressed data and prevents the tests from running.

**How to apply:** Place reusable score explanation logic in a dependency-light utility that imports only types and scoring helpers; avoid adding baseline data or browser storage dependencies to scoring tests.
