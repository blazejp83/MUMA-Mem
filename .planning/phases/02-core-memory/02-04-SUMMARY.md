---
phase: 02-core-memory
plan: 04
subsystem: pipeline
tags: [vector-similarity, zettelkasten, bidirectional-links, llm-batching, note-linking, memory-evolution]

# Dependency graph
requires:
  - phase: 02-01
    provides: LLM provider for evolve step
  - phase: 01-03
    provides: Redis store search/update for link step
  - phase: 01-04
    provides: SQLite store search/update for link step
provides:
  - link() step for bidirectional note auto-linking via vector similarity
  - evolve() step for updating linked notes' context via batched LLM
affects: [02-05-orchestrator, 03-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bidirectional linking via store.update() on both notes"
    - "Batched LLM call for N linked notes instead of N separate calls"
    - "Graceful LLM failure fallback (skip evolution, no data loss)"

key-files:
  created:
    - src/pipeline/link.ts
    - src/pipeline/evolve.ts
  modified:
    - src/pipeline/index.ts
    - src/index.ts

key-decisions:
  - "Vector similarity only for linking (no LLM) — fast, cheap at write time"
  - "Single batched LLM call in evolve — reduces N calls to 1"
  - "Cap linked notes at 5 per evolve call — bounds token usage"
  - "Graceful LLM failure in evolve — skip evolution rather than lose data"

patterns-established:
  - "Bidirectional link pattern: update both notes' links arrays symmetrically"
  - "Batched LLM pattern: single prompt with all items, array response"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 2 Plan 4: Note Linking Summary

**Zettelkasten-style bidirectional note linking via vector similarity and batched LLM context evolution**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T15:38:34Z
- **Completed:** 2026-02-15T15:40:11Z
- **Tasks:** 2 (+ barrel export update)
- **Files modified:** 4

## Accomplishments
- link() creates bidirectional links between new notes and similar existing notes using vector similarity (LINK-01, LINK-03, LINK-05)
- evolve() updates linked notes' context and tags when new related memory arrives via single batched LLM call (LINK-04, PIPE-05, PIPE-06)
- Both functions take store/llm as parameters with no global state

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Link step** - `7baf3dc` (feat)
2. **Task 2: Implement Evolve step** - `0b198bc` (feat)
3. **Barrel export update** - `fd2559a` (feat)

## Files Created/Modified
- `src/pipeline/link.ts` - Bidirectional note linking via vector similarity search
- `src/pipeline/evolve.ts` - Batched LLM context evolution for linked notes
- `src/pipeline/index.ts` - Barrel export with link and evolve
- `src/index.ts` - Main package re-export with LinkResult and EvolveResult types

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Vector similarity only for linking (no LLM) | LLM would be too slow/expensive at write time; Phase 3 activation scoring will improve relevance |
| Single batched LLM call in evolve | Reduces N calls to 1 for efficiency |
| Cap at 5 linked notes per evolve call | Bounds LLM token usage predictably |
| Graceful LLM failure in evolve (skip, no data loss) | Context stays as-is on LLM error; conservative safety |
| Low temperature (0.3) for evolve LLM calls | Deterministic context updates, consistent with 02-03 pattern |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 6 write pipeline steps implemented: extract, construct, retrieve, decide, link, evolve
- Ready for 02-05: Pipeline Orchestrator + Agent Tools + Hooks to wire everything together

---
*Phase: 02-core-memory*
*Completed: 2026-02-15*
