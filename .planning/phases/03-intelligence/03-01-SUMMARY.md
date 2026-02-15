---
phase: 03-intelligence
plan: 01
subsystem: activation
tags: [act-r, ebbinghaus, decay, scoring, vitest, tdd, cognitive-science]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Note type with access_log, activation, half_life, pinned fields
  - phase: 01-foundation
    provides: MumaConfig with ActivationConfig and DecayConfig schemas
provides:
  - baseLevelActivation (ACT-R B_i with Petrov 2006 hybrid for large logs)
  - spreadingActivation (context-weighted similarity)
  - stochasticNoise (logistic distribution noise)
  - totalActivation (B_i + S_i + epsilon)
  - computeRetention (Ebbinghaus R(t) = 2^(-t/halfLife))
  - reinforceHalfLife (proportional half-life increase on retrieval)
  - isPruningCandidate (threshold + pinned check)
affects: [03-02-search-integration, 03-03-working-memory, 05-background-intelligence]

# Tech tracking
tech-stack:
  added: [vitest]
  patterns: [TDD red-green-refactor, pure math functions, Petrov hybrid approximation]

key-files:
  created: [src/activation/scoring.ts, src/activation/decay.ts, src/activation/index.ts, src/activation/__tests__/scoring.test.ts, src/activation/__tests__/decay.test.ts, vitest.config.ts]
  modified: [package.json]

key-decisions:
  - "Petrov 2006 hybrid threshold at 50 accesses — balances accuracy vs performance"
  - "MIN_DELTA_HOURS = 1/3600 (1 second) — prevents division by zero for simultaneous access timestamps"
  - "Logistic distribution with rejection sampling for u in (0,1) — avoids +-Infinity edge cases"

patterns-established:
  - "Pure function pattern: all activation/decay functions are stateless with no imports from plugin modules"
  - "TDD with Vitest: globals enabled, src/**/*.test.ts pattern, vitest run for CI"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 3 Plan 1: ACT-R Activation + Ebbinghaus Decay Summary

**Pure math functions for ACT-R base/spreading/noise activation scoring and Ebbinghaus half-life decay with Vitest TDD infrastructure**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T16:12:21Z
- **Completed:** 2026-02-15T16:14:42Z
- **Tasks:** 2 (RED + GREEN; REFACTOR skipped — code already clean)
- **Files modified:** 7

## Accomplishments
- ACT-R base-level activation with exact computation and Petrov 2006 hybrid approximation for >50 accesses
- Spreading activation, stochastic logistic noise, and total activation summation
- Ebbinghaus retention, half-life reinforcement, and pruning candidate detection
- 22 passing tests covering all behavior cases from plan specification
- Vitest test infrastructure established for the project

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests + Vitest setup** - `96ee099` (test)
2. **GREEN: Implementation passing all tests** - `fd3748f` (feat)

_REFACTOR skipped — functions are pure, minimal, and well-documented. No cleanup needed._

## Files Created/Modified
- `src/activation/scoring.ts` - baseLevelActivation, spreadingActivation, stochasticNoise, totalActivation
- `src/activation/decay.ts` - computeRetention, reinforceHalfLife, isPruningCandidate
- `src/activation/index.ts` - Barrel re-export of all activation/decay functions
- `src/activation/__tests__/scoring.test.ts` - 13 tests for scoring functions
- `src/activation/__tests__/decay.test.ts` - 9 tests for decay functions
- `vitest.config.ts` - Vitest configuration with globals and include pattern
- `package.json` - Added vitest devDep, test script, esbuild build approval

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Petrov hybrid threshold = 50 | Standard ACT-R cutoff; balances accuracy for small logs vs O(1) for large |
| MIN_DELTA_HOURS = 1 second | Prevents division by zero / Infinity for simultaneous timestamps without distorting results |
| Rejection sampling for logistic noise | Ensures u is strictly in (0,1), avoiding Math.log(0) or Math.log(Infinity) |
| No REFACTOR commit | Functions are already minimal pure math with full JSDoc — no cleanup to do |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Activation scoring and decay functions ready for integration into search pipeline (03-02)
- Working memory L1 can use these functions for promote/fade decisions (03-03)
- All requirements addressed: ACT-01 (base-level), ACT-02 (spreading), ACT-03 (noise), FORGET-01 (retention), FORGET-03 (reinforcement), FORGET-04 (pruning)

---
*Phase: 03-intelligence*
*Completed: 2026-02-15*
