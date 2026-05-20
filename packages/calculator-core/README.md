# @copilot-budget/calculator-core

Pure budget math for the Copilot Budget Command Calculator.

This package contains the calculation engine that powers the Tier Planner: pool
sizing, post-pool spend projections, budget constraint detection, reverse
solvers, and multi-cost-center constraint analysis.

It is deliberately pure: no React, no DOM, no IO. Inputs and outputs are plain
numbers and serializable records. This makes the math easy to test, safe to
reuse, and a candidate for running in workers, on a server, or in a CLI.

## Why a separate package?

- **Stability.** The calculation engine is the most heavily-tested code in the
  repository (~300 cases). Isolating it as a package signals that it is a
  versioned contract, independent of the React app's churn.
- **Reuse.** Workers, server-side reports, and parity tests can all import
  identical math.
- **Refactor safety.** Larger architectural changes in the app (state stores,
  routers, fetch layers) cannot accidentally break the calculator.

## Public API

See `src/index.ts` for the full export surface. Everything is re-exported from
the package root.
