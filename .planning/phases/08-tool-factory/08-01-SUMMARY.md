---
phase: 08-tool-factory
plan: 01
subsystem: api
tags: [openclaw, tools, factory-pattern, plugin-sdk, agent-tools]

# Dependency graph
requires:
  - phase: 06-integration-types
    provides: OpenClaw SDK type definitions (AgentTool, OpenClawPluginToolContext, OpenClawPluginToolFactory)
  - phase: 06-integration-types
    provides: deriveUserId helper for parsing sessionKey
provides:
  - 10 agent tools using OpenClaw factory pattern with correct execute(toolCallId, params) signature
  - Tool registration at register() time (factory defers instantiation to per-session calls)
  - Underscore-named tools with label fields matching OpenClaw SDK conventions
affects: [11-integration-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenClaw tool factory pattern: factory closure captures userId/agentId from ctx"
    - "Tool execute signature: (toolCallId: string, params: unknown) => unknown"
    - "Tool registration at register() time, not gateway_start time"

key-files:
  created: []
  modified:
    - src/tools/index.ts
    - src/plugin.ts

key-decisions:
  - "Keep JSON Schema parameters instead of switching to TypeBox (JSON Schema compatible)"
  - "L1 working memory lookup removed from memory_get_context (sessionKey vs sessionId limitation)"
  - "Tool registration moved to register() time; factory defers instantiation to per-session"

patterns-established:
  - "Tool factory pattern: single factory returns AgentTool[] with closure-captured context"
  - "Underscore naming convention for all tool names (memory_write, not memory.write)"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 8 Plan 1: Tool Factory Summary

**Converted all 10 agent tools to OpenClaw factory pattern with closure-captured userId/agentId, underscore naming, labels, and correct execute(toolCallId, params) signature**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T22:03:00Z
- **Completed:** 2026-02-16T22:05:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote all 10 tools from direct-object registration to a single factory function returning AgentTool[]
- Factory captures userId (via deriveUserId) and agentId from OpenClawPluginToolContext closure
- All tools use correct execute(toolCallId: string, params: unknown) signature
- Renamed all tools from dot notation to underscores (memory.write -> memory_write)
- Added label field to all 10 tools
- Moved registerTools(api) from gateway_start handler to registerPlugin() body

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite tools/index.ts to factory pattern** - `c70bc12` (feat)
2. **Task 2: Move tool registration from gateway_start to registerPlugin** - `d4103ca` (feat)

## Files Created/Modified
- `src/tools/index.ts` - Complete rewrite: factory pattern, underscore names, labels, correct execute signature
- `src/plugin.ts` - Moved registerTools(api) from gateway_start to registerPlugin() body

## Decisions Made
- Kept JSON Schema parameters instead of switching to TypeBox (TypeBox produces JSON Schema-compatible output, so raw JSON Schema objects work fine)
- Removed L1 working memory lookup from memory_get_context tool (factory ctx provides sessionKey but not sessionId; the sessions Map is keyed by sessionId, making L1 lookup impossible here; deferred to Phase 10)
- Moved tool registration to register() time since factory pattern defers actual tool instantiation to per-session calls

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tool factory pattern complete, all 10 tools aligned with OpenClaw SDK
- Ready for Phase 9 (CLI Bridge) and Phase 11 (Integration Tests)
- No blockers or concerns

---
*Phase: 08-tool-factory*
*Completed: 2026-02-16*
