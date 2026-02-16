---
phase: 09-cli-bridge
plan: 01
subsystem: cli
tags: [commander, cli, openclaw, dual-cli]

# Dependency graph
requires:
  - phase: 06-integration-types
    provides: OpenClaw type definitions (OpenClawPluginApi, OpenClawPluginCliRegistrar)
provides:
  - registerMemoryCli function for OpenClaw CLI integration
  - CommanderLikeCommand type for Commander.js interop
  - 4 CLI subcommands (stats, export, consolidate, conflicts) under memory namespace
affects: [11-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [dual-cli pattern (standalone muma + OpenClaw memory subcommand)]

key-files:
  created: [src/cli/openclaw.ts]
  modified: [src/types/openclaw.ts, src/plugin.ts]

key-decisions:
  - "CommanderLikeCommand as local interface (no commander npm dep)"
  - "CLI registration at register() time alongside tool registration"

patterns-established:
  - "Dual CLI: standalone muma binary + OpenClaw memory subcommand sharing same command implementations"

# Metrics
duration: 1min
completed: 2026-02-17
---

# Phase 9 Plan 1: CLI Bridge Summary

**Commander-based CLI registrar wrapping 4 memory commands (stats, export, consolidate, conflicts) under OpenClaw `memory` subcommand namespace with local CommanderLikeCommand type**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-16T23:01:52Z
- **Completed:** 2026-02-16T23:03:11Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `CommanderLikeCommand` interface to type definitions for Commander.js interop without npm dependency
- Created `src/cli/openclaw.ts` with `registerMemoryCli` function registering 4 subcommands
- Wired CLI registration into `registerPlugin()` following same pattern as tool registration
- Standalone `muma` CLI binary remains completely unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Create OpenClaw CLI registrar with Commander type** - `48cb904` (feat)
2. **Task 2: Wire CLI registration into registerPlugin** - `88916fb` (feat)

## Files Created/Modified
- `src/cli/openclaw.ts` - OpenClaw CLI registrar with registerMemoryCli function and 4 subcommands
- `src/types/openclaw.ts` - Added CommanderLikeCommand interface, updated OpenClawPluginCliContext.program type
- `src/plugin.ts` - Import and call registerMemoryCli(api) in registerPlugin()

## Decisions Made
- CommanderLikeCommand defined as local interface (no commander npm dependency) -- Commander instance provided by OpenClaw at runtime
- CLI registration at register() time, same pattern as tool registration -- actual Commander commands only run when user invokes them via OpenClaw CLI

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 complete (1/1 plans), ready for Phase 10: Hook Extensions
- All 4 CLI commands properly wrapped for OpenClaw integration
- Standalone CLI preserved for direct usage

---
*Phase: 09-cli-bridge*
*Completed: 2026-02-17*
