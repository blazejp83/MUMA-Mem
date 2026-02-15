---
phase: 05-background-intelligence
plan: 01
subsystem: daemon
tags: [act-r, decay, sweep, setInterval, activation, pruning]

# Dependency graph
requires:
  - phase: 03-intelligence
    provides: ACT-R activation scoring + Ebbinghaus decay math
  - phase: 01-foundation
    provides: MemoryStore interface + Redis/SQLite backends
provides:
  - listAllNotes method on MemoryStore for cross-user iteration
  - runDecaySweep function for background activation recalculation
  - startSweepScheduler for configurable interval background processing
  - Plugin lifecycle integration (start/stop sweep with gateway)
affects: [05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "setInterval + clearInterval cleanup pattern for background daemon"
    - "Paginated iteration via listAllNotes for system-wide operations"

key-files:
  created:
    - src/daemon/sweep.ts
    - src/daemon/index.ts
  modified:
    - src/types/store.ts
    - src/store/redis.ts
    - src/store/sqlite.ts
    - src/plugin.ts

key-decisions:
  - "Base-level activation only for background sweep (no spreading/noise without query context)"
  - "Skip pinned notes in sweep (exempt from decay)"
  - "Only update store when activation value actually changed (avoid unnecessary writes)"
  - "Fire-and-forget initial sweep on startup"

patterns-established:
  - "Background daemon: setInterval with cleanup function returned from start"
  - "System-wide note iteration via listAllNotes with paginated batches of 100"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 5 Plan 1: Decay Sweep Daemon Summary

**Background decay sweep recalculates ACT-R base-level activation scores for all notes on configurable interval, detecting pruning candidates system-wide**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T17:31:00Z
- **Completed:** 2026-02-15T17:33:55Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `listAllNotes` to MemoryStore interface for cross-user note iteration (Redis SCAN + SQLite SELECT)
- Created decay sweep daemon that iterates all notes in pages of 100, recomputes base-level activation, and detects pruning candidates
- Integrated sweep scheduler into plugin gateway lifecycle with configurable interval (default 60 min)
- Sweep skips pinned notes and only writes updates when activation actually changed

## Task Commits

Each task was committed atomically:

1. **Task 1: Add listAllNotes to MemoryStore interface and implementations** - `4beea2c` (feat)
2. **Task 2: Create decay sweep daemon and integrate into plugin lifecycle** - `2539b8e` (feat)

## Files Created/Modified
- `src/types/store.ts` - Added `listAllNotes` method to MemoryStore interface
- `src/store/redis.ts` - Redis implementation: SCAN-based cross-user iteration + conflict stubs
- `src/store/sqlite.ts` - SQLite implementation: SELECT with LIMIT/OFFSET + conflict stubs
- `src/daemon/sweep.ts` - `runDecaySweep` function: paginated iteration, activation recalculation, pruning detection
- `src/daemon/index.ts` - `startSweepScheduler`: immediate sweep + setInterval with cleanup
- `src/plugin.ts` - Integrated sweep start in gateway_start, cleanup in gateway_stop

## Decisions Made
- Base-level activation only in background sweep (no spreading activation or stochastic noise since there's no query context)
- Skip pinned notes entirely in sweep iteration (they are exempt from decay)
- Only call store.update when activation value actually changed to avoid unnecessary write overhead
- Fire-and-forget pattern for initial sweep on startup (errors logged, not thrown)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added conflict method stubs to Redis/SQLite stores**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** Parallel plan 05-02 added `saveConflicts`, `getConflicts`, `resolveConflict` to MemoryStore interface without implementing in stores — typecheck/build failed
- **Fix:** Added stub implementations (TODO methods) to both RedisMemoryStore and SQLiteMemoryStore to unblock compilation
- **Files modified:** src/store/redis.ts, src/store/sqlite.ts
- **Verification:** typecheck and build pass
- **Committed in:** 2539b8e (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to unblock typecheck verification. Stubs will be replaced by 05-02 full implementations.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Decay sweep infrastructure complete and running in background
- `listAllNotes` available for consolidation engine (05-02/05-03) to use
- Ready for 05-02 (Consolidation Engine) execution in parallel

---
*Phase: 05-background-intelligence*
*Completed: 2026-02-15*
