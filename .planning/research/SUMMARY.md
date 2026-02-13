# Project Research Summary

**Project:** MUMA-Mem
**Domain:** Multi-agent AI memory system (OpenClaw plugin)
**Researched:** 2026-02-13
**Confidence:** HIGH

## Executive Summary

MUMA-Mem enters a market where existing AI memory systems (Mem0, Letta/MemGPT, Zep, LangMem) all suffer from the same fundamental flaw: memories accumulate forever with no decay, degrading retrieval quality catastrophically over time. Benchmarks show even the best systems achieve only ~43% recall accuracy, dropping to under 3% on long conversations. No shipping product implements cognitive-science-based forgetting or multi-agent memory coordination — these are MUMA-Mem's primary differentiation.

The recommended approach is a layered architecture (L1-L5) built as a standalone npm package, using Redis Stack for primary storage with vector search (HNSW via RediSearch) and SQLite + sqlite-vec as a zero-dependency fallback. Local embeddings via @huggingface/transformers (all-MiniLM-L6-v2, 384-dim) keep the system self-contained, with configurable remote override. The critical design choice is keeping all LLM calls off the read path — retrieval uses only pre-computed embeddings and cached activation scores, achieving <56ms typical latency (well within the 200ms budget).

Key risks center on: (1) sqlite-vec being alpha quality (0.1.7-alpha.2), mitigated by wrapping behind a storage adapter; (2) embedding provider switching causing dimension mismatches, mitigated by storing model metadata with every vector; (3) scope creep — Letta tried to be both an agent runtime and memory system and struggled. MUMA-Mem must stay focused on being the best memory plugin, not an agent framework.

## Key Findings

### Recommended Stack

Node.js 22+ / TypeScript 5.9 / ESM-only. Core stack: `redis` v5.10 (official client with RediSearch vector support), `better-sqlite3` v12.6 (fastest sync SQLite), `sqlite-vec` v0.1.7 (KNN virtual tables), `@huggingface/transformers` v3.8 (local ONNX embeddings), `BullMQ` v5.69 (Redis-based job queue for daemon), `zod` v4.3 (schema validation).

**Core technologies:**
- **redis (node-redis) v5.10**: Redis client with built-in RediSearch/vector support — ioredis is deprecated
- **better-sqlite3 + sqlite-vec**: Sync SQLite with vector KNN — fallback path, no external dependencies
- **@huggingface/transformers v3.8**: Local embedding generation via ONNX — 384-dim, ~5-15ms per embedding
- **BullMQ v5.69**: Background job queue — consolidation daemon, decay sweeps, scheduled jobs
- **tsdown v0.20**: Build tool — successor to tsup, ESM-first, Rolldown-powered

### Expected Features

**Must have (table stakes):**
- Persistent memory across sessions
- Semantic search over memories (<200ms)
- Memory CRUD API (write, query, forget)
- User-scoped isolation
- Deduplication / update-on-conflict (Mem0-style ADD/UPDATE/DELETE/NOOP)
- Configurable embedding + LLM providers
- Export/portability

