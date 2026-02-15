# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Agents automatically receive the right memories at the right time without explicit tool calls — scoped by visibility and domain, decayed by relevance, and consolidated from episodes into durable knowledge.
**Current focus:** Phase 2 — Core Memory

## Current Position

Phase: 2 of 5 (Core Memory)
Plan: 4 of 5 in current phase
Status: In progress
Last activity: 2026-02-15 — Completed 02-04-PLAN.md

Progress: █████░░░░░ 53%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 4 min
- Total execution time: 55 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 5/5 | 19 min | 4 min |
| 2. Core Memory | 4/5 | 36 min | 9 min |

**Recent Trend:**
- Last 5 plans: 01-05 (3 min), 02-01 (31 min), 02-02 (1 min), 02-03 (2 min), 02-04 (2 min)
- Trend: 02-04 fast — pure function implementations with existing patterns, no new deps

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 02-04-PLAN.md
Resume file: None
