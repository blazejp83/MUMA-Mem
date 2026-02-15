---
phase: 02-core-memory
plan: 03
subsystem: pipeline
tags: [llm, extraction, embedding, deduplication, write-pipeline]

# Dependency graph
requires:
  - phase: 02-01
    provides: LLM provider (generateJSON for extraction and decision)
  - phase: 01-02
    provides: Embedding provider (embed for construct step)
  - phase: 01-03
    provides: MemoryStore (search for retrieve step)
provides:
  - extract() — structured fact extraction from raw input via LLM
  - construct() — NoteCreate builder with embedding generation
  - retrieve() — similar note lookup via vector search
  - decide() — LLM-driven write operation selection (ADD/UPDATE/DELETE/NOOP)
affects: [02-05, 03-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pipeline step pattern: pure functions with explicit dependency injection"
    - "LLM prompt as template literal constant in module scope"
    - "Defensive defaults for invalid LLM JSON responses"

key-files:
  created:
    - src/pipeline/extract.ts
    - src/pipeline/construct.ts
    - src/pipeline/retrieve.ts
    - src/pipeline/decide.ts
  modified:
    - src/pipeline/index.ts
    - src/index.ts

key-decisions:
  - "Low temperature (0.3) for extraction, (0.2) for decisions — deterministic LLM output"
  - "construct imports ExtractedFacts type from extract — natural data flow dependency"
  - "Default to ADD when LLM returns invalid decision data — safe fallback"

patterns-established:
  - "Pipeline step: async function with explicit deps (LLM, store, embedding) as params"
  - "LLM JSON validation: partial type + field-by-field default assignment"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 2 Plan 3: Write Pipeline Core Steps Summary

**Four write pipeline steps (extract, construct, retrieve, decide) with LLM-driven fact extraction and deduplication decisions**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T15:30:49Z
- **Completed:** 2026-02-15T15:33:16Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- extract() uses LLM generateJSON to pull structured facts, keywords, tags, context, visibility, importance, and domain from raw agent input
- construct() combines extracted facts into content, generates embedding vector, and builds a complete NoteCreate object
- retrieve() wraps store.search with the candidate note's embedding for similarity lookup
- decide() uses LLM to compare candidate against similar notes and choose ADD/UPDATE/DELETE/NOOP with validation and safe defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement Extract and Construct steps** - `4b24b1b` (feat)
2. **Task 2: Implement Retrieve and Decide steps** - `239eaff` (feat)

## Files Created/Modified
- `src/pipeline/extract.ts` - PIPE-01: LLM-based structured fact extraction with defaults for invalid responses
- `src/pipeline/construct.ts` - PIPE-02: NoteCreate builder from ExtractedFacts with embedding generation
- `src/pipeline/retrieve.ts` - PIPE-03: Thin wrapper over store.search for similar note lookup
- `src/pipeline/decide.ts` - PIPE-04: LLM-driven write operation decision with validation
- `src/pipeline/index.ts` - Barrel exports for all four new step functions
- `src/index.ts` - Re-exports for extract, construct, retrieve, decide and their types

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Low temperature for LLM calls (0.3 extract, 0.2 decide) | Deterministic, reproducible output for structured data extraction |
| Default to ADD on invalid LLM decision | Safe fallback — adding a duplicate is better than losing data |
| Confidence 0.8 default for LLM-extracted facts | Reasonable starting point; can be refined by later pipeline steps |
| construct imports ExtractedFacts from extract | Natural data flow — construct is always called after extract |

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All four core write pipeline steps ready for composition by Pipeline Orchestrator (Plan 05)
- Note linking (Plan 04) can proceed in parallel
- Steps are standalone pure functions with explicit dependency injection

---
*Phase: 02-core-memory*
*Completed: 2026-02-15*
