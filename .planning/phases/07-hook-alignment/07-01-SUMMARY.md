---
phase: 07-hook-alignment
plan: 01
subsystem: plugin
tags: [openclaw, hooks, typescript, event-ctx, derive-userid]

# Dependency graph
requires:
  - phase: 06-integration-types
    provides: OpenClaw hook/context types, deriveUserId helpers
provides:
  - All 6 hook handlers using correct (event, ctx) two-arg signatures
  - Type-safe hook registration via PluginHookHandlerMap
  - Typed registerPlugin accepting OpenClawPluginApi
  - Correct return shape { prependContext } for before_agent_start
affects: [10-hook-extensions, 11-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PluginHookHandlerMap for type-safe api.on() hook registration"
    - "deriveUserId/deriveUserIdFromMessageCtx for userId in hooks without userId field"

key-files:
  created: []
  modified:
    - src/plugin.ts
    - src/types/openclaw.ts

key-decisions:
  - "Added PluginHookHandlerMap to openclaw.ts to resolve type mismatch between generic api.on() and typed handlers"
  - "Removed L1 working memory blocks from message_received and after_tool_call (context lacks sessionId); deferred to Phase 10"
  - "session_end uses deriveUserId(undefined) yielding 'default' since ctx has no sessionKey; promoted items already carry correct userId"

patterns-established:
  - "Hook handlers always use two-arg (event, ctx) with explicit types from openclaw.ts"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 7 Plan 1: Hook Alignment Summary

**Rewrote all 6 hook handlers to typed (event, ctx) two-arg OpenClaw signatures with correct field access, userId derivation, and { prependContext } return shape**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T21:53:31Z
- **Completed:** 2026-02-16T21:56:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote before_agent_start, message_received, and after_tool_call with correct typed signatures, field access from ctx instead of event, and deriveUserId for userId
- Changed before_agent_start return from `{ context }` to `{ prependContext }` matching PluginHookBeforeAgentStartResult
- Removed broken L1 working memory blocks from message_received and after_tool_call (context lacks sessionId/agentId needed for sessions map)
- Fixed session_end, gateway_start, gateway_stop with typed (event, ctx) signatures
- Typed registerPlugin parameter as OpenClawPluginApi (was `any`)
- Added PluginHookHandlerMap to openclaw.ts enabling type-safe api.on() calls
- Zero `any` types remain on hook handlers or api parameter

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix critical hooks (before_agent_start, message_received, after_tool_call)** - `1399414` (feat)
2. **Task 2: Fix minor hooks (session_end, gateway_start, gateway_stop) and type registerPlugin** - `2d56be9` (feat)

## Files Created/Modified
- `src/plugin.ts` - All 6 hook handlers rewritten with typed (event, ctx) signatures; registerPlugin typed as OpenClawPluginApi; removed references to non-existent fields
- `src/types/openclaw.ts` - Added PluginHookHandlerMap type for type-safe api.on() hook registration

## Decisions Made
- Added PluginHookHandlerMap type to openclaw.ts to resolve TypeScript error where generic `(...args: unknown[]) => unknown` handler type conflicted with specific typed handlers. This provides full type safety for known hook names while falling back to generic for unknown hooks.
- Removed L1 working memory capture from message_received and after_tool_call hooks because their contexts lack sessionId (sessions map is keyed by sessionId). L1 capture deferred to Phase 10 (session_start/before_compaction hooks).
- session_end uses `deriveUserId(undefined)` which returns "default" since the context has no sessionKey. This is acceptable because promoted items already carry the correct userId from when they were added to L1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added PluginHookHandlerMap for type-safe hook registration**
- **Found during:** Task 2 (typing registerPlugin as OpenClawPluginApi)
- **Issue:** Typing api as OpenClawPluginApi caused TS2345 errors on all 6 api.on() calls because the generic `on` handler signature `(...args: unknown[]) => unknown` is incompatible with typed handlers like `(event: PluginHookBeforeAgentStartEvent, ctx: PluginHookAgentContext) => ...`
- **Fix:** Added PluginHookHandlerMap type mapping hook names to their typed handler signatures, updated `on` method to use conditional type `K extends keyof PluginHookHandlerMap ? PluginHookHandlerMap[K] : (...args: unknown[]) => unknown`
- **Files modified:** src/types/openclaw.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 2d56be9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for TypeScript compilation with typed api parameter. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 6 hooks properly typed and using correct event/ctx field access patterns
- Ready for Phase 8 (Tool Factory) which depends on Phase 6, not Phase 7
- Ready for Phase 10 (Hook Extensions) which will add session_start/before_compaction hooks for L1 capture
- No blockers or concerns

---
*Phase: 07-hook-alignment*
*Completed: 2026-02-16*
