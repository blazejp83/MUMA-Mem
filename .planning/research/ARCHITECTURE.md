# MUMA-Mem Architecture Research

> Research date: 2026-02-13
> Scope: Production AI memory system architecture patterns, applied to MUMA-Mem plugin for OpenClaw
> Companion to: STACK.md (technology selections), PROJECT.md (requirements)

---

## System Overview

```
                           OpenClaw Gateway
                     ┌──────────────────────────┐
                     │  before_agent_start       │
                     │  message_received         │
                     │  after_tool_call          │  Hooks
                     │  session_end              │
                     │  gateway_start/stop       │
                     └───────────┬──────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │        MUMA-Mem Plugin (L5)          │
              │  ┌─────────┐ ┌─────┐ ┌──────────┐   │
              │  │  Tools  │ │ CLI │ │HTTP Routes│   │
              │  └────┬────┘ └──┬──┘ └────┬─────┘   │
              └───────┼─────────┼─────────┼──────────┘
                      │         │         │
    ┌─────────────────┼─────────┼─────────┼────────────────┐
    │                 Memory Engine (core)                   │
    │                                                       │
    │  ┌──────────────────────────────────────────────┐     │
    │  │  L1: Agent Local Working Memory              │     │
    │  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  │     │
    │  │  │Activation │  │ Session   │  │ Promote  │  │     │
    │  │  │Calculator │  │ Scratchpad│  │ Gate     │  │     │
    │  │  └──────────┘  └───────────┘  └──────────┘  │     │
    │  └──────────────────────┬───────────────────────┘     │
    │                         │ promote                      │
    │  ┌──────────────────────▼───────────────────────┐     │
    │  │  L2: User Shared Memory (Zettelkasten)       │     │
    │  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  │     │
    │  │  │  Write    │  │ Read      │  │ Link     │  │     │
    │  │  │  Pipeline │  │ Pipeline  │  │ Engine   │  │     │
    │  │  └──────────┘  └───────────┘  └──────────┘  │     │
    │  └──────────────────────┬───────────────────────┘     │
    │                         │ promote                      │
    │  ┌──────────────────────▼───────────────────────┐     │
    │  │  L3: Knowledge Commons                       │     │
    │  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  │     │
    │  │  │ Skill     │  │ Team      │  │Transactive│ │     │
    │  │  │ Library   │  │ Blackboard│  │ Index    │  │     │
    │  │  └──────────┘  └───────────┘  └──────────┘  │     │
    │  └──────────────────────────────────────────────┘     │
    │                                                       │
    │  ┌──────────────────────────────────────────────┐     │
    │  │  L4: Management Daemon                       │     │
    │  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  │     │
    │  │  │ Decay     │  │ Sleep     │  │ Sync     │  │     │
    │  │  │ Sweep     │  │ Cycle     │  │ Pub/Sub  │  │     │
    │  │  └──────────┘  └───────────┘  └──────────┘  │     │
    │  └──────────────────────────────────────────────┘     │
    │                                                       │
    │  ┌──────────────────────────────────────────────┐     │
    │  │  Infrastructure                              │     │
    │  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  │     │
    │  │  │ Storage   │  │ Embedding │  │ LLM      │  │     │
    │  │  │ Adapters  │  │ Pipeline  │  │ Provider │  │     │
    │  │  └──────────┘  └───────────┘  └──────────┘  │     │
    │  └──────────────────────────────────────────────┘     │
    └───────────────────────────────────────────────────────┘
                      │             │
           ┌──────────┴──┐    ┌─────┴────┐
           │ Redis Stack │    │  SQLite   │
           │ (primary)   │    │ (fallback)│
           │ - Hashes    │    │ - FTS5    │
           │ - RediSearch │    │ - vec0   │
           │ - Pub/Sub   │    │ - WAL    │
           │ - Streams   │    │          │
           └─────────────┘    └──────────┘
```

---

## Component Responsibilities

| Component | Layer | Responsibility | Latency Budget | Dependencies |
|-----------|-------|---------------|----------------|--------------|
| **ActivationCalculator** | L1 | Compute ACT-R base-level + spreading activation for each memory | <5ms | In-memory access log |
| **SessionScratchpad** | L1 | Hold ephemeral working memory for current agent session | <1ms | Map in process memory |
| **PromoteGate** | L1 | Decide which L1 memories survive session-end for L2 promotion | <10ms | ActivationCalculator |
| **WritePipeline** | L2 | Extract facts, construct notes, deduplicate, decide action, link | 500ms-2s (async) | LLM provider, EmbeddingPipeline, StorageAdapter |
| **ReadPipeline** | L2 | Visibility gate, activation scoring, top-k retrieval, link expansion | <150ms | StorageAdapter, ActivationCalculator |
| **LinkEngine** | L2 | Manage bidirectional Zettelkasten links between notes | <20ms | StorageAdapter |
| **SkillLibrary** | L3 | Track success/failure of agent skills, serve proven patterns | <50ms | StorageAdapter |
| **TeamBlackboard** | L3 | Shared mutable state with conflict resolution | <30ms | Redis pub/sub or polling |
| **TransactiveIndex** | L3 | Route queries to agents with domain expertise | <20ms | StorageAdapter |
| **DecaySweep** | L4 | Hourly: recalculate activation, mark pruning candidates | Background | BullMQ, StorageAdapter |
| **SleepCycle** | L4 | Daily: cluster, summarize, prune, distill | Background | BullMQ, LLM provider |
| **SyncBus** | L4 | Real-time cross-agent memory event propagation | <10ms | Redis pub/sub or mitt (in-process) |
| **StorageAdapter** | Infra | Abstract interface over Redis (primary) and SQLite (fallback) | <10ms (Redis), <30ms (SQLite) | redis, better-sqlite3 |
| **EmbeddingPipeline** | Infra | Generate, cache, and manage vector embeddings | <15ms cached, <50ms uncached | @huggingface/transformers or remote |
| **LLMProvider** | Infra | Abstraction for LLM calls used in write pipeline and consolidation | 200ms-2s | Configurable (OpenAI, Anthropic, Ollama) |
| **PluginShell** | L5 | OpenClaw plugin entry point, hook registration, tool/CLI/route wiring | Startup only | openclaw/plugin-sdk |

