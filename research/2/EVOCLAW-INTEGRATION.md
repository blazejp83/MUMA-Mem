# EvoClaw Integration Roadmap

**Created:** 2026-02-17
**Source:** `/home/blaze/repos/.obsolete/EvoClaw`
**Target:** MUMA-Mem v2.0

## Overview

Integrate EvoClaw's identity evolution framework into MUMA-Mem as a native TypeScript module. EvoClaw provides structured identity evolution (SOUL.md), governed self-modification, experience significance classification, and interactive visualization. MUMA-Mem provides the persistence, retrieval, and cognitive-science infrastructure. The combined system gives agents both durable factual memory *and* a governed mechanism for identity growth.

## Why Integrate

| MUMA-Mem has | MUMA-Mem lacks | EvoClaw provides |
|---|---|---|
| ACT-R activation scoring | Human oversight for memory changes | 3-tier governance (autonomous/advisory/supervised) |
| Vector search + embedding | Experience significance classification | Routine/notable/pivotal tiers with trigger detection |
| Consolidation pipeline | Identity evolution mechanism | Experience -> Reflection -> Proposal -> SOUL Update |
| Multi-agent coordination | Visualization of memory/identity | Interactive dashboard + canvas mindmap |
| Filesystem sync | Validation guardrails for LLM output | 8 structural validators |
| Deduplication pipeline | Structured identity document | SOUL.md with CORE/MUTABLE tagging |

## Incompatibilities & Resolutions

