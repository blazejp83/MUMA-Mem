---
phase: 05-background-intelligence
plan: 04
subsystem: cli
tags: [cli, parseArgs, stats, export, consolidation, conflicts, bin]

# Dependency graph
requires:
  - phase: 05-01
    provides: MemoryStore listAllNotes + store backends
  - phase: 05-02
    provides: Consolidation engine + conflict storage
  - phase: 05-03
    provides: distillMemoryMd + writeMemoryMdFile
provides:
  - muma CLI binary with 4 subcommands (stats, export, consolidate, conflicts)
  - Standalone memory management outside of agent conversations
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Node.js util.parseArgs for CLI argument parsing (no external deps)"
    - "Config cascade: --config flag > .muma.json in cwd > ~/.muma.json > defaults"
    - "Default SQLite-only when no config file found (skip Redis)"

key-files:
  created:
    - src/cli/index.ts
    - src/cli/stats.ts
    - src/cli/export.ts
    - src/cli/consolidate.ts
    - src/cli/conflicts.ts
  modified:
    - package.json

key-decisions:
  - "Node.js built-in parseArgs instead of external CLI framework (zero new deps)"
  - "Default config clears Redis URL for CLI standalone operation (SQLite only)"
  - "Embedding placeholder in export (dimensions + omitted flag instead of binary)"

patterns-established:
  - "CLI command pattern: export async function xxxCommand(store, ...): Promise<void>"
  - "Config cascade for standalone CLI operation"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 5 Plan 4: CLI Commands Summary

**muma CLI binary with 4 subcommands: stats (activation distribution, domain counts), export (JSON dump with embedding placeholder), consolidate (full pipeline + MEMORY.md), conflicts (user-filtered conflict listing)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T17:37:14Z
- **Completed:** 2026-02-15T17:42:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `muma` CLI binary with Node.js built-in parseArgs (no external CLI dependencies)
- Stats command shows memory counts, activation distribution (high/medium/low), domain breakdown, age stats, pinned/pruning counts
- Export command dumps all memories to JSON with embedding replaced by `{dimensions, omitted}` placeholder
- Consolidate command runs full pipeline (cluster, summarize, conflict detect/resolve) plus MEMORY.md distillation
- Conflicts command lists unresolved (or all with --all) conflicts filtered by user ownership
- Config cascade: --config flag, .muma.json in cwd, ~/.muma.json, or SQLite-only defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CLI entry point with stats and export commands** - `9c258a7` (feat)
2. **Task 2: Add consolidate and conflicts CLI commands** - `074628a` (feat)

## Files Created/Modified
- `src/cli/index.ts` - CLI entry point with parseArgs, config loading, command routing
- `src/cli/stats.ts` - Memory stats: counts, activation distribution, domains, age
- `src/cli/export.ts` - JSON export with embedding placeholder
- `src/cli/consolidate.ts` - Manual consolidation trigger + MEMORY.md generation
- `src/cli/conflicts.ts` - Conflict listing filtered by user with previews
- `package.json` - Added `bin.muma` pointing to `dist/cli/index.js`

## Decisions Made
- Used Node.js built-in `util.parseArgs` instead of commander/yargs to maintain zero external CLI dependencies
- Default CLI config clears Redis URL so standalone operation uses SQLite only (users can override via .muma.json)
- Export replaces Float32Array embeddings with `{dimensions: N, omitted: true}` placeholder since binary data is not useful in JSON

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Default config Redis URL cleared for standalone CLI**
- **Found during:** Task 1 (CLI verification)
- **Issue:** MumaConfigSchema defaults always set redis.url to "redis://localhost:6379", causing CLI to hang trying Redis when no config file exists
- **Fix:** After parsing defaults, explicitly clear redis.url to empty string so createStore skips Redis
- **Files modified:** src/cli/index.ts
- **Verification:** `muma stats --user test` runs without Redis connection attempt
- **Committed in:** 074628a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for CLI to work standalone without Redis. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 CLI commands operational (CLI-01 through CLI-04)
- Phase 5 complete pending 05-03 parallel execution
- Ready for milestone completion

---
*Phase: 05-background-intelligence*
*Completed: 2026-02-15*