---

## Recommended Project Structure

```
promem/
├── package.json                    # "type": "module", openclaw.plugin.json reference
├── openclaw.plugin.json            # Plugin manifest: id, configSchema, uiHints
├── tsconfig.json                   # module: "NodeNext", target: "ES2024"
├── tsdown.config.ts                # ESM output, .d.ts generation
├── vitest.config.ts                # Test configuration
├── src/
│   ├── index.ts                    # Public API: createPlugin(), MemoryEngine class
│   ├── plugin.ts                   # OpenClaw plugin entry: register(api) function
│   │
│   ├── config/
│   │   ├── schema.ts               # Zod schemas for all configuration
│   │   ├── defaults.ts             # Default values, env var overrides
│   │   └── types.ts                # Inferred TypeScript types from Zod schemas
│   │
│   ├── engine/
│   │   ├── memory-engine.ts        # Top-level orchestrator: ties layers together
│   │   ├── lifecycle.ts            # Start/stop/health-check coordination
│   │   └── context-builder.ts      # Assembles memory context for agent injection
│   │
│   ├── l1-working/
│   │   ├── scratchpad.ts           # In-memory Map<memoryId, WorkingMemory>
│   │   ├── activation.ts           # ACT-R activation calculator
│   │   ├── noise.ts                # Gaussian noise generator
│   │   └── promote.ts              # Session-end promotion logic
│   │
│   ├── l2-shared/
│   │   ├── note.ts                 # Zettelkasten note data structure
│   │   ├── write-pipeline.ts       # Extract -> Construct -> Retrieve -> Decide -> Link -> Evolve
│   │   ├── read-pipeline.ts        # Visibility -> Score -> TopK -> Expand
│   │   ├── link-engine.ts          # Bidirectional link management
│   │   ├── visibility.ts           # Domain + visibility axis filtering
│   │   └── domain.ts               # Longest-prefix domain matching
│   │
│   ├── l3-commons/
│   │   ├── skill-library.ts        # Success/failure tracking per skill
│   │   ├── blackboard.ts           # Team shared state with conflict resolution
│   │   └── transactive-index.ts    # "Who knows what" routing
│   │
│   ├── l4-daemon/
│   │   ├── decay-sweep.ts          # BullMQ repeatable job: hourly activation recalc
│   │   ├── sleep-cycle.ts          # BullMQ repeatable job: daily consolidation
│   │   ├── promotion-pipeline.ts   # Weekly L2->L3 knowledge promotion
│   │   └── sync-bus.ts             # Redis pub/sub or in-process event bus
│   │
│   ├── l5-plugin/
│   │   ├── hooks.ts                # All OpenClaw hook handlers
│   │   ├── tools.ts                # Agent tool definitions (memory.write, memory.query, etc.)
│   │   ├── cli.ts                  # CLI subcommands (stats, export, consolidate, conflicts)
│   │   ├── routes.ts               # HTTP monitoring endpoints
│   │   └── service.ts              # Background service registration (start/stop)
│   │
│   ├── storage/
│   │   ├── adapter.ts              # StorageAdapter interface definition
│   │   ├── factory.ts              # Create adapter based on config (Redis or SQLite)
│   │   ├── redis/
│   │   │   ├── client.ts           # Redis connection management
│   │   │   ├── memory-store.ts     # CRUD operations on Redis hashes + RediSearch
│   │   │   ├── vector-index.ts     # HNSW index creation and KNN queries
│   │   │   ├── pubsub.ts           # Pub/sub channel management
│   │   │   └── migrations.ts       # Index schema versioning
│   │   └── sqlite/
│   │       ├── client.ts           # better-sqlite3 connection, WAL mode
│   │       ├── memory-store.ts     # CRUD operations on SQLite tables
│   │       ├── vector-index.ts     # sqlite-vec virtual table queries
│   │       ├── fts.ts              # FTS5 full-text search
│   │       └── migrations.ts       # Schema migrations
│   │
│   ├── embeddings/
│   │   ├── provider.ts             # EmbeddingProvider interface
│   │   ├── local.ts                # @huggingface/transformers (all-MiniLM-L6-v2)
│   │   ├── remote.ts              # Remote API adapter (OpenAI, etc.)
│   │   └── cache.ts                # Content-hash -> embedding cache (Redis or Map)
│   │
│   ├── llm/
│   │   ├── provider.ts             # LLMProvider interface for write pipeline / consolidation
│   │   ├── prompts.ts              # All LLM prompts: fact extraction, action decision, summarization
│   │   └── parser.ts               # Parse LLM JSON responses with fallback
│   │
│   └── types/
│       ├── memory.ts               # Core memory types: Note, WorkingMemory, ActivationScore
│       ├── events.ts               # Event types for pub/sub: MemoryCreated, MemoryUpdated, etc.
│       ├── config.ts                # Re-export config types for external consumers
│       └── plugin.ts               # OpenClaw-specific types (hook context, tool params)
│
├── test/
│   ├── unit/                       # Fast isolated tests per module
│   │   ├── l1-working/
│   │   ├── l2-shared/
│   │   ├── storage/
│   │   └── embeddings/
│   ├── integration/                # Tests requiring Redis/SQLite
│   │   ├── redis-store.test.ts
│   │   ├── sqlite-store.test.ts
│   │   └── write-pipeline.test.ts
│   ├── e2e/                        # Full plugin lifecycle tests
│   │   └── plugin-lifecycle.test.ts
│   └── fixtures/                   # Test data, mock configs
│       ├── memories.ts
│       └── configs.ts
│
└── dist/                           # Build output (gitignored)
```

### Module Boundary Rules

1. **Layer directories (l1-l5) never import from each other directly.** All cross-layer communication goes through `engine/memory-engine.ts` or events via `l4-daemon/sync-bus.ts`.

2. **Storage modules expose only the `StorageAdapter` interface.** No Redis or SQLite types leak into layer code. The `storage/adapter.ts` interface is the contract.

3. **Embedding and LLM providers are injected via config.** Layer code calls `embeddingProvider.embed(text)` and `llmProvider.complete(prompt)` without knowing the implementation.

4. **L5 plugin code depends on all layers but nothing depends on L5.** The plugin shell is the outermost ring. If you remove L5, the memory engine still works as a library.