| Incompatibility | Impact | Resolution |
|---|---|---|
| **Architecture paradigm** — EvoClaw is Markdown protocol read by LLM; MUMA-Mem is TypeScript application | Cannot directly reuse EvoClaw code; protocol docs are design specs only | Port *concepts* into TypeScript modules; EvoClaw's SKILL.md becomes the design spec, not runtime code |
| **Storage model** — EvoClaw uses flat JSONL/JSON files; MUMA-Mem uses Redis/SQLite with embeddings | Dual storage creates drift and redundancy | Single storage backend (MUMA-Mem's store). Experiences = Notes. Reflections/proposals = new entity types in same store |
| **Dual experience capture** — Both capture user interactions with different schemas | Running both produces redundant, divergent logs | MUMA-Mem is sole capture point. Add `significance` field to Note type. Classification runs as post-extraction LLM call in write pipeline |
| **Processing cadence** — MUMA-Mem is real-time per-message; EvoClaw batches on heartbeat (~5min) | Different timing assumptions for when processing happens | Both coexist. Memory capture stays real-time. Identity reflection runs as scheduled job (like existing consolidation) |
| **OpenClaw integration** — Both register hooks differently (plugin SDK vs HEARTBEAT.md modification) | Hook conflicts if both active | Single unified plugin. Identity hooks are additional handlers within MUMA-Mem's existing lifecycle |
| **Language boundary** — Python validators vs TypeScript codebase | Mixed runtime, no shared types | Rewrite validators as Zod schemas + TypeScript assertion functions. Python validators become optional external tools |
| **Multi-agent scope** — EvoClaw is single-agent; MUMA-Mem supports multiple agents | Identity evolution pipeline assumes one agent | Each agent gets its own SOUL.md and reflection context. Governance config is per-agent. Shared experiences visible via existing visibility system |
| **ID scheme** — EvoClaw uses `EXP-YYYYMMDD-NNNN` style IDs; MUMA-Mem uses UUID v4 | Incompatible ID formats | Standardize on UUID v4. EvoClaw-style IDs become optional display labels, not primary keys |

## Integration Architecture

```
MUMA-Mem v2.0
├── L1  Working Memory (unchanged)
├── L2  Persistent Memory
│   ├── Notes (unchanged)
│   ├── Identity Notes (pinned, domain:"identity", tagged CORE/MUTABLE)
│   └── Experience Notes (with significance: routine|notable|pivotal)
├── L3  Knowledge Commons (existing v2 plans)
├── L4  Background Daemon
│   ├── Decay sweeps (unchanged)
│   ├── Consolidation (unchanged)
│   └── Identity Reflection (NEW)
│       ├── Batch experiences by significance tier
│       ├── Reflect against identity notes (SOUL)
│       ├── Generate proposals with governance gating
│       └── Apply or queue for human approval
├── L5  Plugin Interface
│   ├── Hooks + Tools (extended)
│   ├── SOUL.md bidirectional sync (NEW)
│   └── Governance tools (NEW)
└── Visualization (NEW)
    ├── Soul evolution dashboard (HTML)
    └── Memory mindmap (HTML canvas)
```

## Milestone: v2.0 — Identity Evolution

**Goal:** Agents evolve their identity through governed self-modification, with full provenance, human oversight, and interactive visualization.

### Phase 13: Experience Significance

**Goal**: Add significance classification to the write pipeline so experiences are triaged as routine/notable/pivotal before storage.

**Depends on**: Phase 12
**Research**: Likely (EvoClaw's classification heuristics, trigger detection patterns)
**Estimated plans**: 2

**What changes:**
- Add `significance` field (`routine | notable | pivotal`) to Note type
- Add `significance_reason` field to Note type
- Add interest keywords to config (nudge classification, never filter)
- LLM classification step after extract in write pipeline
- Keyword-based nudge logic (match -> lean toward notable)
- Significance threshold config (EvoClaw's `significance_thresholds`)

**Key files:** `src/types/note.ts`, `src/pipeline/extract.ts`, `src/config.ts`, `src/store/redis.ts`, `src/store/sqlite.ts`

**Requirements:**
- **SIG-01**: Write pipeline classifies each extracted fact as routine, notable, or pivotal
- **SIG-02**: Classification uses LLM with configurable interest keyword nudging
- **SIG-03**: Pivotal experiences trigger immediate reflection (Phase 15)
- **SIG-04**: Notable experiences batch-reflect at configurable threshold (default: 2)
- **SIG-05**: Routine experiences batch-reflect at configurable threshold (default: 20)

---

### Phase 14: Identity Notes & SOUL.md

**Goal**: Introduce identity notes (the agent's SOUL) as a special class of pinned, governed notes with CORE/MUTABLE tagging and bidirectional SOUL.md sync.

**Depends on**: Phase 13
**Research**: Likely (SOUL.md structure mapping to notes, section/subsection hierarchy)
**Estimated plans**: 3

**What changes:**
- Identity note type: pinned Note with `domain: "identity"`, `source: "soul"`
- CORE/MUTABLE tagging via note metadata (CORE notes are write-protected)
- SOUL.md parser: read existing SOUL.md -> create identity notes per bullet
- SOUL.md generator: identity notes -> regenerate SOUL.md with section structure
- Bidirectional sync (extend existing filesystem sync module)
- Per-agent SOUL (each agent ID has its own identity note set)
- `soul.init` tool: bootstrap identity notes from existing SOUL.md
- `soul.view` tool: display current identity as structured document

**Key files:** `src/types/note.ts`, `src/sync/filesystem.ts`, `src/sync/soul.ts` (new), `src/tools/index.ts`, `src/config.ts`

**Requirements:**
- **SOUL-01**: Agent identity stored as pinned notes with `domain: "identity"`
- **SOUL-02**: Each identity note tagged CORE (immutable) or MUTABLE (evolvable)
- **SOUL-03**: CORE notes cannot be modified or deleted by any pipeline operation
- **SOUL-04**: SOUL.md file generated from identity notes with section hierarchy
- **SOUL-05**: Changes to SOUL.md file propagate back as note updates (respecting CORE)
- **SOUL-06**: Each agent has independent identity (scoped by agent ID)
- **SOUL-07**: Bootstrap tool imports existing SOUL.md into identity notes

---

### Phase 15: Identity Reflection Pipeline

**Goal**: Implement the reflection engine that examines batched experiences against current identity and decides whether identity changes are warranted.

**Depends on**: Phase 14
**Research**: Likely (reflection prompt design, trigger detection, proposal format)
**Estimated plans**: 3

**What changes:**
- Reflection scheduler (runs alongside consolidation, respects significance tiers)
- Experience batcher: groups unreflected notes by significance tier
- Reflection engine: LLM examines batch against identity notes
- Trigger detection: gap, drift, contradiction, growth, refinement
- Reflection artifact type with `proposal_decision` (should_propose, triggers_fired, reasoning)
- Reflection storage (new entity in memory store)
- `identity.reflect` tool: manual reflection trigger

**Key files:** `src/identity/reflection.ts` (new), `src/identity/triggers.ts` (new), `src/identity/types.ts` (new), `src/daemon/scheduler.ts`, `src/tools/index.ts`

**Requirements:**
- **REFL-01**: Reflection batches unreflected experiences by significance tier
- **REFL-02**: Pivotal experiences trigger immediate reflection (skip batching)
- **REFL-03**: Reflection evaluates experiences against current identity notes
- **REFL-04**: Reflection detects 5 trigger types: gap, drift, contradiction, growth, refinement
- **REFL-05**: Each reflection produces a stored artifact with full provenance
- **REFL-06**: Reflection decides whether to generate an identity change proposal

---

### Phase 16: Governance & Proposals

**Goal**: Implement the proposal system with 3-tier governance so identity changes require appropriate human oversight.

**Depends on**: Phase 15
**Research**: Unlikely (EvoClaw's governance model is well-specified)
**Estimated plans**: 2

**What changes:**
- Proposal type: target note, change type (add/modify/remove), proposed content, provenance chain
- Proposal generation from reflection decisions
- Governance config: `autonomous | advisory | supervised` (per-agent)
- Advisory section config: which identity sections auto-apply vs require approval
- Proposal resolution engine (auto-apply or queue for human)
- Proposal history with outcomes (applied/rejected/expired)
- `identity.proposals` tool: list pending proposals
- `identity.approve` / `identity.reject` tools: human governance actions
- `identity.governance` tool: view/change governance level
- CORE immutability enforcement: proposals targeting CORE notes are rejected at generation

**Key files:** `src/identity/proposals.ts` (new), `src/identity/governance.ts` (new), `src/identity/types.ts`, `src/config.ts`, `src/tools/index.ts`

**Requirements:**
- **GOV-01**: Three governance levels: autonomous (auto-apply all), advisory (auto-apply configured sections), supervised (all require approval)
- **GOV-02**: Governance level is per-agent and configurable
- **GOV-03**: Agent cannot escalate its own governance level
- **GOV-04**: Proposals targeting CORE identity notes are always rejected
- **GOV-05**: Every applied proposal produces a change log entry with full provenance
- **GOV-06**: Pending proposals expire after configurable duration (default: 7 days)
- **GOV-07**: Human can approve/reject proposals via agent tools or CLI
- **GOV-08**: Autonomous mode still notifies human of all applied changes

---

### Phase 17: Identity Validation

**Goal**: Port EvoClaw's structural validators to TypeScript as runtime assertion functions that catch common LLM output errors in the identity pipeline.

**Depends on**: Phase 16
**Research**: Unlikely (EvoClaw validators are well-documented Python; direct port)
**Estimated plans**: 1

**What changes:**
- Zod schemas for reflection artifacts, proposals, and identity notes
- Experience validator: significance values, required fields
- Reflection validator: proposal_decision consistency, trigger validity
- Proposal validator: CORE immutability check, content matching, provenance chain
- Soul validator: section structure, tag integrity
- Pipeline integration: validators run before each store write in identity pipeline
- `identity.validate` CLI command: run all validators on current identity state

**Key files:** `src/identity/validation.ts` (new), `src/identity/types.ts`, `src/cli/identity.ts` (new)

**Requirements:**
- **VAL-01**: All identity pipeline outputs validated before persistence
- **VAL-02**: Reflection artifacts checked for proposal_decision consistency
- **VAL-03**: Proposals checked for CORE immutability violations before storage
- **VAL-04**: Identity notes checked for section structure and tag integrity
- **VAL-05**: Validation errors logged with actionable context for debugging
- **VAL-06**: CLI command runs full validation suite on demand

---

### Phase 18: Identity Visualization

**Goal**: Port EvoClaw's soul-viz to work with MUMA-Mem's data store, generating interactive HTML dashboards and mindmaps.

**Depends on**: Phase 16
**Research**: Likely (determine generation approach — TypeScript port vs Python tool reading from store)
**Estimated plans**: 2

**What changes:**
- Dashboard generator: soul map, timeline slider, change log, experience feed
- Mindmap generator: radial tree canvas visualization with growth animation
- Data adapter: reads from MUMA-Mem store (not flat files)
- HTML output: self-contained files with embedded JS/CSS
- `identity.visualize` CLI command: generate dashboard and mindmap
- `identity.visualize` agent tool: generate and return file paths
- Optional: serve generated HTML via local HTTP server

**Key files:** `src/identity/viz/dashboard.ts` (new), `src/identity/viz/mindmap.ts` (new), `src/cli/identity.ts`, `src/tools/index.ts`

**Requirements:**
- **VIZ-01**: Dashboard shows identity sections, evolution timeline, and change log
- **VIZ-02**: Mindmap shows radial tree of identity with growth animation
- **VIZ-03**: Both visualizations are self-contained HTML files (no external dependencies)
- **VIZ-04**: Visualizations read from MUMA-Mem store, not filesystem
- **VIZ-05**: CLI and agent tool available for on-demand generation

---

### Phase 19: Integration Tests & Polish

**Goal**: End-to-end testing of the full identity evolution pipeline and cleanup.

**Depends on**: Phase 17, Phase 18
**Research**: Unlikely
**Estimated plans**: 2

**What changes:**
- E2E test: experience capture -> significance classification -> batching -> reflection -> proposal -> governance -> soul update -> SOUL.md sync
- Governance mode tests: autonomous, advisory, supervised flows
- CORE immutability enforcement tests
- Regression tests for existing memory functionality (identity additions must not break base memory)
- Performance benchmarks for identity pipeline (reflection latency, proposal generation)
- Documentation updates: README, config reference

**Key files:** `src/identity/__tests__/` (new), `test/identity-e2e.ts` (new)

**Requirements:**
- **TEST-01**: E2E test covers full pipeline from experience to SOUL.md update
- **TEST-02**: All three governance modes tested with expected approval/rejection flows
- **TEST-03**: CORE immutability verified under adversarial proposal conditions
- **TEST-04**: Existing memory tests continue to pass (no regressions)
- **TEST-05**: Identity reflection completes within 5s for batches of 20 experiences

## Execution Plan

**Execution order:** 13 -> 14 -> 15 -> 16 -> (17 || 18) -> 19

Phases 17 and 18 are independent and can execute in parallel after Phase 16.

```
Phase 13 ─── Phase 14 ─── Phase 15 ─── Phase 16 ──┬── Phase 17 ──┬── Phase 19
  Significance   SOUL.md     Reflection   Governance │  Validation  │  Tests
                                                     └── Phase 18 ──┘
                                                       Visualization
```

## New Requirements Summary

| ID | Requirement | Phase |
|---|---|---|
| SIG-01 | Significance classification in write pipeline | 13 |
| SIG-02 | LLM classification with keyword nudging | 13 |
| SIG-03 | Pivotal -> immediate reflection | 13 |
| SIG-04 | Notable batch threshold (default 2) | 13 |
| SIG-05 | Routine batch threshold (default 20) | 13 |
| SOUL-01 | Identity as pinned notes with domain:identity | 14 |
| SOUL-02 | CORE/MUTABLE tagging | 14 |
| SOUL-03 | CORE immutability | 14 |
| SOUL-04 | SOUL.md generation from identity notes | 14 |
| SOUL-05 | SOUL.md bidirectional sync | 14 |
| SOUL-06 | Per-agent identity | 14 |
| SOUL-07 | Bootstrap from existing SOUL.md | 14 |
| REFL-01 | Batch by significance tier | 15 |
| REFL-02 | Pivotal immediate reflection | 15 |
| REFL-03 | Reflect against identity notes | 15 |
| REFL-04 | 5 trigger types | 15 |
| REFL-05 | Stored reflection artifacts | 15 |
| REFL-06 | Proposal decision | 15 |
| GOV-01 | Three governance levels | 16 |
| GOV-02 | Per-agent governance | 16 |
| GOV-03 | No self-escalation | 16 |
| GOV-04 | CORE rejection | 16 |
| GOV-05 | Change log with provenance | 16 |
| GOV-06 | Proposal expiration | 16 |
| GOV-07 | Human approve/reject tools | 16 |
| GOV-08 | Autonomous notification | 16 |
| VAL-01 | Pre-persistence validation | 17 |
| VAL-02 | Reflection consistency checks | 17 |
| VAL-03 | CORE immutability validation | 17 |
| VAL-04 | Section/tag integrity | 17 |
| VAL-05 | Actionable error logging | 17 |
| VAL-06 | CLI validation command | 17 |
| VIZ-01 | Evolution dashboard | 18 |
| VIZ-02 | Radial mindmap | 18 |
| VIZ-03 | Self-contained HTML | 18 |
| VIZ-04 | Store-backed data | 18 |
| VIZ-05 | CLI + agent tool | 18 |
| TEST-01 | E2E pipeline test | 19 |
| TEST-02 | Governance mode tests | 19 |
| TEST-03 | CORE immutability tests | 19 |
| TEST-04 | No regressions | 19 |
| TEST-05 | Reflection latency benchmark | 19 |

**Total new requirements:** 40
**New phases:** 7 (Phases 13-19)
**Estimated plans:** ~15

## EvoClaw Assets to Reference

| EvoClaw File | Use As | Target Phase |
|---|---|---|
| `evoclaw/SKILL.md` (1143 lines) | Design spec for full pipeline | 15, 16 |
| `evoclaw/config.json` | Config schema reference | 13, 16 |
| `evoclaw/references/schema.md` | Data format reference | 14, 15, 16 |
| `evoclaw/references/examples.md` | Test case reference | 19 |
| `evoclaw/validators/*.py` | Validation logic to port | 17 |
| `evoclaw/tools/soul-viz.py` (2324 lines) | Visualization to port | 18 |
| `evoclaw/references/sources.md` | Source learning protocol (consider for v2.1) | Deferred |
| `evoclaw/configure.md` | Installation flow reference | 14 |

## Open Questions

1. **SOUL.md location** — Should it live at `~/clawd/memory/{agentId}/SOUL.md` (alongside MEMORY.md) or in a dedicated `~/clawd/identity/` directory?
2. **Governance notifications** — How should autonomous-mode notifications reach the human? Filesystem file? CLI output? Event bus?
3. **Reflection LLM cost** — Each reflection is 1-3 LLM calls. With 3 significance tiers and configurable batch sizes, what's the expected daily LLM cost?
4. **Visualization delivery** — Should viz be a CLI-only feature, or should it integrate with OpenClaw's potential future web UI?
5. **Source learning protocol** — EvoClaw's mechanism for teaching agents new APIs is interesting but orthogonal. Defer to v2.1 or include?

---
*Integration analysis based on MUMA-Mem v1.2 and EvoClaw (archived)*
