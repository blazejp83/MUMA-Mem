---
phase: 04-multi-agent
plan: 01
subsystem: access
tags: [visibility, domain-matching, agent-profiles, access-control]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: MumaConfig type with agentMemory/defaultAgentMemory/visibility schemas
provides:
  - resolveAgentProfile function for per-agent config resolution
  - matchDomainPrefix function for longest-prefix domain matching
  - applyDomainRule function for domain-level visibility rules
  - canAgentSeeNote function for four-level visibility gating
  - AgentProfile type
affects: [04-03-visibility-integration, read-pipeline, write-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [longest-prefix domain matching, two-axis access model]

key-files:
  created: [src/access/visibility.ts, src/access/__tests__/visibility.test.ts, src/access/index.ts]
  modified: []

key-decisions:
  - "open and scoped both require domain match via matchDomainPrefix"
  - "private bypasses domain check — owner or canSeePrivate is sufficient"

patterns-established:
  - "Longest-prefix matching: note domain 'a/b/c' matches agent domain 'a/b' via startsWith(domain + '/')"
  - "Wildcard '*' matches all domains unconditionally"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 4 Plan 1: Access Control Summary

**Pure functions for two-axis (domain + visibility) memory access model with longest-prefix matching and four visibility levels**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T16:54:08Z
- **Completed:** 2026-02-15T16:56:31Z
- **Tasks:** 2 (RED + GREEN; REFACTOR skipped — code already clean)
- **Files modified:** 3

## Accomplishments
- Four pure access control functions: resolveAgentProfile, matchDomainPrefix, applyDomainRule, canAgentSeeNote
- 29 test cases covering all visibility levels, domain prefix matching edge cases, and agent profile resolution
- AgentProfile type and barrel export for clean module API
- Full TDD cycle: RED (failing tests) then GREEN (passing implementation)

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests** - `081c9be` (test)
2. **GREEN: Implementation** - `4f47295` (feat)

_REFACTOR phase reviewed — no changes needed, code already minimal and clean._

## Files Created/Modified
- `src/access/visibility.ts` - Four exported functions: resolveAgentProfile, matchDomainPrefix, applyDomainRule, canAgentSeeNote
- `src/access/__tests__/visibility.test.ts` - 29 test cases covering all specified behavior
- `src/access/index.ts` - Barrel re-export of all functions and AgentProfile type

## Decisions Made
- open and scoped visibility both require domain match via matchDomainPrefix — the distinction is semantic (open means "available to all domains that have access", scoped means "restricted to same domain")
- private visibility bypasses domain check entirely — only owner identity or canSeePrivate flag matters

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Access control logic ready for integration into read pipeline (visibility gate) and write pipeline (domain rule application)
- Ready for 04-02: Cross-Agent Event Bus (parallel) and 04-03: Visibility Integration (depends on 04-01)

---
*Phase: 04-multi-agent*
*Completed: 2026-02-15*