5. **Types directory is import-only.** No logic, no side effects. Types flow outward.

---

## Architectural Patterns

### Pattern 1: Storage Adapter (Strategy Pattern)

Learned from Mem0's factory pattern and Letta's swappable archival backends. The key insight: define the contract as a narrow interface, not a base class.

```typescript
// storage/adapter.ts
export interface StorageAdapter {
  // Core CRUD
  get(id: string): Promise<Note | null>;
  set(note: Note): Promise<void>;
  delete(id: string): Promise<boolean>;

  // Vector search
  searchSimilar(embedding: Float32Array, opts: SearchOpts): Promise<ScoredNote[]>;

  // Full-text search
  searchText(query: string, opts: SearchOpts): Promise<ScoredNote[]>;

  // Batch operations (for daemon)
  listByActivation(threshold: number, limit: number): Promise<Note[]>;
  batchUpdate(updates: NoteUpdate[]): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthy(): Promise<boolean>;
}

export interface SearchOpts {
  userId: string;
  agentId?: string;
  domain?: string;
  visibility?: VisibilityLevel[];
  topK: number;
  minScore?: number;
}
```

**Why this shape:** Redis and SQLite have fundamentally different query models. Redis uses FT.SEARCH with a query language; SQLite uses SQL with virtual tables. The adapter hides this. Both return `ScoredNote[]` -- the layer above never knows which backend served the result.

**Fallback strategy:** The `factory.ts` tries Redis first. If the connection fails, it falls back to SQLite with a logged warning. This is a startup-time decision, not per-request. Switching backends mid-session risks consistency issues.

### Pattern 2: Embedding Pipeline with Content-Hash Cache

Learned from LangChain's `CacheBackedEmbeddings` and Redis's embedding cache patterns. The critical optimization for the <200ms latency budget.

```typescript
// embeddings/cache.ts
export class EmbeddingCache {
  constructor(
    private provider: EmbeddingProvider,
    private store: Map<string, Float32Array> | RedisEmbeddingCache,
    private namespace: string  // e.g. "minilm-384" to avoid collisions across models
  ) {}

  async embed(text: string): Promise<Float32Array> {
    const key = `${this.namespace}:${contentHash(text)}`;

    const cached = await this.store.get(key);
    if (cached) return cached;

    const embedding = await this.provider.embed(text);
    await this.store.set(key, embedding);
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = new Array(texts.length);
    const uncached: { index: number; text: string }[] = [];

    // Check cache first
    for (let i = 0; i < texts.length; i++) {
      const key = `${this.namespace}:${contentHash(texts[i])}`;
      const cached = await this.store.get(key);
      if (cached) {
        results[i] = cached;
      } else {
        uncached.push({ index: i, text: texts[i] });
      }
    }

    // Batch-embed uncached items
    if (uncached.length > 0) {
      const newEmbeddings = await this.provider.embedBatch(uncached.map(u => u.text));
      for (let i = 0; i < uncached.length; i++) {
        const key = `${this.namespace}:${contentHash(uncached[i].text)}`;
        results[uncached[i].index] = newEmbeddings[i];
        await this.store.set(key, newEmbeddings[i]);
      }
    }

    return results;
  }
}

function contentHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}
```

**Latency impact:** Uncached local embedding takes approximately 5-15ms. Cache hit on Redis is sub-1ms. Cache hit on in-memory Map is sub-0.1ms. Since the read pipeline (the hot path) queries with the same user message text repeatedly across agents, cache hit rates should be high.

### Pattern 3: ACT-R Activation Scoring

Derived from Anderson et al. The base-level activation equation models frequency and recency of memory access using a power-law decay.

```typescript
// l1-working/activation.ts

/**
 * ACT-R Base-Level Activation
 *
 * Exact equation:  B_i = ln( sum_{j=1}^{n} t_j^{-d} )
 *
 * Where:
 *   B_i = base-level activation of chunk i
 *   n   = number of times chunk i has been accessed
 *   t_j = time (seconds) since the j-th access
 *   d   = decay parameter (standard: 0.5)
 *
 * Optimized approximation (Petrov 2006):
 *   B_i = ln(n / (1 - d)) - d * ln(L)
 *
 * Where:
 *   n = total access count
 *   L = lifetime of chunk (seconds since creation)
 *   d = decay parameter
 *
 * The approximation avoids storing the full access history.
 * We use a hybrid: exact for recent K accesses, approximation
 * for older history beyond the window.
 */

const DECAY_PARAM = 0.5;          // Standard ACT-R value
const RECENT_WINDOW = 10;          // Track last 10 accesses exactly
const NOISE_SIGMA = 1.2;           // Gaussian noise standard deviation
const CONTEXT_WEIGHT = 11.0;       // Default spreading activation weight

export interface AccessLog {
  timestamps: number[];   // Last RECENT_WINDOW access times (epoch ms)
  totalCount: number;     // Total lifetime access count
  createdAt: number;      // Epoch ms of first creation
}

export function baseActivation(log: AccessLog, now: number): number {
  const recentCount = log.timestamps.length;
  const olderCount = log.totalCount - recentCount;

  // Exact computation for recent accesses
  let recentSum = 0;
  for (const ts of log.timestamps) {
    const elapsed = Math.max((now - ts) / 1000, 0.001); // seconds, floor at 1ms
    recentSum += Math.pow(elapsed, -DECAY_PARAM);
  }

  // Approximation for older accesses (Petrov 2006)
  let olderContribution = 0;
  if (olderCount > 0 && recentCount > 0) {
    const oldestRecent = log.timestamps[0]; // timestamps sorted ascending
    const lifetimeBefore = Math.max((oldestRecent - log.createdAt) / 1000, 1);
    olderContribution = (olderCount / (1 - DECAY_PARAM))
                        * Math.pow(lifetimeBefore, -DECAY_PARAM);
  }

  return Math.log(recentSum + olderContribution);
}

export function spreadingActivation(
  querySimilarity: number,   // cosine similarity [0, 1]
  weight: number = CONTEXT_WEIGHT
): number {
  return weight * querySimilarity;
}

export function totalActivation(
  log: AccessLog,
  querySimilarity: number,
  now: number
): number {
  const base = baseActivation(log, now);
  const spread = spreadingActivation(querySimilarity);
  const noise = gaussianNoise(NOISE_SIGMA);
  return base + spread + noise;
}

function gaussianNoise(sigma: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Probability of successful retrieval (ACT-R retrieval threshold)
 * P_i = 1 / (1 + e^((tau - A_i) / s))
 */
export function retrievalProbability(
  activation: number,
  threshold: number,     // tau: retrieval threshold
  sensitivity: number    // s: noise sensitivity
): number {
  return 1 / (1 + Math.exp((threshold - activation) / sensitivity));
}
```

