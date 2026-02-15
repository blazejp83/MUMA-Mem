# Requirements: MUMA-Mem

**Defined:** 2026-02-13
**Core Value:** Agents automatically receive the right memories at the right time without explicit tool calls — scoped by visibility and domain, decayed by relevance, and consolidated from episodes into durable knowledge.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Storage & Infrastructure

- [ ] **STORE-01**: Memory data persists across process restarts
- [ ] **STORE-02**: System works with Redis (full features) or SQLite (degraded: polling-based sync, no pub/sub)
- [ ] **STORE-03**: Each user's memories are isolated; no cross-user access without explicit sharing
- [ ] **STORE-04**: System uses local embedding model (all-MiniLM-L6-v2) by default with configurable remote override
- [ ] **STORE-05**: System detects embedding dimension mismatch on startup and prevents silent retrieval failures
- [ ] **STORE-06**: System provides configurable LLM provider for write pipeline and background processing
- [ ] **STORE-07**: System ships as standalone npm package with openclaw.plugin.json manifest

### Search & Retrieval

- [ ] **SEARCH-01**: Agent can search memories by natural language query
- [ ] **SEARCH-02**: Search completes within 200ms for up to 10,000 memories
- [ ] **SEARCH-03**: Search results ranked by combined activation score (not just vector similarity)
- [ ] **SEARCH-04**: Agent can control result count via top-k parameter

### Write Pipeline

- [ ] **PIPE-01**: System extracts structured facts from agent input via LLM (Extract step)
- [ ] **PIPE-02**: System constructs Zettelkasten note with content, context, keywords, tags, embedding, and visibility (Construct step)
- [ ] **PIPE-03**: System retrieves similar existing memories to compare against (Retrieve step)
- [ ] **PIPE-04**: System decides ADD / UPDATE / DELETE / NOOP based on comparison (Decide step)
- [ ] **PIPE-05**: System auto-links new memory to related existing memories (Link step)
- [ ] **PIPE-06**: System updates linked notes' context when new related memories arrive (Evolve step)

### ACT-R Activation

- [ ] **ACT-01**: System scores memories using ACT-R base-level activation from access history
- [ ] **ACT-02**: System applies spreading activation using query-memory similarity with configurable context weight
- [ ] **ACT-03**: System adds stochastic noise for natural recall variation (configurable σ, default 1.2)
- [ ] **ACT-04**: System tracks access timestamps per memory for activation calculation
- [ ] **ACT-05**: Activation scoring replaces flat cosine similarity as primary retrieval ranking

### Forgetting & Decay

- [ ] **FORGET-01**: Memories decay over time following Ebbinghaus forgetting curves with adaptive half-life
- [ ] **FORGET-02**: Successful retrieval reinforces a memory (increases half-life)
- [ ] **FORGET-03**: Memories below activation threshold become pruning candidates
- [ ] **FORGET-04**: User can pin memories to exempt them from decay
- [ ] **FORGET-05**: Hourly decay sweep recalculates activation scores system-wide

### Note Linking

- [ ] **LINK-01**: New memories auto-link to related existing memories at write time
- [ ] **LINK-02**: Search results include 1-hop linked notes for expanded context
- [ ] **LINK-03**: Links are bidirectional
- [ ] **LINK-04**: Linked notes evolve (context fields update when related memories change)
- [ ] **LINK-05**: Links use JSON adjacency list (no external graph database required)

### Working Memory

- [ ] **WM-01**: Each agent session has in-process working memory (L1) with activation scoring
- [ ] **WM-02**: On session end, high-activation working memories promote to persistent store (L2)
- [ ] **WM-03**: Low-activation working memories are discarded at session end

### Access Control & Visibility

- [ ] **VIS-01**: Two-axis access model: domain (relevance routing) + visibility (permission gating)
- [ ] **VIS-02**: Four visibility levels: open (all agents), scoped (same-domain), private (owning agent), user-only (human only)
- [ ] **VIS-03**: User can set domain-level visibility rules with longest-prefix matching
- [ ] **VIS-04**: Read pipeline applies visibility gate before scoring (unauthorized memories never appear)
- [ ] **VIS-05**: Per-agent memory profiles configurable by agent ID

### Multi-Agent

- [ ] **AGENT-01**: Multiple agents share persistent memory (L2) with visibility-scoped access
- [ ] **AGENT-02**: Cross-agent sync via pub/sub on memory writes (Redis) or polling (SQLite)
- [ ] **AGENT-03**: Event-based cache invalidation (refresh on next query, not every write)
- [ ] **AGENT-04**: Transactive memory index routes queries to the most relevant memory scope
- [ ] **AGENT-05**: Every memory tracks which agent created it (provenance)

### Consolidation

- [ ] **CONSOL-01**: Daily consolidation clusters related memories and generates summaries
- [ ] **CONSOL-02**: Consolidation prunes redundant memories after summarization
- [ ] **CONSOL-03**: Consolidation detects conflicting memories (compatible / contradictory / subsumes / ambiguous)
- [ ] **CONSOL-04**: Consolidation distills MEMORY.md from consolidated knowledge
- [ ] **CONSOL-05**: Original memories preserved (consolidation is never destructive)
- [ ] **CONSOL-06**: Contradictory conflicts require user resolution; compatible conflicts auto-resolve

### Filesystem Sync

- [ ] **SYNC-01**: Memories serialize to ~/clawd/memory/ as human-readable files
- [ ] **SYNC-02**: Changes to filesystem files propagate back to the memory system
- [ ] **SYNC-03**: Filesystem includes memory content, metadata, and link structure

### Plugin Integration

