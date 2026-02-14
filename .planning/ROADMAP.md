# Roadmap: MUMA-Mem

## Overview

Build a multi-user multi-agent memory system for OpenClaw in five phases: lay the storage and embedding foundation, implement the core write/read pipelines with semantic search, add cognitive-science-based activation and forgetting (the key differentiator), layer on multi-agent coordination with visibility controls, and finally add background intelligence with consolidation and CLI tooling.

## Domain Expertise

None

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Storage abstraction (Redis + SQLite), embedding provider, plugin shell, npm package
- [ ] **Phase 2: Core Memory** - Write pipeline, read pipeline, semantic search, note linking, agent tools
- [ ] **Phase 3: Intelligence** - ACT-R activation scoring, Ebbinghaus forgetting, L1 working memory, session hooks
- [ ] **Phase 4: Multi-Agent** - Two-axis access model, visibility levels, cross-agent coordination, filesystem sync
- [ ] **Phase 5: Background Intelligence** - Daemon (decay sweeps, consolidation), conflict detection, CLI tools

## Phase Details

### Phase 1: Foundation
**Goal**: Abstract storage backend (Redis + SQLite), embedding provider interface (local + remote), basic note CRUD, OpenClaw plugin manifest with lifecycle hooks, project scaffolding
**Depends on**: Nothing (first phase)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, STORE-06, STORE-07, PLUG-01, PLUG-05, PLUG-08
**Research**: Likely (new storage integration)
**Research topics**: Redis Stack 7.2+ vector index config (HNSW tuning, dimension handling), sqlite-vec alpha stability, better-sqlite3 + sqlite-vec integration patterns
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

### Phase 2: Core Memory
**Goal**: Full write pipeline (Extract→Construct→Retrieve→Decide→Link→Evolve), read pipeline with semantic search, Zettelkasten note linking, episodic capture hooks, agent memory tools
**Depends on**: Phase 1
**Requirements**: SEARCH-01, SEARCH-02, SEARCH-04, PIPE-01, PIPE-02, PIPE-03, PIPE-04, PIPE-05, PIPE-06, LINK-01, LINK-02, LINK-03, LINK-04, LINK-05, PLUG-04, PLUG-06
**Research**: Unlikely (follows well-documented Mem0 extract-then-update pattern, standard vector search)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Intelligence
**Goal**: ACT-R base-level + spreading activation + stochastic noise, Ebbinghaus adaptive half-life forgetting, L1 in-process working memory with promote gate, before_agent_start context injection, session_end promotion
**Depends on**: Phase 2
**Requirements**: SEARCH-03, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, FORGET-01, FORGET-02, FORGET-03, FORGET-04, WM-01, WM-02, WM-03, PLUG-02, PLUG-03
**Research**: Likely (cognitive science algorithms, no existing implementations)
**Research topics**: ACT-R parameter calibration (d=0.5, w=11.0, σ=1.2 starting points), Petrov 2006 hybrid approximation, Ebbinghaus adaptive half-life tuning
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Multi-Agent
**Goal**: Two-axis access model (domain + visibility), four visibility levels, domain-level rules with longest-prefix matching, per-agent memory profiles, cross-agent pub/sub sync, bidirectional filesystem sync
**Depends on**: Phase 3
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, SYNC-01, SYNC-02, SYNC-03, PLUG-07
**Research**: Unlikely (standard Redis pub/sub patterns, established access control)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Background Intelligence
**Goal**: Hourly decay sweep (BullMQ scheduled), daily consolidation (cluster→summarize→prune→conflict detect→distill MEMORY.md), CLI subcommands (stats, export, consolidate, conflicts), conflict detection + user resolution
**Depends on**: Phase 4
**Requirements**: FORGET-05, CONSOL-01, CONSOL-02, CONSOL-03, CONSOL-04, CONSOL-05, CONSOL-06, CLI-01, CLI-02, CLI-03, CLI-04
**Research**: Likely (no established quality benchmarks)
**Research topics**: Consolidation quality metrics (information preservation measurement), BullMQ scheduling patterns, SQLite-only fallback scheduler
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. Core Memory | 0/TBD | Not started | - |
| 3. Intelligence | 0/TBD | Not started | - |
| 4. Multi-Agent | 0/TBD | Not started | - |
| 5. Background Intelligence | 0/TBD | Not started | - |