**Why hybrid exact+approximate:** The exact formula requires storing every access timestamp, which is unbounded. Production systems (both ACT-R implementations and Mem0) bound the history. The hybrid keeps the last 10 timestamps for accuracy on recent items while using the Petrov (2006) closed-form approximation for older history. This bounds memory usage to O(K) per memory item where K=10.

### Pattern 4: Write Pipeline (Mem0-Inspired)

Adapted from Mem0's two-phase (extraction + update) pipeline with Zettelkasten linking added. The key insight from Mem0: use the LLM to decide actions rather than naively appending.

```
Write Pipeline Stages:

  Message ──► Extract ──► Construct ──► Retrieve ──► Decide ──► Link ──► Evolve
    │            │            │            │            │          │         │
    │         LLM call     Build note   Vector      LLM call   Find     Update
    │         extracts     with meta    search for  determines  related  activation
    │         facts from   context,     similar     ADD/       notes,   counters,
    │         conversation tags,        existing    UPDATE/    create   trigger
    │                      visibility   memories    DELETE/    bidi     sync event
    │                      domain                   NOOP      links
    │
    └──► If infer=false, skip Extract/Decide, directly store raw note
```

**Critical difference from Mem0:** Mem0 operates on flat text memories. MUMA-Mem operates on Zettelkasten notes with structure (content, context, keywords, tags, links, visibility, domain). The Construct stage is where raw facts become structured notes. The Link stage is unique to MUMA-Mem.

### Pattern 5: Read Pipeline (Latency-Optimized)

The read pipeline is the critical hot path called from `before_agent_start`. It must complete within 150ms (leaving 50ms buffer in the 200ms budget for hook overhead and serialization).

```
Read Pipeline:

  Query ──► Embed ──► Gate ──► Score ──► TopK ──► Expand ──► Format
    │          │        │        │         │         │          │
    │       Cached    Visibility Combine  Select   Fetch     Build
    │       embedding filter by  base +   top K    1-hop     context
    │       lookup    domain +   spread   results  linked    string for
    │       (<1ms     visibility activate          notes     agent
    │       hit)      axes       + noise                     injection
    │
    │       <1ms      <5ms       <5ms     <1ms     <20ms     <5ms
    │                    │
    │                  Redis FT.SEARCH    (or SQLite vec0 KNN)
    │                  with filter:
    │                  <10ms for
    │                  10k vectors
    │
    Total target: <50ms typical, <150ms p95
```

**Visibility gating in storage layer:** The visibility filter is pushed down into the storage query (Redis TAG filter / SQLite WHERE clause) rather than post-filtering in application code. This is critical for performance -- filtering 10,000 memories in JS is slower than having Redis exclude them at the index level.

### Pattern 6: Background Processing (Sleep-Time Compute)

Learned from Letta's sleep-time architecture and SimpleMem's two-stage consolidation. The daemon runs as an OpenClaw background service registered via `api.registerService()`.

```typescript
// l4-daemon/decay-sweep.ts (BullMQ worker)
export function createDecaySweepWorker(queue: Queue, deps: DaemonDeps) {
  return new Worker(queue.name, async (job) => {
    const { storageAdapter, activationCalc } = deps;
    const batchSize = 500;
    let cursor = 0;

    // Scan all memories in batches
    while (true) {
      const batch = await storageAdapter.scan(cursor, batchSize);
      if (batch.items.length === 0) break;

      const updates: NoteUpdate[] = [];
      const now = Date.now();

      for (const note of batch.items) {
        const newActivation = activationCalc.baseActivation(note.accessLog, now);

        if (newActivation < PRUNE_THRESHOLD) {
          updates.push({ id: note.id, action: 'archive' });
        } else if (Math.abs(newActivation - note.cachedActivation) > RECALC_DELTA) {
          updates.push({
            id: note.id,
            action: 'update',
            cachedActivation: newActivation
          });
        }
      }

      if (updates.length > 0) {
        await storageAdapter.batchUpdate(updates);
      }

      cursor = batch.nextCursor;
    }
  }, { connection: deps.redisConnection });
}
```

**Schedule topology:**
- Hourly: Decay sweep (recalculate cached activations, mark prune candidates)
- Daily: Sleep cycle (cluster related memories, summarize clusters, prune redundant, detect conflicts)
- Weekly: Knowledge promotion (L2 -> L3 for memories meeting team-relevance criteria)

### Pattern 7: Pub/Sub Sync Bus

Adapted from Redis pub/sub patterns for multi-agent coordination. The sync bus has two modes depending on the storage backend.

```typescript
// l4-daemon/sync-bus.ts
export interface SyncBus {
  publish(event: MemoryEvent): Promise<void>;
  subscribe(handler: (event: MemoryEvent) => void): Promise<void>;
  unsubscribe(): Promise<void>;
}

// Redis mode: real-time pub/sub
export class RedisSyncBus implements SyncBus {
  private subscriber: RedisClientType;

  async publish(event: MemoryEvent): Promise<void> {
    const channel = `memory:${event.userId}`;
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  async subscribe(handler: (event: MemoryEvent) => void): Promise<void> {
    this.subscriber = this.publisher.duplicate();
    await this.subscriber.subscribe(`memory:*`, (message, channel) => {
      handler(JSON.parse(message));
    });
  }
}

// SQLite mode: in-process event bus (single-user, polling for external)
export class LocalSyncBus implements SyncBus {
  private emitter = mitt<{ memory: MemoryEvent }>();

  async publish(event: MemoryEvent): Promise<void> {
    this.emitter.emit('memory', event);
  }

  async subscribe(handler: (event: MemoryEvent) => void): Promise<void> {
    this.emitter.on('memory', handler);
  }
}
```

