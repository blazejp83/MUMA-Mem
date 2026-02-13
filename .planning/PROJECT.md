# MUMA-Mem

## What This Is

A multi-user multi-agent memory system for OpenClaw that replaces the default file-backed memory with an intelligent, layered memory architecture. Ships as a standalone npm package that plugs into OpenClaw via `kind: "memory"` slot. Implements ACT-R-inspired activation, Ebbinghaus forgetting curves, Zettelkasten-style note linking, and a Mem0-inspired write pipeline with automatic consolidation.

## Core Value

Agents automatically receive the right memories at the right time without explicit tool calls — scoped by visibility and domain, decayed by relevance, and consolidated from episodes into durable knowledge.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Layer 1: Agent Local Memory**
- [ ] In-process working memory per agent session with ACT-R activation scoring
- [ ] Base-level activation: B(m) = ln(Σ(t - t_i)^(-d)) with access log tracking
- [ ] Spreading activation: w * cos_sim(query, embedding) with configurable context weight (default 11.0)
- [ ] Stochastic noise (Gaussian, σ=1.2) for natural recall variation
- [ ] Adaptive half-life forgetting (Ebbinghaus) with event-driven adjustments
- [ ] Session-end promotion of surviving memories to Layer 2

**Layer 2: User Shared Memory**
- [ ] Persistent Zettelkasten-style note store (content, context, keywords, tags, embedding, links)
- [ ] Write pipeline: Extract → Construct (incl. visibility) → Retrieve → Decide (ADD/UPDATE/DELETE/NOOP) → Link → Evolve
- [ ] Read pipeline: Visibility gate → activation-weighted scoring + domain boost → top-k → link expansion (1-hop)
- [ ] Two-axis access model: domain (relevance routing) + visibility (permission gating)
- [ ] Four visibility levels: open, scoped, private, user-only
- [ ] Domain-level visibility rules with longest-prefix matching
- [ ] Per-agent memory profiles (agentMemory config keyed by agent ID)
- [ ] Bidirectional filesystem sync (memory store ↔ ~/clawd/memory/)

**Layer 3: Knowledge Commons**
- [ ] Team-shared domain knowledge store with role-scoped read access
- [ ] Skill library with success/failure tracking
- [ ] Team state blackboard (pub/sub with conflict resolution)
- [ ] Transactive memory index ("who knows what" routing)
- [ ] Orchestrator-gated writes with user approval for promotion

**Layer 4: Memory Management Daemon**
- [ ] Hourly decay sweep: recalculate activation, mark pruning candidates, archive cold storage
- [ ] Daily consolidation ("sleep cycle"): cluster → summarize → prune → conflict detect → distill MEMORY.md
- [ ] Real-time cross-agent synchronization (pub/sub on memory writes)
- [ ] Weekly knowledge promotion pipeline (user shared → team commons)

**Layer 5: OpenClaw Plugin Integration**
- [ ] `kind: "memory"` plugin replacing memory-core
- [ ] `before_agent_start` hook: automatic visibility-filtered memory injection into prependContext
- [ ] `session_end` hook: promote L1 memories to L2
- [ ] `message_received` / `after_tool_call` hooks: episodic memory capture
- [ ] `gateway_start` / `gateway_stop` hooks: daemon lifecycle
- [ ] Agent tools: memory.write, memory.query, memory.forget, memory.pin, memory.set_visibility, memory.get_context, memory.consolidate, memory.stats, memory.link, memory.search_agents
- [ ] CLI subcommands: stats, export, consolidate, conflicts
- [ ] HTTP routes for monitoring dashboard

**Infrastructure**
- [ ] Abstract storage backend interface (Redis primary, SQLite fallback)
- [ ] Configurable embedding provider (local all-MiniLM-L6-v2 default, remote override)
- [ ] Dedicated LLM config for background processing (write pipeline, consolidation)
- [ ] openclaw.plugin.json manifest with full config schema

### Out of Scope

- Federated cross-VPS knowledge sharing — future work, architecture supports it but not building now
- Custom embedding model fine-tuning — use existing models as-is
- Web UI for memory browsing — filesystem sync provides inspectability, no dashboard needed for v1
- Emotional salience scoring — noted as open research question, not implementing

## Context

**Architecture reference:** `MUMA-Mem-Architecture.md` in repo root. Synthesizes research from FadeMem (forgetting curves), ACT-R (activation functions), A-Mem (Zettelkasten notes), Mem0 (extract-then-update pipeline), MAS Survey (multi-agent memory taxonomy).

**Integration reference:** `MUMA-Mem-OpenClaw-Integration-Analysis.md` in repo root. Maps all 5 layers to OpenClaw's plugin mechanisms (hooks, tools, services, CLI, HTTP routes).

**OpenClaw multi-agent reference:** `Multi-Agent_Sandbox__Tools_-_OpenClaw.md` in repo root. Documents how agents are defined (`agents.list[]`), routed via bindings, and isolated with sandboxes/tool restrictions. Agent IDs from this system are the keys for MUMA-Mem's agentMemory config.

**OpenClaw codebase:** `/home/blaze/repos/.obsolete/openclaw` — the target platform. Plugin system at `src/plugins/`, memory types at `src/memory/types.ts`, plugin SDK exported from `src/plugin-sdk/index.ts`.

**Key OpenClaw plugin patterns:**
- `extensions/memory-core/` — the plugin being replaced (simple tool + CLI registration)
- `extensions/diagnostics-otel/` — example of a service plugin (start/stop lifecycle)
- `extensions/voice-call/` — example of complex config schema with Zod validation

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
| Standalone package (not OpenClaw fork) | Independent release cycle, publishable to npm, cleaner separation | — Pending |
| Abstract storage backend | Redis ideal but heavy dependency; SQLite fallback enables single-user without Redis | — Pending |
| Two-axis visibility model (domain + visibility) | Single-axis domain filtering too coarse for personal-vs-business memory sharing | — Pending |
| Dedicated LLM config for plugin | Background processing (consolidation) runs outside agent sessions, needs its own model access | — Pending |
| Configurable embeddings with local default | Local MiniLM validated by research, but users with existing remote providers shouldn't be forced to switch | — Pending |
| Agent memory profiles keyed by agent ID | OpenClaw's agents.list[] + bindings already handle routing; no need for separate "role" abstraction | — Pending |

---
*Last updated: 2026-02-12 after initialization*