**Should have (competitive — MUMA-Mem's differentiation):**
- ACT-R activation scoring (nobody else ships this)
- Ebbinghaus forgetting curves with adaptive half-life (nobody else has decay)
- Multi-agent memory coordination with cross-agent sync (nobody does this)
- Two-axis access model: domain relevance + visibility permissions (unique)
- Zettelkasten-style note linking with evolution (richer than Mem0g triplets)
- Sleep-cycle consolidation (episodic-to-semantic, offline)
- Filesystem sync (bidirectional, human-readable)

**Defer (v2+):**
- Transactive memory index ("who knows what" routing)
- Knowledge Commons (team-shared domain knowledge)
- Skill library with success/failure tracking

### Architecture Approach

Five-layer architecture with the Memory Engine as a thin orchestrator. L1 (agent local working memory) is an in-process Map with ACT-R activation; L2 (user shared) is persistent Zettelkasten notes with write/read pipelines; L3 (knowledge commons) is team-shared with role-scoped access; L4 (daemon) handles decay sweeps, consolidation, and sync; L5 (plugin shell) wraps everything as OpenClaw hooks, tools, CLI, and HTTP routes.

**Major components:**
1. **Memory Engine** — thin orchestrator routing to layers, owns no state
2. **L1 Working Memory** — per-session scratchpad with activation calculator and promote gate
3. **L2 Shared Memory** — write pipeline (Extract→Construct→Retrieve→Decide→Link→Evolve), read pipeline (visibility gate→vector search→activation scoring→top-k→link expansion)
4. **L4 Daemon** — BullMQ workers for hourly decay, daily consolidation, cross-agent pub/sub
5. **Storage Adapter** — abstract interface hiding Redis vs SQLite, with embedding provider abstraction

### Critical Pitfalls

1. **Memory accuracy degrades catastrophically over time** — all existing systems suffer this. Mitigation: ACT-R activation + Ebbinghaus decay from day one; test at 10x/100x/1000x expected volume
2. **Embedding dimension mismatch when switching providers** — silent retrieval failures. Mitigation: store model version + dimension with every vector; startup health check
3. **Consolidation destroys information** — LLM summarization hallucinates or loses facts. Mitigation: never delete originals; quality benchmarks before/after; dry-run mode
4. **Memory poisoning via malicious agent input** — Microsoft taxonomy shows 40-80% attack success rates. Mitigation: provenance tracking, trust scoring, rate limiting per agent
5. **Redis eviction silently deletes vector data** — default eviction policy treats memory data as cache. Mitigation: `noeviction` policy or separate Redis instances for cache vs. memory

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation (Storage + Embeddings + Plugin Shell)
**Rationale:** Everything depends on the storage abstraction and embedding provider interface. Getting these right prevents the #1 and #2 pitfalls (dimension mismatch, provider lock-in). Plugin shell validates the OpenClaw integration path.
**Delivers:** Abstract storage backend (Redis + SQLite), embedding provider interface (local + remote), basic note CRUD, OpenClaw plugin manifest with `gateway_start`/`gateway_stop` hooks, project scaffolding (package.json, tsconfig, build)
**Addresses:** T1 (persistence), T4 (user isolation), T7 (config embeddings), T10 (npm package), D9 (plugin hooks — partial)
**Avoids:** Pitfall #2 (embedding mismatch), #5 (storage routing), #6 (Redis eviction), #13 (plugin lifecycle)

### Phase 2: Core Memory (Write Pipeline + Read Pipeline + Semantic Search)
**Rationale:** The write/read pipelines are the product. Mem0's extract-then-update pattern is proven; MUMA-Mem extends it with Link + Evolve steps. Semantic search (vector KNN) is table stakes.
**Delivers:** Full write pipeline (Extract→Construct→Retrieve→Decide→Link→Evolve), read pipeline (visibility gate→vector search→top-k→link expansion), memory.write/query/forget tools
**Implements:** L2 shared memory, Zettelkasten note schema
**Addresses:** T2 (semantic search), T3 (CRUD API), T5 (deduplication), T6 (metadata), D5 (note linking — basic)
**Avoids:** Pitfall #1 (scoring model), #3 (consolidation quality — by building pipeline incrementally), #10 (deduplication)

### Phase 3: Intelligence (ACT-R Activation + Forgetting + Working Memory)
**Rationale:** This is the core differentiation — nobody else ships cognitive-science-based memory. ACT-R activation scoring replaces flat cosine ranking. Ebbinghaus forgetting prevents unbounded growth. L1 working memory enables per-session scratchpad with promote gate.
**Delivers:** ACT-R base-level + spreading activation + stochastic noise, Ebbinghaus adaptive half-life forgetting, L1 in-process working memory, session-end promotion to L2, `before_agent_start` context injection
**Uses:** Petrov (2006) hybrid approximation for bounded activation computation
**Addresses:** D1 (ACT-R activation), D2 (forgetting curves), D9 (plugin hooks — complete)
**Avoids:** Pitfall #7 (ACT-R approximation), #8 (threshold calibration)

### Phase 4: Multi-Agent (Access Model + Coordination + Filesystem Sync)
**Rationale:** Multi-agent coordination is the second major differentiator. Depends on mature L2 (Phase 2) and activation scoring (Phase 3). Two-axis access model (domain + visibility) separates relevance from permissions.
**Delivers:** Four visibility levels (open/scoped/private/user-only), domain-level visibility rules with longest-prefix matching, per-agent memory profiles, cross-agent pub/sub sync, bidirectional filesystem sync (~/clawd/memory/)
**Addresses:** D3 (multi-agent), D4 (two-axis access), D8 (filesystem sync), D10 (domain rules)
**Avoids:** Pitfall #4 (trust model), #15 (privacy violations)

### Phase 5: Background Intelligence (Daemon + Consolidation + Monitoring)
**Rationale:** Sleep-cycle consolidation and decay sweeps are the "set it and forget it" features that make MUMA-Mem a living system. Depends on all prior phases being stable.
**Delivers:** Hourly decay sweep (BullMQ scheduled), daily consolidation (cluster→summarize→prune→conflict detect→distill MEMORY.md), memory stats/monitoring tools, CLI subcommands (stats, export, consolidate, conflicts), conflict detection + resolution
**Addresses:** D6 (consolidation), L4 daemon, T9 (export), T8 (config LLM for background)
**Avoids:** Pitfall #3 (consolidation quality), #9 (daemon process separation), #12 (worker memory leaks)

### Phase Ordering Rationale

- **Storage first** (Phase 1) because everything depends on it and getting the abstraction wrong forces rewrites
- **Pipelines second** (Phase 2) because the write/read pipelines define the product — ship this and it already replaces memory-core
- **Intelligence third** (Phase 3) because activation scoring and forgetting are the unique value but they modify read behavior, so reads must work first
- **Multi-agent fourth** (Phase 4) because visibility/coordination layer on top of working single-user memory
- **Daemon last** (Phase 5) because consolidation is a luxury that requires all other layers to be stable

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Redis Stack 7.2+ vector index configuration (HNSW tuning, dimension handling); sqlite-vec alpha stability assessment
- **Phase 3:** ACT-R parameter calibration (d=0.5, w=11.0, σ=1.2 are starting points from research but may need tuning); Petrov approximation implementation details
- **Phase 5:** Consolidation quality metrics — how to measure if LLM summaries preserved information

Phases with standard patterns (skip research-phase):
- **Phase 2:** Write pipeline follows well-documented Mem0 pattern; vector search is standard
- **Phase 4:** Access control and pub/sub are well-documented Redis patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official docs verified; node-redis, better-sqlite3, HuggingFace transformers all well-documented |
| Features | HIGH | Based on competitor analysis of Mem0, Letta, Zep, LangMem with published papers and benchmarks |
| Architecture | HIGH | Synthesized from Mem0 source code analysis, Letta docs, ACT-R research, OpenClaw plugin system |
| Pitfalls | HIGH | Based on published benchmarks, GitHub issues, Microsoft's agentic AI failure taxonomy, and post-mortems |

**Overall confidence:** HIGH

### Gaps to Address

- **sqlite-vec stability:** Alpha quality (0.1.7-alpha.2), npm publishes lag GitHub. Validate during Phase 1 setup.
- **ACT-R parameter tuning:** Starting parameters from literature (d=0.5, w=11.0, σ=1.2) need validation with real workloads in Phase 3.
- **Consolidation quality:** No established benchmarks for measuring if LLM-generated summaries preserve information correctly. Need to create our own quality metrics in Phase 5.
- **BullMQ + SQLite-only mode:** When Redis is unavailable, BullMQ cannot run (it requires Redis). Need an alternative scheduler for SQLite-only deployments (e.g., in-process `setInterval` with file-based locking).
- **onnxruntime-node on ARM/Alpine:** Native addon may have compilation issues in some environments. Validate or provide remote-only embedding option.

## Sources

### Primary (HIGH confidence)
- Redis Vector Search Node.js docs — vector index creation, HNSW configuration
- Mem0 paper (arXiv 2504.19413) — write pipeline architecture
- Zep paper (arXiv 2501.13956) — temporal knowledge graph, bi-temporal model
- ACT-R 7.x Reference Manual — activation equations, parameter defaults
- Microsoft Taxonomy of Failure Modes in Agentic AI — memory poisoning, access control failures
- AI Memory Systems Benchmark 2025 — comparative accuracy across Mem0, OpenAI, LangMem
- CHI 2025 (Users' Expectations and Practices with Agent Memory) — UX research on memory systems

### Secondary (MEDIUM confidence)
- Mem0, Letta, Zep, LangMem GitHub issues — user complaints and failure modes
- Petrov 2006 approximation paper — bounded activation computation
- FadeMem / Memory Bear papers — forgetting curve implementations (academic)
- Letta Context Repositories blog (Feb 2026) — filesystem-backed memory trend

### Tertiary (LOW confidence)
- sqlite-vec npm publish frequency and stability assessment
- Embedding latency claims (5-15ms per embedding on CPU)
- onnxruntime-node + Node.js 22 compatibility matrix
- tsdown stability for production npm packages (pre-1.0)

---
*Research completed: 2026-02-13*
*Ready for roadmap: yes*
