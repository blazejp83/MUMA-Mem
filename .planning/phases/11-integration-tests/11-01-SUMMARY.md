---
phase: 11-integration-tests
plan: 01
subsystem: testing
tags: [vitest, mock-api, integration-tests, openclaw-plugin]

# Dependency graph
requires:
  - phase: 8-tool-factory
    provides: tool factory pattern with 10 tools
  - phase: 9-cli-bridge
    provides: CLI registrar with memory command
  - phase: 10-hook-extensions
    provides: 9 hook handlers including session_start, before_compaction, before_reset
provides:
  - mock OpenClawPluginApi factory (createMockApi) for reuse in further tests
  - registration contract test (9 hooks, 10 tools, 1 CLI)
  - tool factory shape tests (names, labels, parameters, execute, userId/agentId capture)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mock API factory pattern for OpenClaw plugin testing"
    - "vi.mock hoisting for heavy dependency isolation"

key-files:
  created:
    - src/__tests__/mock-api.ts
    - src/__tests__/registration.test.ts
    - src/__tests__/tool-factory.test.ts
  modified: []

key-decisions:
  - "Mock all heavy dependencies (store, embedding, LLM, pipeline, sync, daemon, memory, consolidation, access) at module level to isolate registration-time behavior"
  - "Explicit vi import in mock-api.ts (non-test utility file) for typecheck compatibility"

patterns-established:
  - "createMockApi() factory: reusable mock that captures hooks/tools/CLI registrations for assertion"

# Metrics
duration: 3min
completed: 2026-02-17
---

# Phase 11 Plan 01: Registration and Tool Factory Integration Tests Summary

**Mock API helper + 11 integration tests verifying plugin registration contract (9 hooks, 10 tools, CLI) and tool factory shape with userId/agentId capture**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-17T09:02:37Z
- **Completed:** 2026-02-17T09:05:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Reusable `createMockApi()` factory that builds a mock OpenClawPluginApi capturing all hook/tool/CLI registrations
- Registration test verifies all 9 hooks registered, 1 tool factory with 10 tool names, 1 CLI registrar with "memory" command, and expected log messages
- Tool factory test verifies: factory produces 10 tools, each with correct shape (name, label, description, parameters, execute), correct name set, userId derived from sessionKey, agentId captured from context, agentId defaults to "unknown"

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mock API helper and test registerPlugin registration** - `1354f80` (test)
2. **Task 2: Test tool factory returns correctly shaped tools** - `9c85668` (test)

## Files Created/Modified
- `src/__tests__/mock-api.ts` - Reusable mock OpenClawPluginApi factory for integration tests
- `src/__tests__/registration.test.ts` - 4 tests verifying registration contract (hooks, tools, CLI, logs)
- `src/__tests__/tool-factory.test.ts` - 7 tests verifying tool factory shape, names, and userId/agentId capture

## Decisions Made
- Mock all heavy dependencies at module level with vi.mock to isolate registration-time behavior from runtime behavior
- Added explicit `import { vi } from "vitest"` in mock-api.ts since it is a utility file (not `.test.ts`) and vitest globals are not recognized by tsc

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added explicit vi import to mock-api.ts for typecheck**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** mock-api.ts uses vi.fn() but is not a .test.ts file, so vitest globals were not recognized by tsc --noEmit
- **Fix:** Added `import { vi } from "vitest"` at top of mock-api.ts
- **Files modified:** src/__tests__/mock-api.ts
- **Verification:** pnpm run typecheck passes clean
- **Committed in:** 9c85668 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal fix for TypeScript compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Mock API helper is reusable for Plan 02 (lifecycle integration tests)
- Registration and tool factory contracts fully verified
- Pre-existing `gateway-lifecycle.test.ts` file has a failing test (not created by this plan) -- unrelated to this work

---
*Phase: 11-integration-tests*
*Completed: 2026-02-17*