**Degraded mode (SQLite):** When running without Redis, cross-agent sync becomes eventual consistency via polling. The `LocalSyncBus` handles intra-process events immediately, but external agents (separate processes) must poll the SQLite database. Polling interval: 5 seconds. This is acceptable for single-user scenarios where L3 team features are disabled.

---

## Data Flow Diagrams

### Write Flow (message_received / after_tool_call hook)

```
User Message
     │
     ▼
┌─────────────┐
│ Hook:        │
│ message_     │ 1. Capture message as episodic memory
│ received     │    (always, no LLM call)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ L1:          │ 2. Store in session scratchpad
│ Scratchpad   │    with initial activation = 0 + noise
│ .add()       │
└──────┬──────┘
       │
       ▼  (async, off critical path)
┌─────────────┐
│ L2: Write   │ 3. Queue write pipeline job (BullMQ)
│ Pipeline     │    - Extract facts (LLM)
│ (queued)     │    - Construct Zettelkasten note
└──────┬──────┘    - Retrieve similar (vector search)
       │           - Decide action (LLM)
       ▼           - Link to related notes
┌─────────────┐    - Evolve existing notes if UPDATE
│ Storage      │
│ Adapter      │ 4. Persist to Redis/SQLite
│ .set()       │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Sync Bus     │ 5. Publish memory:created event
│ .publish()   │    Other agents invalidate caches
└─────────────┘
```

**Key design decision:** The write pipeline is asynchronous (queued via BullMQ) and NOT on the critical path. The user-facing response is not blocked by fact extraction or LLM calls. The L1 scratchpad stores the raw episodic memory immediately (sub-millisecond) so the current session has access. The structured L2 note appears asynchronously.

### Read Flow (before_agent_start hook)

```
Agent Session Start
     │
     ▼
┌─────────────────┐
│ Hook:            │ 1. Receive agent context
│ before_agent_    │    (userId, agentId, domain, session msg)
│ start            │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Context Builder  │ 2. Determine what to retrieve:
│                  │    - Agent profile (from config)
│                  │    - Recent message for query embedding
└──────┬──────────┘
       │
       ├──────────────────────┐
       │                      │
       ▼                      ▼
┌─────────────┐      ┌─────────────┐
│ L1:          │      │ L2: Read    │
│ Scratchpad   │      │ Pipeline    │  3. Parallel retrieval
│ .getActive() │      │ .query()    │
└──────┬──────┘      └──────┬──────┘
       │                      │
       │    ┌─────────────────┤
       │    │                 │
       │    ▼                 ▼
       │ ┌──────────┐  ┌──────────┐
       │ │Visibility │  │ Vector   │  4. Filter and score
       │ │Gate       │  │ Search   │
       │ └────┬─────┘  └────┬─────┘
       │      │              │
       │      └──────┬───────┘
       │             │
       │             ▼
       │      ┌──────────┐
       │      │Activation │  5. Score all candidates
       │      │Scoring    │     base + spread + noise
       │      └────┬─────┘
       │           │
       │           ▼
       │      ┌──────────┐
       │      │ Top-K     │  6. Select best K results
       │      │ Selection │
       │      └────┬─────┘
       │           │
       │           ▼
       │      ┌──────────┐
       │      │ Link      │  7. Expand 1-hop linked notes
       │      │ Expansion │
       │      └────┬─────┘
       │           │
       ├───────────┘
       │
       ▼
┌─────────────────┐
│ Context Builder  │ 8. Merge L1 + L2 results
│ .format()       │    Format as prependContext string
└──────┬──────────┘    (structured markdown)
       │
       ▼
  Return to OpenClaw
  (injected into agent context)
```

**Latency breakdown (target <200ms):**
| Stage | Target | Notes |
|-------|--------|-------|
| Hook dispatch | <5ms | OpenClaw internal |
| Context build | <2ms | Config lookup |
| L1 scratchpad | <1ms | In-memory Map |
| Embed query | <1ms | Cache hit expected (same message) |
| Visibility gate | <1ms | Pushed into storage query |
| Vector search | <15ms | Redis HNSW KNN, pre-built index |
| Activation scoring | <5ms | In-memory math over result set |
| Top-K selection | <1ms | Sort + slice |
| Link expansion | <20ms | 1 additional storage query per linked note (batched) |
| Format | <5ms | String concatenation |
| **Total** | **<56ms typical** | Well within 200ms budget |

### Consolidation Flow (Daily Sleep Cycle)

```
BullMQ Scheduled Job (daily, 3 AM)
     │
     ▼
┌─────────────────────┐
│ 1. Scan L2 notes    │  Fetch all notes with
│    by staleness     │  cachedActivation > archive_threshold
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 2. Cluster          │  Group notes by embedding similarity
│    related notes    │  (agglomerative clustering, threshold 0.8)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 3. Summarize        │  For each cluster > 3 notes:
│    clusters         │  LLM generates summary note
│    (LLM)           │  Links to source notes preserved
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 4. Prune            │  Remove notes that are:
│    redundant        │  - Fully subsumed by summary
│                     │  - Below prune_threshold activation
│                     │  - Older than max_age with no links
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 5. Detect           │  Find note pairs with high similarity
│    conflicts        │  but contradictory content (LLM check)
│    (LLM)           │  Flag for user review
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ 6. Distill          │  Generate MEMORY.md summary file
│    MEMORY.md        │  for filesystem sync
└─────────────────────┘
```

---

## State Management

### In-Process State (L1)

```
┌─────────────────────────────────────────────┐
│ MemoryEngine instance (singleton per gateway)│
│                                              │
│  sessions: Map<sessionId, SessionState>      │
│    └─► scratchpad: Map<memoryId, WorkingMem> │
│    └─► accessLog: Map<memoryId, AccessLog>   │
│    └─► lastQuery: string                     │
│                                              │
│  embeddingCache: Map<hash, Float32Array>     │
│    (also backed by Redis if available)       │
│                                              │
│  activationCache: Map<memoryId, number>      │
│    (invalidated on access, refreshed by      │
│     decay sweep)                             │
└─────────────────────────────────────────────┘
```

**Session lifecycle:**
1. `before_agent_start` -> create SessionState if not exists
2. `message_received` / `after_tool_call` -> update scratchpad, update access logs
3. `session_end` -> run PromoteGate, flush surviving memories to L2, destroy SessionState

