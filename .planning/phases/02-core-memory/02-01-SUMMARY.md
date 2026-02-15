---
phase: 02-core-memory
plan: 01
subsystem: llm
tags: [openai, llm, fetch, json-mode, chat-completions]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: MumaConfig with llm config schema, plugin lifecycle, module-level singleton pattern
provides:
  - LLMProvider interface with generate() and generateJSON()
  - OpenAICompatibleLLMProvider class (fetch-based HTTP client)
  - createLLMProvider() factory function
  - getLLMProvider() accessor in plugin lifecycle
affects: [02-core-memory write pipeline, 02-03 extract/decide/evolve steps]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OpenAI-compatible chat/completions API pattern with JSON mode"
    - "Optional provider pattern (returns null when unconfigured)"

key-files:
  created:
    - src/llm/provider.ts
    - src/llm/factory.ts
    - src/llm/index.ts
  modified:
    - src/plugin.ts
    - src/index.ts

key-decisions:
  - "OpenAICompatibleLLMProvider class name (not just LLMProvider) to distinguish interface from implementation"
  - "LLM is optional: factory returns null if neither provider nor apiKey configured"
  - "No streaming, no retry logic - simple single-request pattern for pipeline steps"

patterns-established:
  - "LLM provider follows same fetch/error/singleton pattern as embedding provider"

# Metrics
duration: 31min
completed: 2026-02-15
---

# Phase 2 Plan 1: LLM Provider Summary

**OpenAI-compatible LLM client with JSON mode support, factory creation, and plugin lifecycle integration for write pipeline Extract/Decide/Evolve steps**

## Performance

- **Duration:** 31 min
- **Started:** 2026-02-15T13:07:33Z
- **Completed:** 2026-02-15T13:39:08Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- LLMProvider interface with generate() for text and generateJSON<T>() for structured output
- OpenAI-compatible HTTP client using Node.js built-in fetch (same pattern as RemoteEmbeddingProvider)
- Factory function that makes LLM optional (returns null when unconfigured)
- Full plugin lifecycle: init on gateway_start, cleanup on gateway_stop, getLLMProvider() accessor

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement OpenAI-compatible LLM client with JSON mode** - `aea3d55` (feat)
2. **Task 2: Factory function + plugin lifecycle integration** - `6730618` (feat)

## Files Created/Modified
- `src/llm/provider.ts` - LLMProvider interface, GenerateOptions, OpenAICompatibleLLMProvider class
- `src/llm/factory.ts` - createLLMProvider(config) factory returning LLMProvider | null
- `src/llm/index.ts` - Barrel re-exports for llm module
- `src/plugin.ts` - Added llmProvider state, getLLMProvider() accessor, lifecycle hooks
- `src/index.ts` - Re-exports getLLMProvider, LLMProvider type, GenerateOptions type

## Decisions Made
- Named implementation class `OpenAICompatibleLLMProvider` to keep `LLMProvider` clean as the interface name
- LLM provider is optional: if `config.llm.provider` and `config.llm.apiKey` are both unset, factory returns null (supports read-only users)
- No streaming support (pipeline steps are single-shot request/response)
- No retry logic (callers can retry; keeps provider simple)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- LLM provider ready for write pipeline steps (Extract, Decide, Evolve) in plan 02-03
- Read pipeline (02-02) can proceed in parallel (does not depend on LLM)
- getLLMProvider() accessor available for any module needing LLM calls

---
*Phase: 02-core-memory*
*Completed: 2026-02-15*
