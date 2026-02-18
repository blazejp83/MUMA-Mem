# MUMA-Mem: Multi-User Multi-Agent Memory Architecture for OpenClaw

> A research-informed memory architecture for LLM agent environments where multiple users operate multiple agents with persistent, evolving memory.

---

## Table of Contents

1. [Motivation and Problem Statement](#1-motivation-and-problem-statement)
2. [Research Foundations](#2-research-foundations)
3. [Architecture Overview](#3-architecture-overview)
4. [Layer 1: Agent Local Memory](#4-layer-1-agent-local-memory)
5. [Layer 2: Per-User Shared Memory](#5-layer-2-per-user-shared-memory)
6. [Layer 3: Knowledge Commons](#6-layer-3-knowledge-commons)
7. [Layer 4: Memory Management Daemon](#7-layer-4-memory-management-daemon)
8. [Layer 5: MCP Orchestration Bridge](#8-layer-5-mcp-orchestration-bridge)
9. [Implementation Stack](#9-implementation-stack)
10. [Memory Lifecycle](#10-memory-lifecycle)
11. [Problem Resolution Matrix](#11-problem-resolution-matrix)
12. [User Sovereignty](#12-user-sovereignty)
13. [Deployment Model](#13-deployment-model)
14. [Open Questions and Future Work](#14-open-questions-and-future-work)
15. [References](#15-references)

---

## 1. Motivation and Problem Statement

OpenClaw provides each user with a VPS-hosted AI agent workspace (`~/clawd/`) organized as a filesystem with directories for business, personal, memory, skills, and more. Root-level files like `MEMORY.md`, `SOUL.md`, `USER.md`, and `TOOLS.md` give each agent identity and context on startup.

This filesystem-as-memory pattern works for a single agent serving a single user. It breaks down when:

- **Multiple agents per user** need to coordinate without flooding each other with irrelevant context.
- **Multiple users** need to share domain knowledge without exposing private information.
- **Long-running operation** causes memory to accumulate without bound, degrading retrieval quality.
- **Cross-session continuity** requires more than flat files -- it requires routing, salience scoring, and scoped retrieval.

The core unsolved problems (as identified by Branko Miljesic in community discussion) are:

1. **Routing**: How does an agent know which memory to read for a given task?
2. **Salience**: The agent cannot reason about what it doesn't currently see in context.
3. **Context flooding vs. context loss**: Loading too much dilutes attention; loading too little misses critical information.

A folder structure is a filing cabinet. This architecture makes the filing cabinet intelligent.

---

## 2. Research Foundations

This architecture synthesizes findings from six research sources:

| Source | Key Contribution to Architecture |
|--------|----------------------------------|
| Tao An, "The Agent's Memory Dilemma" (Medium, 2025) | Forgetting as optimization. Unmanaged memory causes self-degradation. RAG is lookup, not memory. Context windows are buffers, not memory. Consolidation from episodic to semantic is essential. |
| Wei et al., "FadeMem" (arXiv 2601.18642, 2026) | Dual-layer memory (Short Memory Layer / Long Memory Layer). Ebbinghaus-inspired exponential decay with adaptive half-lives. Memory conflict resolution strategies: compatible (merge), contradictory (keep higher-confidence), subsumes/subsumed (absorb). Temporal-semantic clustering for fusion. 45% storage reduction with superior retention. |
| Honda et al., "ACT-R-Inspired Memory Architecture" (HAI '25, 2025) | Activation function: A(m) = B(m) + w * S(m) + noise. Base-level activation decays with time, reinforced by access frequency. SBERT (all-MiniLM-L6-v2) validated as optimal embedding model for selective retrieval. Optimal context weight w = 11.0 balances memory stability and context sensitivity. Probabilistic retrieval via Gaussian noise models natural recall variation. |
| Xu et al., "A-Mem: Agentic Memory" (arXiv 2502.12110, 2025) | Zettelkasten-inspired note structure: content, context, keywords, tags, embedding, links. Autonomous link generation between semantically related memories. Memory evolution: existing memories update their context and tags when new related memories arrive. Sub-microsecond retrieval at 1M entries. 85-93% token reduction versus full-context baselines. |
| Wu & Shu, "Memory in LLM-based Multi-agent Systems" (Emory, preprint) | First taxonomy of multi-agent memory. Local vs. shared vs. hybrid topology. Orchestrator and blackboard patterns. Role-conditioned writes, role-adaptive reads. Pub/sub synchronization for consistency. Transactive memory: index of "who knows what" reduces duplication. Cross-agent pruning and coordinated forgetting. Lifelong team learning through episodic-to-semantic consolidation. |
| Chhikara et al., "Mem0" (arXiv 2504.19413, 2025) | Production-ready extract-then-update pipeline: ADD, UPDATE, DELETE, NOOP operations. Graph-based variant (Mem0g) for relational memory using entity-relationship triplets. 91% lower p95 latency versus full-context. 1,764 tokens per query versus 26,000 for full-context. Dual retrieval: entity-centric + semantic triplet matching. |

Additionally, the practical architecture proposed by community member Nazmul Amin Ashiq -- Cron monitors for data, Redis persists it, a master agent orchestrates -- provides the operational skeleton that this design formalizes and extends.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MUMA-Mem Architecture                            │
│                                                                         │
│  ┌────────────────┐  ┌────────────────┐       ┌────────────────┐       │
│  │    User A       │  │    User B       │  ...  │    User N       │     │
│  │  ┌───────────┐  │  │  ┌───────────┐  │       │  ┌───────────┐  │    │
│  │  │ Agent A1  │  │  │  │ Agent B1  │  │       │  │ Agent N1  │  │    │
│  │  │ (local    │  │  │  │ (local    │  │       │  │ (local    │  │    │
│  │  │  memory)  │  │  │  │  memory)  │  │       │  │  memory)  │  │    │
│  │  ├───────────┤  │  │  ├───────────┤  │       │  ├───────────┤  │    │
│  │  │ Agent A2  │  │  │  │ Agent B2  │  │       │  │ Agent N2  │  │    │
│  │  │ (local    │  │  │  │ (local    │  │       │  │ (local    │  │    │
│  │  │  memory)  │  │  │  │  memory)  │  │       │  │  memory)  │  │    │
│  │  └─────┬─────┘  │  │  └─────┬─────┘  │       │  └─────┬─────┘  │   │
│  │        │        │  │        │        │       │        │        │    │
│  │  ┌─────▼─────┐  │  │  ┌─────▼─────┐  │       │  ┌─────▼─────┐  │   │
│  │  │ User A    │  │  │  │ User B    │  │       │  │ User N    │  │   │
│  │  │ Shared    │  │  │  │ Shared    │  │       │  │ Shared    │  │   │
│  │  │ Memory    │  │  │  │ Memory    │  │       │  │ Memory    │  │   │
│  │  └─────┬─────┘  │  │  └─────┬─────┘  │       │  └─────┬─────┘  │   │
│  └────────┼────────┘  └────────┼────────┘       └────────┼────────┘   │
│           │                    │                          │            │
│  ┌────────▼────────────────────▼──────────────────────────▼────────┐   │
│  │                Memory Bus (MCP + Redis Pub/Sub)                  │   │
│  └────────┬────────────────────┬──────────────────────────┬────────┘   │
│           │                    │                          │            │
│  ┌────────▼────────┐  ┌───────▼────────┐  ┌──────────────▼─────────┐  │
│  │  Orchestrator   │  │  Memory        │  │  Knowledge             │  │
│  │  (Master Agent) │  │  Manager       │  │  Commons               │  │
│  │                 │  │  (Cron Daemon) │  │  (Team-shared store)   │  │
│  └─────────────────┘  └────────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

The architecture has five layers, each addressing a distinct concern:

| Layer | Concern | Scope |
|-------|---------|-------|
| **Layer 1: Agent Local Memory** | Working memory, task-scoped recall | Per agent instance |
| **Layer 2: User Shared Memory** | Persistent knowledge, cross-agent coordination | Per user, all their agents |
| **Layer 3: Knowledge Commons** | Domain knowledge, team skills, transactive index | Cross-user, role-scoped |
| **Layer 4: Memory Manager** | Decay, consolidation, conflict resolution, pruning | System-wide background |
| **Layer 5: MCP Bridge** | Routing, handoffs, tool exposure | All components |

---

## 4. Layer 1: Agent Local Memory

Each agent instance maintains its own working memory. This is analogous to an individual human's cognitive state during a task -- scoped, focused, and temporary.

### 4.1 Purpose

- Prevent context flooding: agents only hold memories relevant to their role and current task.
- Enable probabilistic, human-like retrieval rather than deterministic lookup.
- Solve the routing problem: scoped memory means the right context surfaces naturally.

### 4.2 Memory Item Schema

```json
{
  "id": "uuid-v4",
  "content": "User prefers concise explanations over detailed walkthroughs",
  "embedding": [0.023, -0.118, ...],
  "base_activation": 2.34,
  "access_log": ["2025-11-01T10:00:00Z", "2025-11-03T14:22:00Z"],
  "created_at": "2025-10-28T09:15:00Z",
  "half_life": 168.0,
  "importance": 0.82,
  "source": "experience",
  "confidence": 0.9,
  "visibility": "open",
  "agent_id": "agent-a1-coding",
  "user_id": "user-a"
}
```

**Field definitions:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `content` | string | Natural language memory content |
| `embedding` | float[384] | Dense vector from all-MiniLM-L6-v2 |
| `base_activation` | float | B(m) value; decays over time, reinforced by access |
| `access_log` | timestamp[] | Every retrieval event; used to compute B(m) |
| `created_at` | timestamp | When the memory was first created |
| `half_life` | float | Hours until retention drops to 50%; adaptive |
| `importance` | float 0-1 | LLM-scored importance at creation time |
| `source` | enum | `experience` (from interaction), `told` (from user/other agent), `inferred` (derived) |
| `confidence` | float 0-1 | How certain the agent is about this memory |
| `visibility` | enum | Access scope: `open`, `scoped`, `private`, or `user-only` (see Section 5.4.1) |
| `agent_id` | string | Which agent created this memory |
| `user_id` | string | Which user this memory belongs to |

### 4.3 Activation Function

Adapted from ACT-R (Honda et al., 2025), the total activation of a memory item determines its probability of being retrieved:

```
A(m) = B(m) + w * cos_sim(query, m.embedding) + ε
```

Where:

**Base-level activation** reflects recency and frequency of access:

```
B(m) = ln( Σ (t - t_i)^(-d) )
         i=1..n

  t    = current time
  t_i  = time of the i-th access
  n    = total number of past accesses
  d    = 0.5 (standard ACT-R decay parameter)
```

Recently and frequently accessed memories have higher B(m). Unused memories decay toward negative infinity.

**Spreading activation** represents contextual relevance:

```
w * cos_sim(query, m.embedding)

  w = 11.0 (optimal value from Honda et al. experiments)
  cos_sim = cosine similarity between query embedding and memory embedding
```

The weight `w = 11.0` was empirically determined to balance temporal stability (not forgetting useful memories too fast) with context sensitivity (retrieving what's relevant now). Lower values make retrieval history-dominated; higher values make it overly reactive to the current query.

**Stochastic noise** introduces natural variation:

```
ε ~ N(0, σ)

  σ = 1.2 (from Honda et al. experimental setup)
```

This noise means the same query won't always return identical results, modeling how human recall varies. A memory that's usually below threshold might occasionally surface due to noise, enabling serendipitous recall.

**Retrieval rule:** A memory is retrieved only if `A(m) > retrieval_threshold`. The threshold is a tunable parameter per agent role.

### 4.4 Forgetting Mechanism

From FadeMem (Wei et al., 2026), each memory has an adaptive half-life governing its decay:

```
retention(t) = e^(-λt)

  λ = ln(2) / half_life
```

The half-life adapts based on events:

| Event | Effect on half_life |
|-------|-------------------|
| Memory accessed (retrieved successfully) | Increase by 20% (consolidation) |
| Memory reinforced by similar new memory | Increase by 10% |
| Conflicting memory created | Decrease by 30% |
| User pins memory as important | Set to infinity (never decay) |
| Memory not accessed for > 2x half_life | Candidate for pruning |

### 4.5 Storage

Agent local memory is held in-process during the agent's active session. On session end, surviving memories (activation > persistence_threshold) are promoted to Layer 2 (User Shared Memory) via the write pipeline.

---

## 5. Layer 2: Per-User Shared Memory

This is the user's persistent "second brain." All agents belonging to a user can read from and write to this layer through controlled operations. It serves as the durable memory store that survives individual agent sessions.

### 5.1 Purpose

- Cross-agent knowledge sharing within a single user's workspace.
- Long-term persistence of valuable memories beyond individual sessions.
- Human-readable filesystem backup preserving OpenClaw's inspectability principle.

### 5.2 Note Structure

Inspired by A-Mem's Zettelkasten method (Xu et al., 2025):

```json
{
  "id": "uuid-v4",
  "content": "User closed the SaaS deal with Acme Corp for $24k ARR",
  "context": "Business milestone: successful enterprise sale in Q4 2025, first deal over $20k",
  "keywords": ["Acme Corp", "SaaS", "deal closed", "ARR", "$24k"],
  "tags": ["business", "sales", "milestone", "enterprise"],
  "embedding": [0.045, -0.092, ...],
  "links": ["note-uuid-pricing-strategy", "note-uuid-acme-first-contact"],
  "created_at": "2025-11-15T16:30:00Z",
  "updated_at": "2025-11-15T16:30:00Z",
  "created_by": "agent-a2-sales",
  "access_count": 0,
  "activation": 4.2,
  "version": 1,
  "user_id": "user-a",
  "domain": "business/sales",
  "visibility": "scoped"
}
```

**Field definitions beyond Layer 1 fields:**

| Field | Type | Description |
|-------|------|-------------|
| `context` | string | LLM-generated one-sentence semantic summary |
| `keywords` | string[] | LLM-extracted key concepts (ordered by salience) |
| `tags` | string[] | Categorical labels for classification and filtering |
| `links` | UUID[] | Bidirectional connections to related notes |
| `version` | int | Incremented on each update for conflict resolution |
| `domain` | string | Topical classification for relevance routing (e.g., `business/sales`). Determines which agents find this memory *relevant*. Maps to OpenClaw filesystem path. |
| `visibility` | enum | Access scope that determines which agents are *permitted* to see this memory, independent of domain. See Section 5.4.1. |

### 5.3 Write Pipeline

When an agent commits a memory to the shared store, it passes through a pipeline modeled on Mem0 (Chhikara et al., 2025):

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ EXTRACT  │───▶│ CONSTRUCT │───▶│ RETRIEVE │───▶│  DECIDE  │───▶│   LINK   │───▶│  EVOLVE  │
│          │    │           │    │          │    │          │    │          │    │          │
│ Agent    │    │ LLM gen-  │    │ Find     │    │ LLM de-  │    │ Auto-    │    │ Update   │
│ submits  │    │ erates    │    │ top-k    │    │ termines │    │ generate │    │ linked   │
│ raw      │    │ keywords, │    │ similar  │    │ ADD /    │    │ links to │    │ notes'   │
│ content  │    │ tags,     │    │ existing │    │ UPDATE / │    │ related  │    │ context  │
│          │    │ context,  │    │ notes    │    │ DELETE / │    │ notes    │    │ and tags │
│          │    │ visibility│    │ (cosine) │    │ NOOP     │    │          │    │          │
│          │    │ embedding │    │          │    │          │    │          │    │          │
└──────────┘    └───────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

**Step details:**

1. **EXTRACT**: Agent submits raw experience or observation as plain text.
2. **CONSTRUCT**: An LLM (GPT-4o-mini or local Qwen-3B) analyzes the content and generates structured note attributes: keywords (3-7, ordered by salience), tags (3-5 categorical labels), context (one-sentence semantic summary), visibility classification (see Section 5.4.1), and a dense embedding vector. Visibility is classified based on content sensitivity -- factual preferences and general knowledge default to `open`, domain-specific work product defaults to `scoped`, and sensitive personal information defaults to `private`. Domain-level visibility rules (Section 5.4.2) override the LLM's per-memory classification when configured.
3. **RETRIEVE**: The system computes cosine similarity between the new note's embedding and all existing notes, returning the top-k (k=10) most similar existing notes.
4. **DECIDE**: The LLM examines the new note alongside the top-k similar notes and selects one of four operations:
   - **ADD**: No semantic equivalent exists. Create new note.
   - **UPDATE**: An existing note covers the same topic but the new information adds to it. Augment the existing note's content and regenerate its context/keywords/tags.
   - **DELETE**: The new information directly contradicts and supersedes an existing note. Mark the old note as superseded (soft delete with provenance trail).
   - **NOOP**: The information is already captured. Bump the existing note's activation and access count.
5. **LINK**: For ADD and UPDATE operations, the system prompts the LLM to examine shared attributes (keywords, tags) between the new/updated note and its nearest neighbors. Links are created where meaningful relationships exist. Links are bidirectional.
6. **EVOLVE**: When a new note is linked to existing notes, the system evaluates whether the linked notes' context descriptions and tags should be updated to reflect the new knowledge. This is A-Mem's memory evolution mechanism -- the existing memory network refines itself as new information arrives.

### 5.4 Read Pipeline

Retrieval uses a **two-axis access model** that separates *relevance* (which memories are useful for this agent's task) from *permission* (which memories this agent is allowed to see). This replaces the single-axis domain-path filtering from earlier designs, which was too coarse to handle cases where a personal memory (e.g., "User is based in Berlin") should be visible to business agents while other personal memories (e.g., health data) should not.

```
Agent submits query
    │
    ▼
┌─────────────────────┐
│ 1. Embed query       │
│    (all-MiniLM-L6-v2)│
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────┐
│ 2. Visibility gate (hard)     │
│    Remove all memories the    │
│    agent is not permitted     │
│    to see based on visibility │
│    level (see 5.4.1)          │
└──────────┬───────────────────┘
           │
           ▼
┌─────────────────────────┐
│ 3. Compute activation-  │
│    weighted similarity   │
│                          │
│    score(m) = activation │
│      * cos_sim(q, m)     │
│      + recency_bonus     │
│      + domain_boost      │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────┐
│ 4. Retrieve top-k    │
│    (k=10 default)    │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────┐
│ 5. Link expansion (1-hop)│
│    Follow links from      │
│    retrieved notes to get │
│    related context.       │
│    Linked notes are also  │
│    subject to visibility  │
│    gate -- private links  │
│    are not followed for   │
│    unauthorized agents.   │
└──────────┬───────────────┘
           │
           ▼
┌─────────────────────┐
│ 6. Return scoped     │
│    context to agent  │
└─────────────────────┘
```

Note that the visibility gate (step 2) is applied **before** scoring, not after. This means private memories are never even candidates for retrieval by unauthorized agents, and the top-k budget is not wasted on memories that would be filtered out.

The `domain_boost` in step 3 is a soft relevance signal: memories whose domain matches the agent's primary domains receive a configurable boost (default `+1.0` to activation score). This means a coding agent will preferentially surface `business/coding/*` memories, but can still retrieve an `open`-visibility memory from `personal/preferences` if it's highly relevant to the query.

#### 5.4.1 Visibility Levels

Each memory has a `visibility` field that acts as a **hard access gate**, independent of its domain. This is the permission axis.

| Visibility | Who Can See It | Use Case |
|------------|---------------|----------|
| `open` | All agents belonging to this user | General facts, preferences, location, language, timezone -- information useful regardless of agent role. |
| `scoped` | Agents whose role includes the memory's domain in their domain list | Work product and domain-specific knowledge. A sales deal is relevant to sales agents; a coding pattern is relevant to coding agents. Default for most memories. |
| `private` | Only the originating agent + the user's personal assistant agent | Sensitive personal information: health, finances, relationships, private reflections. |
| `user-only` | Never injected automatically; only returned via explicit `memory.query` tool call | Highly sensitive data the user wants stored but never surfaced without deliberate action. |

The `visibility` field is assigned during the CONSTRUCT step of the write pipeline (Section 5.3) and can be overridden by the user at any time (Section 5.4.2).

**Visibility resolution order** (highest priority wins):

1. User-set per-memory override (via `memory.pin`, file edit, or explicit command)
2. Domain-level visibility rule (Section 5.4.2)
3. LLM classification from the CONSTRUCT step
4. System default (`scoped`)

#### 5.4.2 Domain-Level Visibility Rules

Users can set default visibility for entire domains, overriding the LLM's per-memory classification. These rules are stored in the user's memory config and applied at write time.

```json
{
  "visibility_rules": {
    "personal/health": "private",
    "personal/finance": "private",
    "personal/preferences": "open",
    "personal/location": "open",
    "business/coding": "scoped",
    "business/sales": "scoped",
    "skills": "open"
  },
  "default_visibility": "scoped"
}
```

When a memory's domain matches a rule, that rule's visibility is used instead of the LLM's classification. This gives users predictable, auditable control: "everything about my health is always private" is a single rule, not a per-memory hope that the LLM classifies correctly.

Rules are matched by longest prefix. A memory with domain `personal/health/therapy` matches `personal/health` → `private`. If no rule matches, the LLM classification is used. If the LLM didn't classify (e.g., memory was created via file edit), `default_visibility` applies.

#### 5.4.3 Agent Memory Profiles

Each agent has a memory profile that defines its primary domains (used for `domain_boost` in scoring) and its visibility permissions. In the OpenClaw integration, agents are defined in `agents.list[]` and routed via `bindings[]` (see Multi-Agent Sandbox & Tools). The memory profile is keyed by agent ID — no need for a separate "role" abstraction since the agent itself is already the unit of identity and routing.

```json
{
  "agent_memory": {
    "main": {
      "domains": ["*"],
      "can_see_private": true
    },
    "coding": {
      "domains": ["business/coding", "skills", "docs"]
    },
    "sales": {
      "domains": ["business/sales", "business/research"]
    },
    "family": {
      "domains": ["personal/family", "personal/preferences"]
    },
    "orchestrator": {
      "domains": ["*"],
      "can_see_private": false
    }
  },
  "default_agent_memory": {
    "domains": ["*"],
    "can_see_private": false
  }
}
```

Agents not listed in `agent_memory` inherit `default_agent_memory`. This means adding a new agent to the system works immediately — it gets access to all `open` memories and all `scoped` memories (since `domains: ["*"]`), but no `private` memories. The user can then tighten the profile as needed.

**What each agent sees:**

| Agent | Sees `open` | Sees `scoped` | Sees `private` | Sees `user-only` |
|------------|:-----------:|:-------------:|:--------------:|:----------------:|
| main (personal assistant) | Yes | All domains | Yes (`can_see_private: true`) | No |
| coding | Yes | Only `business/coding`, `skills`, `docs` | No | No |
| sales | Yes | Only `business/sales`, `business/research` | No | No |
| family | Yes | Only `personal/family`, `personal/preferences` | No | No |
| orchestrator | Yes | All domains | No | No |
| (unlisted agent) | Yes | All domains (via default) | No | No |

**Key design decisions:**

- `open` memories are visible to **all** agents. This is how "User is based in Berlin" reaches a sales agent even though it's a personal fact. The user (or the LLM at CONSTRUCT time, or a domain-level rule) marks it `open` because it's non-sensitive and broadly useful.
- `scoped` memories use domain matching: an agent sees `scoped` memories only in domains listed in its profile. This keeps work product separated by default.
- `private` memories require explicit `can_see_private: true` on the profile. Typically only the personal assistant has this.
- `user-only` memories are never automatically injected. They exist for data the user wants stored and searchable on demand but never surfaced proactively.
- The **orchestrator** sees all `open` and `scoped` memories (for routing decisions) but not `private` memories, ensuring it can route tasks without accessing sensitive content.
- The **default profile** is permissive on `scoped` (all domains) but restrictive on `private`. This means a newly added agent immediately works for general queries but never leaks sensitive data. Users tighten domain access as they define the agent's purpose.

### 5.5 Filesystem Synchronization

The Redis-backed memory state periodically syncs to the OpenClaw filesystem, preserving human readability:

```
~/clawd/memory/
├── MEMORY.md              # Auto-generated distilled summary of long-term knowledge
├── daily/
│   └── YYYY-MM-DD.md      # Raw daily interaction logs (episodic)
├── semantic/
│   ├── business/
│   │   ├── sales/
│   │   │   └── *.json     # Serialized note objects
│   │   └── coding/
│   │       └── *.json
│   └── personal/
│       └── *.json
├── graph/
│   └── links.json          # Link index (note_id → [linked_note_ids])
└── snapshots/
    └── YYYY-MM-DD.json     # Full Redis state backup (for recovery)
```

**Sync direction is bidirectional:**
- **Redis → Filesystem**: Every 15 minutes, and on every consolidation cycle.
- **Filesystem → Redis**: On agent startup, and when file modification timestamps change (detecting human edits to `.md` files). This means a user can edit `MEMORY.md` by hand and the changes propagate back into the active memory system.

---

## 6. Layer 3: Knowledge Commons

For teams where multiple users each run their own agents, the Knowledge Commons provides shared domain knowledge with access control.

### 6.1 Purpose

- Share proven knowledge across users without duplicating it in each user's memory.
- Maintain a transactive memory index ("who knows what") to enable efficient routing.
- Accumulate team-wide skills and standard operating procedures.

### 6.2 Structure

```
Knowledge Commons (Redis + optional Neo4j/RedisGraph)
│
├── domain_knowledge/
│   │   Shared facts, business rules, reference material.
│   │   READ:  all agents (with role filter)
│   │   WRITE: orchestrator only (prevents noise accumulation)
│   │
│   ├── Entry schema:
│   │   {
│   │     "id": "uuid",
│   │     "content": "Our SLA guarantees 99.9% uptime for enterprise tier",
│   │     "domain": "business/sales/sla",
│   │     "source_user": "user-a",
│   │     "promoted_from": "note-uuid (original user memory)",
│   │     "confidence": 0.95,
│   │     "verified_by": ["user-a", "user-b"],
│   │     "embedding": [...]
│   │   }
│   │
│   └── Access control: role-scoped read, orchestrator-gated write
│
├── skill_library/
│   │   Proven procedures extracted from successful agent task completions.
│   │   READ:  all agents
│   │   WRITE: via promotion from user memory during consolidation
│   │
│   ├── Entry schema:
│   │   {
│   │     "id": "uuid",
│   │     "name": "deploy-to-production",
│   │     "procedure": "1. Run tests... 2. Build... 3. Deploy...",
│   │     "success_count": 12,
│   │     "failure_count": 1,
│   │     "last_used": "2025-11-10T08:00:00Z",
│   │     "source_agents": ["agent-a1-coding", "agent-b1-coding"],
│   │     "tags": ["devops", "deployment", "production"]
│   │   }
│   │
│   └── Skills with high success_count and cross-user usage are highly trusted
│
├── team_state/
│   │   Current project state, assignments, active blockers.
│   │   READ:  role-scoped (managers see all, workers see their scope)
│   │   WRITE: pub/sub with conflict resolution
│   │
│   └── Implements the blackboard pattern from the MAS Survey:
│       agents post updates, orchestrator resolves conflicts,
│       state changes propagate via pub/sub
│
└── transactive_index/
    │   "Who knows what" -- the meta-memory that prevents duplication.
    │   Maps topics to the users/agents with expertise.
    │
    ├── Entry schema:
    │   {
    │     "topic": "kubernetes-deployment",
    │     "experts": [
    │       {"user_id": "user-a", "agent_id": "agent-a1-coding", "confidence": 0.92},
    │       {"user_id": "user-b", "agent_id": "agent-b1-devops", "confidence": 0.87}
    │     ],
    │     "last_updated": "2025-11-12T10:00:00Z"
    │   }
    │
    └── When an agent needs information on a topic:
        1. Check transactive index first
        2. If an expert exists, route query to that agent/user's memory
        3. If no expert, fall back to Knowledge Commons search
        4. If nothing found, the agent must research from scratch
           and the result becomes a new memory entry
```

### 6.3 Transactive Memory: Solving the Routing Problem

The transactive index is the key innovation from the MAS Survey applied to the OpenClaw context. Instead of every agent storing everything, the system maintains an index of *which agent or user is the expert on which topic*.

**How the index is built:**
- When an agent successfully answers queries on a topic multiple times, its confidence score for that topic increases in the index.
- When a user's shared memory accumulates high-activation notes on a topic, the topic is registered in the index.
- The index is automatically maintained by the Memory Manager daemon.

**How the index is used:**
```
Agent A1 (sales) receives question about Kubernetes deployment
    │
    ▼
Query transactive index for "kubernetes-deployment"
    │
    ▼
Index returns: User A's coding agent (confidence: 0.92)
    │
    ▼
Route query to User A's shared memory, scoped to business/coding/
    │
    ▼
Return relevant context to Agent A1 (sales)
```

This eliminates both context flooding (Agent A1 doesn't need all of User A's coding memories) and context loss (the relevant knowledge is found via routing rather than hoping it was pre-loaded).

### 6.4 Access Control Model

Access control in the Knowledge Commons operates on two levels: **within-user** access uses the two-axis visibility model from Section 5.4.1, and **cross-user** access adds an additional team permission layer.

```
Within-user:  Permission = f(agent_role, memory_visibility, memory_domain)
Cross-user:   Permission = f(user_role, team_membership, commons_section, operation)
```

**Within-user examples (visibility model):**

| Scenario | Visibility | Permission |
|----------|-----------|-----------|
| User A's coding agent reads an `open` memory from `personal/location` | `open` | ALLOW (all agents see `open`) |
| User A's coding agent reads a `scoped` memory from `business/coding` | `scoped` | ALLOW (domain matches role) |
| User A's coding agent reads a `scoped` memory from `business/sales` | `scoped` | DENY (domain outside role) |
| User A's coding agent reads a `private` memory from `personal/health` | `private` | DENY (role lacks `can_see_private`) |
| User A's personal agent reads a `private` memory from `personal/health` | `private` | ALLOW (`can_see_private: true`) |
| Any agent retrieves a `user-only` memory automatically | `user-only` | DENY (requires explicit tool call) |

**Cross-user / Knowledge Commons examples:**

| Scenario | Permission |
|----------|-----------|
| User A's coding agent reads `skill_library/*` | ALLOW (team-readable) |
| User A's personal agent reads User B's `personal/*` | DENY (cross-user private) |
| User A's orchestrator reads all `team_state/*` | ALLOW |
| Any agent writes to `domain_knowledge/*` | DENY (orchestrator-gated) |
| Orchestrator promotes user memory to `domain_knowledge/*` | ALLOW (with user approval) |

**Visibility and promotion:** When a memory is promoted from a user's store to the Knowledge Commons (Section 7.4), its visibility is re-evaluated. A `scoped` memory within a user's store becomes team-readable in the commons. A `private` or `user-only` memory is **never eligible for promotion** unless the user explicitly reclassifies it first.

---

## 7. Layer 4: Memory Management Daemon

This is the background intelligence that transforms static storage into a living memory system. It runs continuously on the VPS, independent of any active agent session.

### 7.1 Process 1: Decay Sweep

**Frequency:** Every hour

**Purpose:** Recalculate activation values across all memory layers, applying time-based decay.

```
For each memory item m across Layers 1, 2, 3:
    elapsed = now - m.last_accessed
    m.retention = e^(-ln(2) / m.half_life * elapsed)
    m.base_activation = recalculate B(m) from m.access_log

    if m.activation < PRUNE_THRESHOLD and m.age > MIN_AGE:
        mark m as consolidation_candidate

    if m.activation < HARD_PRUNE_THRESHOLD and m.age > MAX_AGE:
        if m is not pinned by user:
            archive m to filesystem (cold storage)
            remove from Redis (hot storage)
```

**Threshold tuning guidance:**

| Parameter | Suggested Default | Effect |
|-----------|------------------|--------|
| `PRUNE_THRESHOLD` | -2.0 activation | Memories below this are candidates for consolidation |
| `HARD_PRUNE_THRESHOLD` | -5.0 activation | Memories below this are archived to cold storage |
| `MIN_AGE` | 72 hours | Don't prune anything younger than 3 days |
| `MAX_AGE` | 720 hours (30 days) | Unused memories older than 30 days move to cold storage |

### 7.2 Process 2: Consolidation ("Sleep Cycle")

**Frequency:** Every 24 hours, per user

**Purpose:** Transform episodic memories into semantic knowledge, mirroring human sleep-based memory consolidation.

This process is directly inspired by the neuroscience of memory consolidation discussed in Tao An's article: during sleep, the hippocampus replays experiences and transfers patterns to the neocortex. The consolidation daemon is the agent's "sleep."

```
Consolidation cycle for User X:

1. COLLECT
   Gather all episodic memories from the last 24 hours
   (daily/ logs + agent local memories promoted to shared)

2. CLUSTER
   Group memories by temporal-semantic similarity
   (from FadeMem: temporal-semantic clustering)
   - Compute pairwise cosine similarity between memory embeddings
   - Apply time-weighted clustering (memories close in time AND meaning group together)
   - Produce clusters of related experiences

3. SUMMARIZE
   For each cluster with 3+ memories:
   - Generate a summary note via LLM:
     "Based on these [N] interactions, the key takeaway is: [summary]"
   - This summary becomes a new semantic memory (high importance, long half_life)
   - Link the summary to any existing semantic notes on the same topic

4. PRUNE
   For each individual episodic memory in a summarized cluster:
   - If the summary fully captures it: soft-delete (keep in filesystem, remove from Redis)
   - If it contains unique details not in summary: retain with reduced half_life

5. CONFLICT DETECTION
   Scan for memory pairs where:
   - Cosine similarity > 0.85 (same topic)
   - Content is semantically contradictory (LLM-judged)
   Resolution strategies (from FadeMem):
   - COMPATIBLE: Merge into unified note
   - CONTRADICTORY: Keep higher-confidence / more-recent. Archive the other.
   - SUBSUMES: If memory A fully contains memory B, absorb B into A
   - AMBIGUOUS: Flag for user review (add to ~/clawd/memory/conflicts/)

6. DISTILL
   Regenerate MEMORY.md from the current set of high-activation semantic memories
   This file is what agents read on startup for long-term context

7. REPORT
   Write consolidation log to ~/clawd/memory/daily/YYYY-MM-DD-consolidation.md
   Include: memories created, merged, pruned, conflicts found
```

### 7.3 Process 3: Cross-Agent Synchronization

**Frequency:** Real-time (event-driven)

**Purpose:** Keep all agents for a user aware of memory changes made by sibling agents.

```
Implementation: Redis Pub/Sub

Channels:
  user:{user_id}:memory_update    # Any memory write by any agent for this user
  user:{user_id}:memory_conflict  # Conflict detected between agent memories
  team:knowledge_update           # Changes to Knowledge Commons
  team:state_change               # Changes to team_state/ blackboard

When Agent A2 writes a new memory:
  1. Memory passes through write pipeline (Section 5.3)
  2. On successful write, publish event:
     {
       "event": "memory_write",
       "agent_id": "agent-a2-sales",
       "note_id": "uuid",
       "operation": "ADD",
       "domain": "business/sales",
       "summary": "Closed deal with Acme Corp"
     }
  3. Agent A1 (coding) receives notification
     - If domain is within A1's scope: cache invalidation, refresh on next query
     - If domain is outside A1's scope: ignore

  4. Orchestrator always receives all notifications
     - Updates its routing table and transactive index
```

### 7.4 Process 4: Knowledge Promotion

**Frequency:** Weekly

**Purpose:** Identify high-value memories from individual users that should be promoted to the team-wide Knowledge Commons.

```
Promotion criteria:
  - Memory visibility is "open" or "scoped" (never "private" or "user-only")
  - Memory activation > HIGH_ACTIVATION_THRESHOLD (consistently accessed)
  - Memory has been accessed by multiple agents for the same user
  - Similar memories exist across multiple users (indicating shared relevance)

Promotion pipeline:
  1. Identify candidate memories meeting criteria
  2. VISIBILITY CHECK: reject any memory with visibility "private" or "user-only".
     These are never eligible for promotion regardless of other criteria.
  3. Anonymize if needed (remove user-specific details)
  4. Present to orchestrator for approval
  5. If approved, create entry in Knowledge Commons with visibility
     stripped (commons entries use team-level access control, not
     per-user visibility levels)
  6. Link back to original user memory (provenance trail)

  Note: User approval is always required before promotion. Even "open"
  and "scoped" memories require explicit consent because promotion
  expands the audience from one user's agents to the entire team.
  Users can also preemptively opt out entire domains from promotion
  via their visibility rules (Section 5.4.2).
```

---

## 8. Layer 5: MCP Orchestration Bridge

All components expose their functionality through MCP (Model Context Protocol) servers, enabling standardized agent-to-agent and agent-to-memory communication.

### 8.1 MCP Server: memory-service

The primary interface for all memory operations.

```
Tools:

memory.write
  params: agent_id, content, importance (0-1), domain, visibility (optional)
  returns: note_id, operation_performed (ADD/UPDATE/DELETE/NOOP), assigned_visibility
  desc: Submit a memory through the write pipeline. If visibility is not
        provided, it is determined by: domain-level visibility rules first,
        then LLM classification in the CONSTRUCT step, then the system
        default ("scoped"). See Section 5.4.1.

memory.query
  params: agent_id, query_text, scope (local|user|team), k (top-k, default 10)
  returns: [{ note_id, content, context, relevance_score, source, visibility }]
  desc: Retrieve relevant memories. Results are filtered by the agent's
        visibility permissions (Section 5.4.1) before scoring and ranking.
        Agents never see memories above their visibility clearance.

memory.forget
  params: agent_id, note_id, reason
  returns: success boolean
  desc: Explicitly mark a memory for removal (with audit trail).

memory.link
  params: source_id, target_id, relationship_label
  returns: link_id
  desc: Create a manual link between two notes.

memory.search_agents
  params: topic
  returns: [{ user_id, agent_id, confidence }]
  desc: Query the transactive index to find who knows about a topic.

memory.get_context
  params: agent_id, task_description
  returns: { relevant_memories, suggested_scope, token_count }
  desc: High-level retrieval that combines query + visibility filtering +
        domain boosting + link expansion into a single call. Returns a
        context package ready to inject into an LLM prompt.

memory.consolidate
  params: user_id
  returns: consolidation_report
  desc: Manually trigger a consolidation cycle for a user.

memory.pin
  params: note_id, visibility (optional)
  returns: success boolean
  desc: Mark a memory as "never forget" (infinite half_life). Optionally
        set or change its visibility level at the same time.

memory.set_visibility
  params: note_id | domain, visibility (open|scoped|private|user-only)
  returns: { updated_count, note_ids }
  desc: Set visibility on a single memory (by note_id) or all memories
        in a domain (by domain path). When setting by domain, also creates
        a domain-level visibility rule (Section 5.4.2) so future memories
        in that domain inherit the same visibility.

memory.stats
  params: user_id
  returns: { total_memories, by_domain, by_activation_range,
             by_visibility, storage_bytes }
  desc: Memory usage statistics for monitoring and debugging. The
        by_visibility breakdown shows counts per visibility level.
```

### 8.2 MCP Server: agent-orchestrator

Manages agent lifecycle and inter-agent routing.

```
Tools:

agent.route
  params: task_description, user_id
  returns: { recommended_agent_id, reasoning, relevant_memory_count }
  desc: Determine which agent should handle a task based on the
        transactive index and agent capabilities.

agent.handoff
  params: from_agent_id, to_agent_id, context_summary, memory_ids_to_transfer
  returns: handoff_id
  desc: Transfer a task between agents with relevant memory context.
        The receiving agent gets scoped memories, not the full history.

agent.spawn
  params: role, initial_memory_ids, user_id
  returns: agent_id
  desc: Create a new agent instance with pre-loaded relevant memories.

agent.status
  params: user_id (optional)
  returns: [{ agent_id, role, status, current_task, memory_count }]
  desc: Overview of all active agents and what they're doing.
```

### 8.3 MCP Server: knowledge-commons

Interface to the team-shared knowledge layer.

```
Tools:

commons.query
  params: topic, user_role, k (top-k)
  returns: [{ entry_id, content, domain, confidence, source }]
  desc: Search the Knowledge Commons with role-based filtering.

commons.who_knows
  params: topic
  returns: [{ user_id, agent_id, confidence, last_active }]
  desc: Direct access to the transactive index.

commons.add_skill
  params: name, procedure, tags, source_agent_id
  returns: skill_id
  desc: Register a new skill in the skill library.

commons.get_sop
  params: domain
  returns: { sop_content, version, last_updated }
  desc: Retrieve standard operating procedures for a domain.

commons.propose_knowledge
  params: content, domain, source_note_id, user_id
  returns: proposal_id
  desc: Propose a user memory for promotion to Knowledge Commons.
        Requires orchestrator approval.
```

---

## 9. Implementation Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Embedding model** | all-MiniLM-L6-v2 (SBERT) | Validated by ACT-R paper (Honda et al.) as producing sparse, high-contrast similarity distributions ideal for selective recall. Runs locally on CPU, 384 dimensions, fast inference. |
| **Vector store + pub/sub** | Redis with RediSearch module | Nazmul's validated pattern. Sub-millisecond vector search, built-in pub/sub for synchronization, TTL support for automatic expiry, runs efficiently on a VPS. |
| **Graph relations** | RedisGraph module (or Neo4j Community) | Lighter than full Neo4j for VPS deployment. Supports Mem0g-style entity-relationship triplets. RedisGraph uses Cypher query language. Falls back to link index in JSON if RedisGraph is unavailable. |
| **LLM (extraction/judgment)** | GPT-4o-mini (primary) or local Qwen-3B via Ollama | For the write pipeline CONSTRUCT/DECIDE/EVOLVE steps. GPT-4o-mini validated by A-Mem and Mem0 for structured extraction. Local Qwen-3B option for cost-sensitive or offline deployments. |
| **Filesystem** | `~/clawd/memory/` (existing OpenClaw structure) | Human-readable backup. Users can browse and edit. Bidirectional sync with Redis ensures changes propagate both ways. |
| **Background daemon** | Python with APScheduler (or systemd timers) | Runs consolidation, decay sweeps, sync processes, knowledge promotion. Lightweight, reliable on VPS. |
| **MCP bridge** | MCP protocol over stdio (local) or SSE (remote) | Native to OpenClaw agent communication. Each layer exposes MCP tools that agents can discover and call. |
| **Monitoring** | Redis key metrics + filesystem logs | Memory count, activation distribution, consolidation reports, conflict logs. Written to `~/clawd/memory/` for user inspection. |

### Resource Requirements (VPS)

| Resource | Estimate for ~10 users, ~30 agents |
|----------|-----------------------------------|
| Redis memory | ~500MB (assuming ~50K notes total with embeddings) |
| Disk (filesystem backup) | ~2GB (JSON + markdown files) |
| CPU (daemon processes) | Minimal; consolidation cycle takes ~2-5 min per user |
| Embedding inference | ~50ms per embedding on CPU (MiniLM-L6-v2 is tiny) |
| LLM API calls (write pipeline) | ~3 calls per memory write (construct + decide + evolve) |

---

## 10. Memory Lifecycle

A memory's journey through the system, from creation to potential archival:

```
                    ┌─────────────────────────┐
                    │  1. EXPERIENCE           │
                    │  Agent interacts with     │
                    │  environment or user      │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  2. LOCAL CAPTURE         │
                    │  Stored in agent's local  │
                    │  memory with activation   │
                    │  scoring and decay params │
                    └────────────┬─────────────┘
                                 │
                          Session ends or
                        memory is high-value
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  3. WRITE PIPELINE       │
                    │  Extract → Construct →   │
                    │  Retrieve → Decide →     │
                    │  Link → Evolve           │
                    │                          │
                    │  Result: ADD / UPDATE /   │
                    │  DELETE / NOOP            │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  4. SHARED MEMORY         │
                    │  Lives in Redis + syncs   │
                    │  to filesystem. Accessible│
                    │  by all user's agents.    │
                    │  Subject to decay.        │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────┤────────────┐
                    │            │            │
                    ▼            ▼            ▼
           ┌──────────┐  ┌──────────┐  ┌──────────┐
           │ ACCESSED  │  │ DECAYS   │  │ PROMOTED │
           │ frequently│  │ unused   │  │ to       │
           │           │  │          │  │ Knowledge│
           │ activation│  │ activation│  │ Commons  │
           │ increases │  │ decreases│  │          │
           └─────┬─────┘  └─────┬────┘  └──────────┘
                 │              │
                 │              ▼
                 │     ┌──────────────┐
                 │     │ CONSOLIDATION│
                 │     │ Episodic →   │
                 │     │ Semantic     │
                 │     │ (sleep cycle)│
                 │     └──────┬───────┘
                 │            │
                 │     ┌──────┴───────────┐
                 │     │                  │
                 │     ▼                  ▼
                 │  ┌────────┐     ┌────────────┐
                 │  │SURVIVES│     │  ARCHIVED   │
                 │  │as      │     │  to cold    │
                 │  │summary │     │  filesystem │
                 │  │note    │     │  storage    │
                 └──┴────────┘     └────────────┘
```

---

## 11. Problem Resolution Matrix

### Problems Identified in Community Discussion

| Problem (Branko Miljesic) | How MUMA-Mem Solves It |
|--------------------------|------------------------|
| **Routing**: Agent doesn't know which file to read | Transactive memory index maps topics to expert agents. Activation-weighted retrieval surfaces relevant memories by context, not file path. Role-adaptive filtering scopes what each agent sees. |
| **Salience**: Agent can't reason about what it doesn't see | ACT-R activation function with decay + frequency + semantic similarity + noise means high-salience memories surface naturally. Consolidation compresses many experiences into high-activation summaries. |
| **Context flooding**: Loading too much dilutes attention | Two-axis access model: visibility gate removes impermissible memories before scoring, domain boost prioritizes role-relevant memories. Top-k with activation weighting. Agents get ~1.7K tokens of relevant context, not 26K of everything. |
| **Context loss**: Loading too little misses critical info | Multi-layer fallback: local → user shared → knowledge commons → transactive index → route to expert. Link expansion (1-hop) pulls in related context. The `open` visibility level ensures broadly useful facts (preferences, location, timezone) reach all agents regardless of domain. |
| **"Bigger filing cabinet"**: Structure ≠ intelligence | Memory evolution (existing memories update when new ones arrive). Forgetting curves prune noise. Consolidation transforms episodic → semantic. The system learns, not just stores. |

### Problems Identified in Research

| Problem (Research Sources) | How MUMA-Mem Solves It |
|---------------------------|------------------------|
| **Self-degradation** from unmanaged memory accumulation (Tao An) | Ebbinghaus decay curves (FadeMem). Consolidation pruning. Error-propagating memories naturally decay unless reinforced by successful access. |
| **RAG ≠ Memory** distinction (Tao An, A-Mem) | RAG is used for external knowledge lookup (Knowledge Commons). Memory uses activation-based recall with episodic-to-semantic consolidation. Clear architectural boundary. |
| **Memory conflicts** when multiple sources disagree (FadeMem) | Explicit conflict resolution during consolidation: compatible (merge), contradictory (keep higher-confidence), subsumes (absorb), ambiguous (flag for human). |
| **Multi-agent consistency** when agents have different views (MAS Survey) | Redis pub/sub synchronization. Version tracking on notes. Orchestrator-mediated writes to shared state. Serialized turns for conflict-prone domains. |
| **Scalability** as memory grows (Mem0) | Mem0-style extract-then-update pipeline keeps token count low. Redis + RediSearch provide sub-millisecond retrieval. A-Mem validated sub-microsecond at 1M entries. Decay and pruning prevent unbounded growth. |
| **No persistent memory across sessions** (Mem0, MAS Survey) | Layer 2 (User Shared Memory) persists in Redis + filesystem. MEMORY.md loaded on every agent startup. Consolidation ensures long-term knowledge survives. |
| **Lack of coordinated forgetting** across agents (MAS Survey) | Memory Manager daemon runs cross-agent decay sweeps. Consolidation operates on the full user memory, not per-agent. Knowledge Commons has its own promotion/pruning lifecycle. |

---

## 12. User Sovereignty

None of the research papers adequately address user control over their own memory system. In a real deployment, the user must remain sovereign.

### 12.1 Principles

1. **Transparency**: Every memory has full provenance (which agent created it, from what interaction, when, confidence level, visibility classification).
2. **Inspectability**: All memory is synced to human-readable files in `~/clawd/memory/`. Users can browse at any time. Visibility levels are visible in each memory's JSON file.
3. **Editability**: Users can edit any `.md` or `.json` file in the memory directory, including changing `visibility` fields. Changes propagate back to Redis on next sync cycle.
4. **Pinning**: Users can mark any memory as "never forget" via `memory.pin` or by adding a `pinned: true` flag in the file.
5. **Deletion**: Users can delete any memory. Deletions are respected immediately and propagated to all layers.
6. **Visibility control**: Users can set visibility on individual memories or entire domains (Section 5.4.2). Domain-level rules provide predictable, auditable boundaries: "everything in `personal/health` is always `private`" is a single rule that overrides any LLM classification. The system never escalates visibility without user action -- a `private` memory cannot become `open` except by explicit user command.
7. **Opt-out**: Users can exclude entire domains from the Knowledge Commons. Memories with `private` or `user-only` visibility are never eligible for promotion regardless of other criteria.
8. **Export**: Full memory dump available at any time as portable JSON. No vendor lock-in.
9. **Conflict review**: When the system detects ambiguous conflicts it cannot auto-resolve, it writes them to `~/clawd/memory/conflicts/` for human review rather than making assumptions.

### 12.2 User-Accessible Commands

Through the agent interface or directly:

```
"Remember that I always prefer TypeScript over JavaScript"
  → Creates pinned memory in personal/preferences with infinite half_life
  → Visibility: "open" (preference useful to all agents)

"Forget everything about the failed project X"
  → Scans for memories tagged with "project-x", archives to cold storage

"What do you remember about my health goals?"
  → Queries personal/health domain with full link expansion
  → Only returns results if the requesting agent has "private" access

"Keep my health information private"
  → Sets domain-level visibility rule: personal/health → "private"
  → Retroactively updates all existing memories in that domain

"Make my location available to all agents"
  → Sets visibility on personal/location memories to "open"

"Show me your memory stats"
  → Returns count, domains, activation distribution, visibility
    breakdown, storage usage

"Export all my memories"
  → Generates portable JSON dump of all user memories across layers

"Which of my memories are shared with business agents?"
  → Lists all memories with visibility "open" or "scoped" in
    business domains, showing which agents can see each one
```

---

## 13. Deployment Model

### 13.1 Single-User (Existing OpenClaw)

Simplest deployment. One user, multiple agents, one VPS.

```
VPS
├── Redis (Layers 1 + 2)
├── Memory Manager daemon
├── MCP servers (memory-service, agent-orchestrator)
├── ~/clawd/memory/ (filesystem sync)
└── Agents (spawned on demand)
```

Layer 3 (Knowledge Commons) is omitted or acts as a personal skill library.

### 13.2 Multi-User Team

Multiple users on shared infrastructure, each with their own agents plus shared resources.

```
VPS (or small cluster)
├── Redis (all layers, namespaced per user)
│   ├── user:alice:* (Layer 2)
│   ├── user:bob:* (Layer 2)
│   ├── commons:* (Layer 3)
│   └── transactive:* (Layer 3)
├── Memory Manager daemon (runs per-user + team consolidation)
├── MCP servers (shared infrastructure)
├── ~/clawd/ per user (filesystem sync)
│   ├── /home/alice/clawd/memory/
│   └── /home/bob/clawd/memory/
└── Agents (per-user, namespaced)
```

### 13.3 Federated (Future)

Multiple VPS instances, each running their own MUMA-Mem, with optional cross-instance knowledge sharing.

```
VPS-1 (Team Alpha)          VPS-2 (Team Beta)
├── Local MUMA-Mem          ├── Local MUMA-Mem
└── Federation Bridge ◄────►└── Federation Bridge
         │                           │
         └───────────┬───────────────┘
                     │
              Shared Federation
              Knowledge Commons
              (selective sync)
```

This is speculative and would require additional work on federation protocols, but the architecture supports it because each layer is cleanly separated with well-defined interfaces.

---

## 14. Open Questions and Future Work

### 14.1 Unresolved Research Questions

1. **Optimal decay parameters per domain**: Should business memories decay slower than personal memories? Should coding knowledge have different half-lives than sales knowledge? This requires empirical study in real deployments.

2. **Memory consolidation quality**: How do we evaluate whether the LLM-generated summaries during consolidation actually capture the essential information? The current approach trusts the LLM, but verification mechanisms are needed.

3. **Cross-user privacy in Knowledge Commons**: When a memory is promoted from a user's personal store to the team commons, what anonymization is sufficient? Differential privacy techniques may be applicable.

4. **Adversarial memory manipulation**: In a multi-user environment, can one user's agent poison the Knowledge Commons with incorrect information? Trust scoring and provenance tracking mitigate this, but formal guarantees are lacking.

5. **Emotional salience**: The ACT-R paper (Honda et al.) and the Medium article (Tao An) both note that human memory is strongly influenced by emotional arousal. Current activation functions don't model this. Incorporating sentiment analysis into importance scoring could improve salience.

### 14.2 Engineering Work Needed

1. **Benchmarking**: Evaluate MUMA-Mem against LoCoMo and DialSim datasets (used by A-Mem and Mem0) to establish baseline performance metrics.

2. **Embedding model evaluation**: While all-MiniLM-L6-v2 is validated for single-agent use, its performance in the multi-agent, multi-domain setting should be tested. Domain-specific fine-tuning may help.

3. **Redis memory optimization**: At scale (100+ users, 1M+ memories), Redis memory usage needs profiling. Techniques like embedding quantization (float32 → float16) and tiered storage (hot/warm/cold) should be explored.

4. **Write pipeline latency**: The current design requires 3 LLM calls per memory write (construct, decide, evolve). For high-throughput scenarios, batching and async processing should be implemented.

5. **Consolidation tuning**: The 24-hour consolidation cycle is a starting point. The optimal frequency likely varies per user activity level. Adaptive scheduling based on memory accumulation rate would be better.

---

## 15. References

### Primary Research Sources

1. **Tao An.** "The Agent's Memory Dilemma: Is Forgetting a Bug or a Feature?" Medium, November 2025.

2. **Lei Wei, Xiao Peng, Xu Dong, Niantao Xie, Bin Wang.** "FadeMem: Biologically-Inspired Forgetting for Efficient Agent Memory." arXiv:2601.18642v2, February 2026.

3. **Yudai Honda, Yuki Fujita, Keiichi Zempo, Shogo Fukushima.** "Human-Like Remembering and Forgetting in LLM Agents: An ACT-R-Inspired Memory Architecture." HAI '25: 13th International Conference on Human-Agent Interaction, November 2025. ACM. DOI: 10.1145/3765766.3765803

4. **Wujiang Xu, Zujie Liang, Kai Mei, Hang Gao, Juntao Tan, Yongfeng Zhang.** "A-Mem: Agentic Memory for LLM Agents." arXiv:2502.12110v11, October 2025.

5. **Shanglin Wu, Kai Shu.** "Memory in LLM-based Multi-agent Systems: Mechanisms, Challenges, and Collective Intelligence." Emory University, preprint.

6. **Prateek Chhikara, Dev Khant, Saket Aryan, Taranjeet Singh, Deshraj Yadav.** "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory." arXiv:2504.19413v1, April 2025.

### Community Discussion

7. **Branko Miljesic.** Critique of filesystem-as-memory approach. OpenClaw community discussion.

8. **Nazmul Amin Ashiq.** MCP bridge architecture: Cron + Redis + Master agent. OpenClaw community discussion.

### Foundational References

9. **Anderson, J. R. et al.** "An Integrated Theory of the Mind." Psychological Review, 2004.

10. **Ebbinghaus, H.** "Memory: A Contribution to Experimental Psychology." 1885.

11. **Ahrens, S.** "How to Take Smart Notes." 2017. (Zettelkasten method)

12. **Park, J. S. et al.** "Generative Agents: Interactive Simulacra of Human Behavior." 2023.

13. **Packer, C. et al.** "MemGPT: Towards LLMs as Operating Systems." 2023.