**Memory pressure:** The scratchpad holds at most `maxWorkingMemory` items per session (default: 50). When full, the lowest-activation item is evicted. This mirrors ACT-R's limited capacity working memory.

### Persistent State (L2/L3)

All persistent state lives in the storage backend (Redis or SQLite). The application process holds no persistent state that would be lost on crash -- only caches and the L1 scratchpad (which is ephemeral by design).

**Redis key schema:**
```
memory:{userId}:{noteId}          # Hash: note content + metadata
memory:{userId}:{noteId}:links    # Set: linked note IDs
memory:{userId}:{noteId}:access   # List: last K access timestamps
memory:index:{userId}             # RediSearch index (auto)
memory:meta:{userId}:stats        # Hash: aggregate statistics
daemon:lock:{jobType}             # String: distributed lock for daemon jobs
sync:events:{userId}              # Pub/sub channel
```

**SQLite schema:**
```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  content TEXT NOT NULL,
  context TEXT,
  keywords TEXT,      -- JSON array
  tags TEXT,          -- JSON array
  domain TEXT,
  visibility TEXT DEFAULT 'open',
  cached_activation REAL DEFAULT 0,
  access_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE note_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_type TEXT DEFAULT 'related',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, target_id),
  FOREIGN KEY (source_id) REFERENCES notes(id),
  FOREIGN KEY (target_id) REFERENCES notes(id)
);

CREATE TABLE access_log (
  note_id TEXT NOT NULL,
  accessed_at INTEGER NOT NULL,
  agent_id TEXT,
  FOREIGN KEY (note_id) REFERENCES notes(id)
);

-- Keep only last RECENT_WINDOW entries via trigger
CREATE TRIGGER trim_access_log
AFTER INSERT ON access_log
BEGIN
  DELETE FROM access_log
  WHERE rowid IN (
    SELECT rowid FROM access_log
    WHERE note_id = NEW.note_id
    ORDER BY accessed_at DESC
    LIMIT -1 OFFSET 10
  );
END;

CREATE VIRTUAL TABLE vec_notes USING vec0(
  note_id TEXT PRIMARY KEY,
  embedding float[384]
);

CREATE VIRTUAL TABLE fts_notes USING fts5(
  content, context, keywords, tags,
  content='notes', content_rowid='rowid'
);

CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_domain ON notes(user_id, domain);
CREATE INDEX idx_notes_activation ON notes(user_id, cached_activation DESC);
```

---

## Scaling Considerations

| Dimension | Current Design | Scale Limit | Mitigation Strategy |
|-----------|---------------|-------------|---------------------|
| **Memory count per user** | Single Redis index per user | ~100K notes before HNSW rebuild cost rises | Partition index by domain; archive cold notes to SQLite |
| **Concurrent agents** | Shared L2 with per-agent L1 | Process memory for L1 scratchpads grows linearly | Cap maxWorkingMemory per session (default 50 items) |
| **Embedding throughput** | Local CPU inference | ~200 embeddings/sec on single core | Batch embedding in write pipeline; cache aggressively; optional remote provider for higher throughput |
| **Write pipeline (LLM calls)** | BullMQ job queue | LLM rate limits are the bottleneck | Queue with rate limiting and backoff; batch fact extraction across messages |
| **Daemon jobs** | BullMQ repeatable with distributed lock | Single worker per job type | Sufficient for single-gateway; add concurrency if multi-gateway |
| **Redis memory** | All notes + vectors in memory | ~1GB per 100K notes with 384-dim vectors | Archive cold notes; use Redis persistence (RDB+AOF) |
| **SQLite write contention** | WAL mode, single writer | Heavy concurrent writes may queue | Write pipeline is already queued (BullMQ); only one writer at a time |
| **Cross-agent sync** | Redis pub/sub per user channel | Thousands of agents on same user | Fan-out is O(subscribers); Redis handles this natively |
| **Plugin startup time** | Eager initialization | Embedding model download on first run (~23MB) | Pre-warm in gateway_start hook; lazy-load model on first embed call |
| **Context window pressure** | Formatted memory injection | Large memory sets bloat context | Hard cap on injected context tokens (configurable, default 2000 tokens) |

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | What To Do Instead |
|-------------|-------------|-------------------|
| **Synchronous LLM calls on read path** | LLM latency (200ms-2s) destroys <200ms budget. Mem0 does LLM calls on write but NOT on read. | All LLM calls are write-path only (extract, decide, summarize). Read path uses pre-computed embeddings and activation scores. |
| **Unbounded access history** | Storing every access timestamp per memory grows without bound, O(n) for activation calc. | Bounded window of K=10 recent accesses + Petrov approximation for older history. |
| **Post-filter visibility in application code** | Fetching 10K memories then filtering to 100 visible ones wastes bandwidth and latency. | Push visibility filters into storage queries (Redis TAG filters, SQLite WHERE clauses). |
| **Shared mutable state across async boundaries** | Node.js concurrency bugs when multiple hooks modify same data. | L1 scratchpad is per-session. L2+ writes go through queued pipeline. Sync bus for cross-agent coordination. |
| **Monolithic God class** | Single MemoryManager class with 2000+ lines. Mem0's Memory class is already pushing this boundary. | Split by layer (l1-working, l2-shared, etc.) with MemoryEngine as thin orchestrator. |
| **Tight coupling to Redis data structures** | Using Redis hashes/sets directly in layer code makes SQLite fallback impossible. | StorageAdapter interface hides all backend specifics. Layer code never sees Redis or SQLite types. |
| **Eager embedding model loading** | Loading 23MB ONNX model at import time blocks gateway startup. | Lazy initialization on first embed() call. Pre-warm optionally in gateway_start hook (background). |
| **Blocking worker threads for I/O** | Using worker_threads for Redis/SQLite calls (which are already async I/O). | Worker threads are only for CPU-bound work (embedding inference). I/O stays on main thread event loop. |
| **Over-linking in Zettelkasten** | Linking every note to every similar note creates noise, slows link expansion. | Link only notes above a similarity threshold (default 0.85) and cap outbound links per note (default 5). |
| **Real-time consolidation** | Running summarization on every write adds latency and LLM cost. | Consolidation is batched (daily sleep cycle). Only the write pipeline's Decide step happens per-write. |
| **Embedding dimension mismatch** | Assuming 384 dimensions everywhere when user might configure OpenAI (1536-dim). | Read dimension from config; validate on startup; store in index metadata; reject mismatched vectors. |
| **Ignoring Redis connection loss** | Crashing on Redis disconnect in production. | Graceful degradation: fall back to SQLite if Redis drops. Log warning. Attempt reconnection with exponential backoff. |

