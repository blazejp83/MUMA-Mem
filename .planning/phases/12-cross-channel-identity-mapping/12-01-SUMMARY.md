---
phase: 12-cross-channel-identity-mapping
plan: 01
subsystem: identity
tags: [zod, identity-mapping, cross-channel, config]

# Dependency graph
requires:
  - phase: 11-integration-tests
    provides: full plugin integration test coverage
provides:
  - identityMap config field for cross-channel identity resolution
  - buildReverseIdentityMap utility for channel→canonical name mapping
  - identity-aware deriveUserId and deriveUserIdFromMessageCtx functions
  - getReverseIdentityMap accessor on plugin module
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reverse identity map pattern: config-time build, runtime lookup via optional parameter"
    - "Backward-compatible function extension via optional Map parameter"

key-files:
  modified:
    - src/config.ts
    - src/utils/deriveUserId.ts
    - src/utils/index.ts
    - src/utils/__tests__/deriveUserId.test.ts
    - src/plugin.ts
    - src/tools/index.ts
    - src/__tests__/tool-factory.test.ts

key-decisions:
  - "Reverse map built at registerPlugin() time, not per-call — O(1) lookup at runtime"
  - "Optional parameter on derive functions preserves full backward compatibility"

patterns-established:
  - "Identity map pattern: canonical name → channel identities in config, reverse map for O(1) lookup"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 12 Plan 01: Cross-Channel Identity Mapping Summary

**Optional identityMap config with reverse-map lookup enables same human on multiple channels (Telegram + Discord) to share one unified memory store**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T14:18:41Z
- **Completed:** 2026-02-17T14:22:05Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added optional `identityMap` field to MumaConfigSchema for declaring cross-channel identities
- Created `buildReverseIdentityMap()` with duplicate identity validation (throws clear error on conflicts)
- Extended `deriveUserId()` and `deriveUserIdFromMessageCtx()` with optional reverse map parameter for canonical name resolution
- Wired identity map through all 5 plugin hook callsites and tool factory
- Added 12 new unit tests covering reverse map building, identity resolution, and backward compatibility
- All 98 tests pass, zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add identityMap config + reverse map builder + update derive functions + tests** - `2827ef0` (feat)
2. **Task 2: Wire identity map through plugin hooks and tool factory** - `afffe67` (feat)

## Files Created/Modified
- `src/config.ts` - Added optional identityMap field to MumaConfigSchema
- `src/utils/deriveUserId.ts` - Added buildReverseIdentityMap, updated deriveUserId and deriveUserIdFromMessageCtx with optional reverseIdentityMap parameter
- `src/utils/index.ts` - Added buildReverseIdentityMap to re-exports
- `src/utils/__tests__/deriveUserId.test.ts` - Added 12 new tests for identity mapping
- `src/plugin.ts` - Built reverse map at register time, wired through all hook callsites, added getReverseIdentityMap accessor, cleanup in gateway_stop
- `src/tools/index.ts` - Tool factory reads reverse map via getReverseIdentityMap()
- `src/__tests__/tool-factory.test.ts` - Added getReverseIdentityMap to plugin mock

## Decisions Made
- Reverse map built once at registerPlugin() time (not per-call) for O(1) runtime lookup
- Optional parameter approach on derive functions preserves full backward compatibility without any breaking changes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added getReverseIdentityMap to tool-factory test mock**
- **Found during:** Task 2 (Wire identity map through plugin hooks)
- **Issue:** Existing tool-factory.test.ts mocked ../plugin.js but did not include the new getReverseIdentityMap export, causing 6 test failures
- **Fix:** Added `getReverseIdentityMap: vi.fn().mockReturnValue(new Map())` to the existing vi.mock
- **Files modified:** src/__tests__/tool-factory.test.ts
- **Verification:** All 98 tests pass
- **Committed in:** afffe67 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep existing tests passing with the new export. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 12 complete: cross-channel identity mapping fully implemented
- v1.2 Identity milestone complete
- No blockers or concerns

---
*Phase: 12-cross-channel-identity-mapping*
*Completed: 2026-02-17*
