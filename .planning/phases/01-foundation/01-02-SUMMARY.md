---
phase: 01-foundation
plan: 02
subsystem: embedding
tags: [transformers.js, huggingface, openai, embeddings, vector-search, miniLM]

# Dependency graph
requires:
  - phase: 01-01
    provides: "EmbeddingProvider interface, MumaConfig with EmbeddingConfigSchema"
provides:
  - "LocalEmbeddingProvider (384-dim all-MiniLM-L6-v2 via transformers.js)"
  - "RemoteEmbeddingProvider (OpenAI-compatible API with configurable dimensions)"
  - "createEmbeddingProvider factory (routes local/remote from config)"
  - "validateEmbeddingDimensions (startup mismatch detection for STORE-05)"
affects: [01-05, 02-01, 02-02]

# Tech tracking
tech-stack:
  added: ["@huggingface/transformers 3.8.1"]
  patterns: ["Dynamic import for pipeline() to avoid TS2590 union complexity", "Factory pattern for provider creation from config"]

key-files:
  created:
    - src/embedding/local.ts
    - src/embedding/remote.ts
    - src/embedding/factory.ts
    - src/embedding/validation.ts
    - test/embedding-smoke.ts
  modified: []

key-decisions:
  - "Dynamic import of pipeline() to avoid TypeScript TS2590 union type complexity"
  - "Dimension auto-detection from first embedding when not configured"

patterns-established:
  - "EmbeddingProvider implementations: initialize() before use, dimensions property for vector size"
  - "Factory function pattern: async createXxxProvider(config) -> initialized provider"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 1 Plan 02: Embedding Provider Summary

**Local (all-MiniLM-L6-v2 via transformers.js) and remote (OpenAI-compatible) embedding providers with factory routing and startup dimension mismatch detection**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T00:26:55Z
- **Completed:** 2026-02-14T00:29:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- LocalEmbeddingProvider generates 384-dim Float32Array embeddings using @huggingface/transformers pipeline with Xenova/all-MiniLM-L6-v2
- RemoteEmbeddingProvider calls OpenAI-compatible embedding API with proper error handling (401/429/network failures)
- Factory function routes to local or remote provider based on MumaConfig
- Dimension validation function detects provider/store mismatches to prevent silent retrieval failures (STORE-05)
- Smoke test verified end-to-end local embedding (model download + inference + batch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement local and remote embedding providers** - `eec281e` (feat)
2. **Task 2: Implement embedding dimension mismatch detection** - `e62126a` (feat)

## Files Created/Modified
- `src/embedding/local.ts` - LocalEmbeddingProvider using transformers.js feature-extraction pipeline
- `src/embedding/remote.ts` - RemoteEmbeddingProvider using native fetch to OpenAI-compatible API
- `src/embedding/factory.ts` - createEmbeddingProvider factory routing local/remote from config
- `src/embedding/validation.ts` - validateEmbeddingDimensions for startup mismatch detection
- `test/embedding-smoke.ts` - Smoke test verifying local embeddings produce 384-dim Float32Array

## Decisions Made
- Used dynamic import for `pipeline()` from @huggingface/transformers to avoid TypeScript TS2590 error (union type too complex from overloaded pipeline signatures). The type-only import of `FeatureExtractionPipeline` is still static.
- Dimension auto-detection: both providers detect actual dimensions from first embedding response when dimensions aren't explicitly configured, supporting models with non-standard output sizes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dynamic import for pipeline() to fix TS2590**
- **Found during:** Task 1 (Local embedding provider)
- **Issue:** `pipeline()` from @huggingface/transformers produces a union type too complex for TypeScript to represent (TS2590) due to its many overloaded signatures
- **Fix:** Changed to dynamic `import()` with cast through `Function` type to bypass overload resolution, keeping static type-only import for `FeatureExtractionPipeline`
- **Files modified:** src/embedding/local.ts
- **Verification:** `pnpm run typecheck` passes cleanly
- **Committed in:** eec281e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary workaround for TypeScript type complexity in third-party library. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both embedding providers ready for import by storage backends (01-03, 01-04) and plugin shell (01-05)
- Dimension validation ready for gateway_start integration (01-05)
- Factory function provides single entry point for all embedding needs
- No blockers for next plans

---
*Phase: 01-foundation*
*Completed: 2026-02-14*
