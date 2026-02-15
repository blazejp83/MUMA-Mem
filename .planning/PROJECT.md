# MUMA-Mem

## What This Is

A multi-user multi-agent memory system for OpenClaw that replaces the default file-backed memory with an intelligent, layered memory architecture. Ships as a standalone npm package that plugs into OpenClaw via `kind: "memory"` slot. Implements ACT-R-inspired activation, Ebbinghaus forgetting curves, Zettelkasten-style note linking, and a Mem0-inspired write pipeline with automatic consolidation. All 5 layers shipped: agent local memory, user shared memory, knowledge commons, memory management daemon, and OpenClaw plugin integration.

## Core Value

Agents automatically receive the right memories at the right time without explicit tool calls — scoped by visibility and domain, decayed by relevance, and consolidated from episodes into durable knowledge.

## Requirements

### Validated

- ✓ In-process working memory per agent session with ACT-R activation scoring — v1.0
- ✓ Base-level activation: B(m) = ln(Σ(t - t_i)^(-d)) with access log tracking — v1.0
- ✓ Spreading activation: w * cos_sim(query, embedding) with configurable context weight — v1.0
- ✓ Stochastic noise (Gaussian, σ=1.2) for natural recall variation — v1.0
- ✓ Adaptive half-life forgetting (Ebbinghaus) with event-driven adjustments — v1.0
- ✓ Session-end promotion of surviving memories to Layer 2 — v1.0
- ✓ Persistent Zettelkasten-style note store with embeddings and links — v1.0
- ✓ Write pipeline: Extract → Construct → Retrieve → Decide → Link → Evolve — v1.0
- ✓ Read pipeline: Visibility gate → activation scoring → top-k → link expansion — v1.0
- ✓ Two-axis access model: domain + visibility — v1.0
- ✓ Four visibility levels: open, scoped, private, user-only — v1.0
- ✓ Domain-level visibility rules with longest-prefix matching — v1.0
- ✓ Per-agent memory profiles keyed by agent ID — v1.0
- ✓ Bidirectional filesystem sync (memory store ↔ ~/clawd/memory/) — v1.0
- ✓ Cross-agent event bus (Redis pub/sub + SQLite polling) — v1.0
- ✓ Transactive memory index ("who knows what" routing) — v1.0
- ✓ Hourly decay sweep with activation recalculation — v1.0
- ✓ Daily consolidation: cluster → summarize → prune → conflict detect → distill MEMORY.md — v1.0
- ✓ `kind: "memory"` plugin replacing memory-core — v1.0
- ✓ `before_agent_start` hook: automatic memory injection — v1.0
- ✓ `session_end` hook: promote L1 memories to L2 — v1.0
- ✓ Episodic memory capture hooks — v1.0
- ✓ Gateway lifecycle hooks for daemon management — v1.0
- ✓ 10 agent tools (write, query, forget, pin, set_visibility, get_context, consolidate, stats, link, search_agents) — v1.0
- ✓ CLI subcommands: stats, export, consolidate, conflicts — v1.0
- ✓ Abstract storage backend (Redis primary, SQLite fallback) — v1.0
- ✓ Configurable embedding provider (local MiniLM default, remote override) — v1.0
- ✓ Dedicated LLM config for background processing — v1.0

### Active

(None — all v1.0 requirements shipped)

### Out of Scope

- Federated cross-VPS knowledge sharing — future work, architecture supports it but not building now
- Custom embedding model fine-tuning — use existing models as-is
- Web UI for memory browsing — filesystem sync provides inspectability, no dashboard needed for v1
- Emotional salience scoring — noted as open research question, not implementing
- HTTP routes for monitoring dashboard — deferred, CLI provides equivalent functionality

## Context

Shipped v1.0 with 6,797 LOC TypeScript (+ 463 test LOC) across 118 files.
Tech stack: TypeScript 5.9, Node.js 22+, ESM modules, pnpm, Redis Stack 7.2+, SQLite (better-sqlite3 + sqlite-vec), @huggingface/transformers.

Architecture: 5-layer memory system (L1 working memory → L2 user shared → L3 knowledge commons → L4 daemon → L5 plugin). Storage abstraction allows Redis (full features) or SQLite (degraded: polling-based sync).

## Constraints

- **Runtime**: Node.js 22+, TypeScript 5.9, ESM modules, pnpm
- **Plugin SDK**: Must import from `openclaw/plugin-sdk` — jiti handles runtime transpilation
- **Memory slot**: Only one `kind: "memory"` plugin active at a time. MUMA-Mem fully replaces memory-core.
- **Hook latency**: `before_agent_start` is on the critical path — memory retrieval must complete within ~200ms for acceptable UX
- **Storage abstraction**: Must work with Redis (full features) and SQLite (degraded: no real-time pub/sub, polling-based sync instead)
- **Embedding dimensions**: Must handle variable dimensions (384 for local MiniLM, 1536 for OpenAI, etc.) since embedding provider is configurable

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Standalone package (not OpenClaw fork) | Independent release cycle, publishable to npm, cleaner separation | ✓ Good |
| Abstract storage backend | Redis ideal but heavy dependency; SQLite fallback enables single-user without Redis | ✓ Good |
| Two-axis visibility model (domain + visibility) | Single-axis domain filtering too coarse for personal-vs-business memory sharing | ✓ Good |
| Dedicated LLM config for plugin | Background processing (consolidation) runs outside agent sessions, needs its own model access | ✓ Good |
| Configurable embeddings with local default | Local MiniLM validated by research, but users with existing remote providers shouldn't be forced to switch | ✓ Good |
| Agent memory profiles keyed by agent ID | OpenClaw's agents.list[] + bindings already handle routing; no need for separate "role" abstraction | ✓ Good |
| Petrov hybrid threshold at 50 accesses | Standard ACT-R cutoff; exact sum for small logs, O(1) for large | ✓ Good |
| Greedy single-linkage + union-find clustering | O(n) transitive grouping with path compression for consolidation | ✓ Good |
| Plugin API typed as `any` | Avoids hard dependency on openclaw/plugin-sdk at runtime | ⚠️ Revisit — type safety gap |
| 3x overfetch for sqlite-vec user filtering | vec_notes lacks user_id; fetch extra, filter after JOIN | ⚠️ Revisit — performance concern at scale |
| Node.js built-in parseArgs for CLI | Zero external CLI dependencies | ✓ Good |

---
*Last updated: 2026-02-15 after v1.0 milestone*