---

## Integration Points

### OpenClaw Plugin Lifecycle

```typescript
// plugin.ts - Entry point
import { PluginAPI } from "openclaw/plugin-sdk";

export default function register(api: PluginAPI) {
  const engine = new MemoryEngine(api.config);

  // Background service (L4 daemon)
  api.registerService({
    id: "muma-mem-daemon",
    start: () => engine.start(),
    stop: () => engine.stop(),
  });

  // Hooks (L5)
  api.hook("gateway_start", async () => {
    await engine.initialize();
  });

  api.hook("gateway_stop", async () => {
    await engine.shutdown();
  });

  api.hook("before_agent_start", async (ctx) => {
    const memories = await engine.getContext(ctx.userId, ctx.agentId, ctx.message);
    ctx.prependContext = memories.formatted;
  });

  api.hook("session_end", async (ctx) => {
    await engine.promoteSession(ctx.sessionId);
  });

  api.hook("message_received", async (ctx) => {
    await engine.captureEpisode(ctx.userId, ctx.agentId, ctx.message, "message");
  });

  api.hook("after_tool_call", async (ctx) => {
    await engine.captureEpisode(ctx.userId, ctx.agentId, ctx.toolResult, "tool_result");
  });

  // Agent tools (L5)
  api.registerTool({
    name: "memory_write",
    description: "Store a memory note with optional tags and visibility",
    parameters: { /* zod schema */ },
    execute: async (params) => engine.write(params),
  });

  api.registerTool({
    name: "memory_query",
    description: "Search memory for relevant information",
    parameters: { /* zod schema */ },
    execute: async (params) => engine.query(params),
  });

  // ... additional tools: memory_forget, memory_pin, memory_link, etc.

  // CLI subcommands (L5)
  api.registerCli(({ program }) => {
    program.command("memory")
      .command("stats").action(() => engine.stats());
    program.command("memory")
      .command("export").action((opts) => engine.export(opts));
    program.command("memory")
      .command("consolidate").action(() => engine.consolidateNow());
    program.command("memory")
      .command("conflicts").action(() => engine.showConflicts());
  }, { commands: ["memory"] });

  // HTTP monitoring routes (L5)
  api.registerGatewayMethod("memory.stats", async ({ respond }) => {
    respond(true, await engine.stats());
  });

  api.registerGatewayMethod("memory.health", async ({ respond }) => {
    respond(true, await engine.health());
  });
}
```

### Internal Module Boundaries

```
                    ┌─────────────────────────┐
                    │   plugin.ts (L5 shell)   │  Depends on: engine, tools, hooks
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │  engine/memory-engine.ts │  Depends on: l1, l2, l3, l4, config
                    │  (orchestrator)          │
                    └───────────┬─────────────┘
                                │
          ┌─────────┬───────────┼───────────┬──────────┐
          │         │           │           │          │
    ┌─────▼───┐ ┌───▼────┐ ┌───▼────┐ ┌────▼───┐ ┌────▼───┐
    │l1-working│ │l2-shared│ │l3-commons│ │l4-daemon│ │ config │
    └─────┬───┘ └───┬────┘ └───┬────┘ └────┬───┘ └────────┘
          │         │           │           │
          └─────────┴───────┬───┴───────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼───┐  ┌─────▼────┐  ┌─────▼──┐
        │ storage/ │  │embeddings/│  │  llm/  │
        │ adapter  │  │ provider  │  │provider│
        └─────────┘  └──────────┘  └────────┘
```

**Dependency rule:** Arrows point downward only. No upward or lateral dependencies between layer modules. The engine orchestrates; layers provide capabilities.

### External Service Boundaries

| Service | Required? | Connection Failure Strategy |
|---------|-----------|---------------------------|
| **Redis Stack 7.2+** | Optional (primary) | Fall back to SQLite. Log warning. Disable pub/sub, use polling. Disable L3 team features. |
| **SQLite** | Always available | Bundled via better-sqlite3. No external dependency. |
| **Embedding model** | Required (local default) | First call downloads model (~23MB). Cache on filesystem. If download fails, plugin enters degraded mode (no vector search, text-only). |
| **LLM provider** | Required for write pipeline | If unavailable, write pipeline queues jobs and retries. Episodic capture (raw storage) still works. Consolidation paused. |
| **OpenClaw Gateway** | Required | Plugin cannot function without host. Follows gateway lifecycle. |

---

## Key Insights from Production Systems

### From Mem0

- **Two-phase pipeline (extract then update) is the proven pattern.** Separating fact extraction from storage decisions enables intelligent deduplication and conflict resolution without blocking reads.
- **Session scoping (user_id + agent_id + run_id) is essential.** All storage operations must be filterable by these dimensions. MUMA-Mem adds domain and visibility as additional scoping axes.
- **History logging via SQLite is lightweight and valuable.** Tracking all mutations (ADD/UPDATE/DELETE) with before/after state enables debugging and conflict detection.
- **Factory pattern for providers works well.** Mem0 uses factories for LLMs, embedders, vector stores, graph stores, and rerankers. MUMA-Mem needs fewer (storage, embedding, LLM) but the same pattern applies.

### From Letta/MemGPT

- **Agent-managed memory via tools is more flexible than passive retrieval.** MemGPT's key insight is that agents themselves should decide what to remember. MUMA-Mem combines both: automatic injection (before_agent_start) for passive recall, plus explicit tools (memory.write, memory.query) for agent-directed memory management.
- **Sleep-time compute is the right model for consolidation.** Running expensive operations (summarization, conflict detection) during idle periods using a dedicated model avoids impacting interactive latency.
- **Core memory (persona + user) as editable context blocks is a clean UX pattern.** MUMA-Mem's agent profiles (agentMemory config) serve a similar role.

### From Zep/Graphiti