- [ ] **PLUG-01**: System registers as OpenClaw `kind: "memory"` plugin, replacing memory-core
- [ ] **PLUG-02**: `before_agent_start` hook injects visibility-filtered memories into agent context automatically
- [ ] **PLUG-03**: `session_end` hook promotes L1 working memories to L2
- [ ] **PLUG-04**: `message_received` and `after_tool_call` hooks capture episodic memories
- [ ] **PLUG-05**: `gateway_start` / `gateway_stop` hooks manage daemon lifecycle
- [ ] **PLUG-06**: Agent tools: memory.write, memory.query, memory.forget, memory.pin, memory.set_visibility
- [ ] **PLUG-07**: Agent tools: memory.get_context, memory.consolidate, memory.stats, memory.link, memory.search_agents
- [ ] **PLUG-08**: Memory metadata (timestamps, tags, source agent) on every stored memory

### CLI

- [ ] **CLI-01**: CLI command: `stats` — memory counts, storage usage, activation distribution
- [ ] **CLI-02**: CLI command: `export` — JSON dump of all memories with metadata
- [ ] **CLI-03**: CLI command: `consolidate` — trigger manual consolidation
- [ ] **CLI-04**: CLI command: `conflicts` — list detected memory conflicts

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Knowledge Commons (L3)

- **KC-01**: Team-shared domain knowledge store with role-scoped read access
- **KC-02**: Skill library with success/failure tracking
- **KC-03**: Team state blackboard (pub/sub with conflict resolution)
- **KC-04**: Orchestrator-gated writes with user approval for promotion
- **KC-05**: Weekly knowledge promotion pipeline (user shared → team commons)
- **KC-06**: HTTP routes for monitoring dashboard

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Federated cross-VPS knowledge sharing | Architecture supports it but not building now |
| Custom embedding model fine-tuning | Use existing models as-is; maintenance burden outweighs benefit |
| Web UI for memory browsing | Filesystem sync provides inspectability; no dashboard needed |
| Emotional salience scoring | No validated approach; open research question |
| Agent self-editing memory (Letta-style) | Fragile with non-OpenAI models; 90% failure rates reported |
| Real-time memory streaming to agents | Creates noise; event-based cache invalidation is sufficient |
| Multi-modal memory (images/audio/video) | Text-only with metadata references to external files |
| Automatic cross-user knowledge sharing | Privacy risk; user-approved promotion only (v2) |

## Traceability

Which phases cover which requirements. Updated by create-roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | Phase 1 | Complete |
| STORE-02 | Phase 1 | Complete |
| STORE-03 | Phase 1 | Complete |
| STORE-04 | Phase 1 | Complete |
| STORE-05 | Phase 1 | Complete |
| STORE-06 | Phase 1 | Complete |
| STORE-07 | Phase 1 | Complete |
| SEARCH-01 | Phase 2 | Complete |
| SEARCH-02 | Phase 2 | Complete |
| SEARCH-03 | Phase 3 | Pending |
| SEARCH-04 | Phase 2 | Complete |
| PIPE-01 | Phase 2 | Complete |
| PIPE-02 | Phase 2 | Complete |
| PIPE-03 | Phase 2 | Complete |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| PIPE-06 | Phase 2 | Complete |
| ACT-01 | Phase 3 | Pending |
| ACT-02 | Phase 3 | Pending |
| ACT-03 | Phase 3 | Pending |
| ACT-04 | Phase 3 | Pending |
| ACT-05 | Phase 3 | Pending |
| FORGET-01 | Phase 3 | Pending |
| FORGET-02 | Phase 3 | Pending |
| FORGET-03 | Phase 3 | Pending |
| FORGET-04 | Phase 3 | Pending |
| FORGET-05 | Phase 5 | Pending |
| LINK-01 | Phase 2 | Complete |
| LINK-02 | Phase 2 | Complete |
| LINK-03 | Phase 2 | Complete |
| LINK-04 | Phase 2 | Complete |
| LINK-05 | Phase 2 | Complete |
| WM-01 | Phase 3 | Pending |
| WM-02 | Phase 3 | Pending |
| WM-03 | Phase 3 | Pending |
| VIS-01 | Phase 4 | Pending |
| VIS-02 | Phase 4 | Pending |
| VIS-03 | Phase 4 | Pending |
| VIS-04 | Phase 4 | Pending |
| VIS-05 | Phase 4 | Pending |
| AGENT-01 | Phase 4 | Pending |
| AGENT-02 | Phase 4 | Pending |
| AGENT-03 | Phase 4 | Pending |
| AGENT-04 | Phase 4 | Pending |
| AGENT-05 | Phase 4 | Pending |
| CONSOL-01 | Phase 5 | Pending |
| CONSOL-02 | Phase 5 | Pending |
| CONSOL-03 | Phase 5 | Pending |
| CONSOL-04 | Phase 5 | Pending |
| CONSOL-05 | Phase 5 | Pending |
| CONSOL-06 | Phase 5 | Pending |
| SYNC-01 | Phase 4 | Pending |
| SYNC-02 | Phase 4 | Pending |
| SYNC-03 | Phase 4 | Pending |
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 3 | Pending |
| PLUG-03 | Phase 3 | Pending |
| PLUG-04 | Phase 2 | Complete |
| PLUG-05 | Phase 1 | Complete |
| PLUG-06 | Phase 2 | Complete |
| PLUG-07 | Phase 4 | Pending |
| PLUG-08 | Phase 1 | Complete |
| CLI-01 | Phase 5 | Pending |
| CLI-02 | Phase 5 | Pending |
| CLI-03 | Phase 5 | Pending |
| CLI-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 66 total
- Mapped to phases: 66
- Unmapped: 0

---
*Requirements defined: 2026-02-13*
*Last updated: 2026-02-14 after roadmap creation*
