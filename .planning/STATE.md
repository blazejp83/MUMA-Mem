# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Agents automatically receive the right memories at the right time without explicit tool calls — scoped by visibility and domain, decayed by relevance, and consolidated from episodes into durable knowledge.
**Current focus:** Phase 3 — Intelligence (Complete)

## Current Position

Phase: 3 of 5 (Intelligence)
Plan: 3 of 3 in current phase
Status: Phase complete
Last activity: 2026-02-15 — Completed 03-02-PLAN.md (final plan in Phase 3)

Progress: █████████░ 76%

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 4 min
- Total execution time: 62 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 5/5 | 19 min | 4 min |
| 2. Core Memory | 5/5 | 38 min | 8 min |
| 3. Intelligence | 2/3 | 5 min | 3 min |

**Recent Trend:**
- Last 5 plans: 02-03 (2 min), 02-04 (2 min), 02-05 (2 min), 03-01 (2 min), 03-03 (3 min)
- Trend: 03-03 fast — in-process class + plugin hook wiring, no complex integration

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

| Phase | Decision | Rationale |
|-------|----------|-----------|
| 01-01 | Zod v4 factory defaults for nested objects | Zod v4 requires outer .default() to match fully-resolved output type |
| 01-01 | .js import extensions for ESM | TypeScript NodeNext module resolution requirement |
| 01-02 | Dynamic import for pipeline() | Avoids TS2590 union type complexity in @huggingface/transformers |
| 01-02 | Dimension auto-detection from first embedding | Supports models with non-standard output sizes without explicit config |
| 01-03 | Float32Array as raw Buffer in Redis | Zero-copy binary storage compatible with RediSearch HNSW indexing |
| 01-03 | Deferred RediSearch index creation | Handles unknown dimensions until first embedding write |
| 01-04 | BigInt rowid for sqlite-vec bindings | sqlite-vec requires BigInt for integer PK bindings in better-sqlite3 |
| 01-04 | Overfetch 3x for KNN user filtering | vec_notes has no user_id; fetch 3x candidates, filter after JOIN |
| 01-05 | api typed as any for plugin registration | Avoids hard dependency on openclaw/plugin-sdk at runtime |
| 01-05 | Module-level singleton state for gateway lifetime | getStore()/getEmbeddingProvider() accessible across modules |
| 02-01 | LLM provider is optional (null when unconfigured) | Supports read-only users without LLM API keys |
| 02-01 | No streaming or retry in LLM provider | Pipeline steps are single-shot; callers can retry |
| 02-02 | Fire-and-forget access tracking in search | Keeps search under 200ms target (SEARCH-02) |
| 02-02 | 1-hop link expansion default true | Agents get expanded context without opt-in |
| 02-03 | Low temperature for LLM extraction/decision (0.3/0.2) | Deterministic, reproducible structured data output |
| 02-03 | Default to ADD on invalid LLM decision | Safe fallback — adding a duplicate beats losing data |
| 02-04 | Vector similarity only for linking (no LLM) | Fast/cheap at write time; Phase 3 activation scoring improves relevance |
| 02-04 | Single batched LLM call in evolve | Reduces N calls to 1 for efficiency |
| 02-04 | Graceful LLM failure in evolve (skip evolution) | Context stays as-is; no data loss on LLM error |
| 02-05 | LLM provider guard in episodic hooks | Skip capture silently when unconfigured — supports read-only mode |
| 02-05 | Tools registered inside gateway_start | Ensures all providers initialized before tools can execute |
| 03-01 | Petrov hybrid threshold at 50 accesses | Standard ACT-R cutoff; exact sum for small logs, O(1) for large |
| 03-01 | MIN_DELTA_HOURS = 1 second for base-level activation | Prevents division by zero for simultaneous timestamps |
| 03-01 | Logistic noise rejection sampling for u in (0,1) | Avoids Math.log(0) or Math.log(Infinity) edge cases |
| 03-03 | L1 standalone in-process Map, no MemoryStore interface | L1 is ephemeral/session-scoped; store interface coupling adds complexity with no benefit |
| 03-03 | Base-level activation only for promotion decisions | Promotion should reflect general importance, not relevance to a specific query |
| 03-03 | L1 capture runs even without LLM provider | Working memory always active; LLM only needed for L2 write pipeline |

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 03-03-PLAN.md (Phase 3 in progress, 2/3 done — 03-02 running in parallel)
Resume file: None
