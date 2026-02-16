# Roadmap: MUMA-Mem

## Overview

Build a multi-user multi-agent memory system for OpenClaw in five phases: lay the storage and embedding foundation, implement the core write/read pipelines with semantic search, add cognitive-science-based activation and forgetting (the key differentiator), layer on multi-agent coordination with visibility controls, and finally add background intelligence with consolidation and CLI tooling.

## Domain Expertise

None

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-02-15)
- 🚧 **v1.1 Integration** — Phases 6-11 (in progress)

## Completed Milestones

- ✅ [v1.0 MVP](milestones/v1.0-ROADMAP.md) (Phases 1-5) — SHIPPED 2026-02-15

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-5) — SHIPPED 2026-02-15</summary>

- [x] Phase 1: Foundation (5/5 plans) — completed 2026-02-14
- [x] Phase 2: Core Memory (5/5 plans) — completed 2026-02-15
- [x] Phase 3: Intelligence (3/3 plans) — completed 2026-02-15
- [x] Phase 4: Multi-Agent (4/4 plans) — completed 2026-02-15
- [x] Phase 5: Background Intelligence (4/4 plans) — completed 2026-02-15

</details>

### 🚧 v1.1 Integration (In Progress)

**Milestone Goal:** Align MUMA-Mem's plugin layer with the actual OpenClaw plugin SDK — fix hook signatures, tool registration, CLI bridge, and add integration tests.

#### Phase 6: Integration Types -- Complete

**Goal**: Establish OpenClaw type foundations — deriveUserId helper, OpenClaw types as devDependency, fix plugin definition shape
**Depends on**: Previous milestone complete
**Research**: Unlikely (spec provides exact shapes, internal refactoring)
**Plans**: 1

Plans:
- [x] 06-01: OpenClaw type foundations (types, deriveUserId, plugin definition) -- completed 2026-02-16

#### Phase 7: Hook Alignment -- Complete

**Goal**: Rewrite all 6 hook handlers to (event, ctx) two-arg signatures with correct return shapes
**Depends on**: Phase 6
**Research**: Unlikely (spec defines all signatures and fixes)
**Plans**: 1

Plans:
- [x] 07-01: Hook alignment (all 6 hooks rewritten with typed signatures) -- completed 2026-02-16

#### Phase 8: Tool Factory -- Complete

**Goal**: Convert 10 tools to factory pattern with correct execute(toolCallId, params) signature, underscore naming, and labels
**Depends on**: Phase 6
**Research**: Unlikely (spec defines factory pattern; JSON Schema vs TypeBox needs quick validation)
**Plans**: 1

Plans:
- [x] 08-01: Tool factory conversion (all 10 tools rewritten with factory pattern) -- completed 2026-02-16

#### Phase 9: CLI Bridge -- Complete

**Goal**: Add Commander-based CLI registration for OpenClaw integration (dual CLI, Option A — keep standalone + add OpenClaw subcommands)
**Depends on**: Phase 6
**Research**: Unlikely (spec outlines structure; Commander is well-known)
**Plans**: 1

Plans:
- [x] 09-01: OpenClaw CLI registrar (CommanderLikeCommand type, registerMemoryCli, 4 subcommands) -- completed 2026-02-17

#### Phase 10: Hook Extensions

**Goal**: Add session_start, before_compaction, and before_reset hooks for eager initialization and better memory capture
**Depends on**: Phase 7
**Research**: Unlikely (spec defines available hooks and recommended additions)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

#### Phase 11: Integration Tests

**Goal**: Mock OpenClawPluginApi and test full lifecycle — registration, hooks, tools, userId derivation
**Depends on**: Phase 8, Phase 9, Phase 10
**Research**: Unlikely (mock-based testing, standard patterns)
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 5/5 | Complete | 2026-02-14 |
| 2. Core Memory | v1.0 | 5/5 | Complete | 2026-02-15 |
| 3. Intelligence | v1.0 | 3/3 | Complete | 2026-02-15 |
| 4. Multi-Agent | v1.0 | 4/4 | Complete | 2026-02-15 |
| 5. Background Intelligence | v1.0 | 4/4 | Complete | 2026-02-15 |
| 6. Integration Types | v1.1 | 1/1 | Complete | 2026-02-16 |
| 7. Hook Alignment | v1.1 | 1/1 | Complete | 2026-02-16 |
| 8. Tool Factory | v1.1 | 1/1 | Complete | 2026-02-16 |
| 9. CLI Bridge | v1.1 | 1/1 | Complete | 2026-02-17 |
| 10. Hook Extensions | v1.1 | 0/? | Not started | - |
| 11. Integration Tests | v1.1 | 0/? | Not started | - |