- **Temporal awareness is critical for contradiction handling.** Zep's bi-temporal model (event time vs. ingestion time) enables correct handling of conflicting facts. MUMA-Mem should track created_at and updated_at separately, and the write pipeline's Decide stage should consider temporal ordering.
- **Hybrid retrieval (vector + text + graph traversal) outperforms any single method.** MUMA-Mem implements vector search (primary) + FTS (secondary) + link expansion (graph-like). This covers semantic, keyword, and relational retrieval.
- **Sub-200ms retrieval is achievable with pre-built indexes and no LLM on read path.** Zep achieves this by avoiding LLM calls during retrieval entirely. The same principle is fundamental to MUMA-Mem's read pipeline design.

### From ACT-R Cognitive Architecture

- **Power-law decay matches real memory behavior.** The base-level activation equation B_i = ln(sum(t_j^-d)) correctly models both frequency and recency effects. More recent and more frequent accesses produce higher activation.
- **Bounded history with approximation is production-viable.** Keeping only the last K access timestamps and using the Petrov (2006) closed-form for older history keeps memory and compute bounded while maintaining accuracy.
- **Noise is a feature, not a bug.** The stochastic noise component prevents deterministic retrieval patterns that would create self-reinforcing memory loops. It ensures occasional retrieval of lower-activation memories, which is important for serendipitous recall.

---

## Sources

### HIGH Confidence (official documentation, research papers, verified source code)

- [Mem0 Paper: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) -- Arxiv paper describing the extraction + update pipeline architecture
- [Mem0 GitHub Repository](https://github.com/mem0ai/mem0) -- Source code for the universal memory layer
- [Mem0 Architecture Overview (DeepWiki)](https://deepwiki.com/mem0ai/mem0/1-overview) -- Detailed component analysis of Mem0 codebase
- [Mem0 Memory Operations (DeepWiki)](https://deepwiki.com/mem0ai/mem0/3.3-history-and-storage-management) -- Detailed pipeline flow analysis
- [Letta/MemGPT Documentation](https://docs.letta.com/concepts/memgpt/) -- Official docs on MemGPT memory architecture
- [Letta Memory Overview](https://docs.letta.com/guides/agents/memory/) -- Official guide to memory management in Letta
- [Letta Sleep-Time Compute](https://www.letta.com/blog/sleep-time-compute) -- Blog post on background memory consolidation architecture
- [Zep Paper: Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956) -- Arxiv paper on Graphiti's temporal knowledge graph
- [Graphiti GitHub Repository](https://github.com/getzep/graphiti) -- Source code for temporal knowledge graph engine
- [OpenClaw Plugin Documentation](https://docs.openclaw.ai/tools/plugin) -- Official plugin API reference
- [OpenClaw Extensions and Plugins (DeepWiki)](https://deepwiki.com/openclaw/openclaw/10-extensions-and-plugins) -- Detailed plugin architecture analysis
- [ACT-R Tutorial Unit 4](https://huxianyin.github.io/blog/2020/11/09/tutorialUnit4) -- Base-level activation equations and parameters
- [Petrov 2006: Computationally Efficient Approximation](http://alexpetrov.com/pub/iccm06/) -- Optimized ACT-R activation approximation
- [Redis Vector Search Documentation](https://redis.io/docs/latest/develop/ai/search-and-query/vectors/) -- Official HNSW vector search docs
- [Redis Pub/Sub Documentation](https://redis.io/docs/latest/develop/pubsub/) -- Official pub/sub pattern docs
- [Redis Embedding Cache Documentation](https://redis.io/docs/latest/develop/ai/redisvl/user_guide/embeddings_cache/) -- Official embedding cache pattern
- [LangChain.js Caching Embeddings](https://js.langchain.com/docs/how_to/caching_embeddings/) -- Content-hash based embedding cache pattern
- [Node.js Worker Threads Documentation](https://nodejs.org/api/worker_threads.html) -- Official Node.js worker threads API
- [BullMQ Documentation](https://docs.bullmq.io) -- Official job queue documentation
- [Bree Job Scheduler](https://github.com/breejs/bree) -- Worker-thread-based job scheduling pattern reference

### MEDIUM Confidence (well-known tech blogs, cross-referenced)

- [Mem0 Architecture Analysis (Medium)](https://medium.com/@parthshr370/from-chat-history-to-ai-memory-a-better-way-to-build-intelligent-agents-f30116b0c124) -- Third-party analysis of Mem0 internals
- [Agent Memory Blog (Letta)](https://www.letta.com/blog/agent-memory) -- Letta's perspective on agent memory design patterns
- [Zep Architecture (Emergent Mind)](https://www.emergentmind.com/topics/zep-a-temporal-knowledge-graph-architecture) -- Summary analysis of Zep paper
- [SimpleMem: 30x More Efficient Memory (Tekta.ai)](https://www.tekta.ai/ai-research-papers/simplemem-llm-agent-memory-2026) -- Two-stage memory consolidation approach
- [Zettelkasten MCP Server (GitHub)](https://github.com/entanglr/zettelkasten-mcp) -- MCP implementation of Zettelkasten method for AI
- [Redis Vector Search at Billion Scale](https://redis.io/blog/searching-1-billion-vectors-with-redis-8/) -- Performance benchmarks for Redis HNSW
- [VoltAgent Framework](https://github.com/VoltAgent/voltagent) -- TypeScript AI agent framework with lifecycle hooks pattern
- [ACT-R Approximations Comparison (Springer)](https://link.springer.com/article/10.1007/s42113-018-0015-3) -- Analysis of base-level activation approximation methods

### LOW Confidence (community sources, unverified claims)

- Embedding latency claims (5-15ms per embedding on CPU) -- varies significantly by hardware; not independently benchmarked
- Redis sub-100ms vector search at billion scale -- specific to Redis 8 benchmarks; real-world latency depends on hardware and index configuration
- Worker thread + SharedArrayBuffer 80% latency reduction -- claimed in Medium article; actual benefit depends heavily on workload characteristics
- OpenClaw hook latency overhead (<5ms) -- estimated from plugin architecture, not measured; actual overhead depends on number of registered hooks
- sqlite-vec KNN performance for <100K vectors -- approximate; the extension is alpha quality and performance may vary

---

*Last updated: 2026-02-13*
