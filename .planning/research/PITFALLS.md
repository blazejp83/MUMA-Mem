# PITFALLS.md -- Common Mistakes in AI Memory Systems

> Research compiled: 2026-02-13
> Scope: Multi-agent AI memory systems, with focus on MUMA-Mem architecture
> (layered L1-L5, ACT-R activation, Ebbinghaus forgetting, Zettelkasten linking,
> Redis/SQLite dual backend, configurable embeddings, <200ms retrieval target)

---

## Critical Pitfalls

### 1. Memory Accuracy Degrades Catastrophically Over Long Conversations

**What goes wrong:** Memory retrieval accuracy collapses as conversation length grows. Benchmarks show systems like Mem0 dropping from ~30% accuracy on medium conversations to under 3% on long ones. Best recall across all tested systems is only 43%, and update accuracy is below 26%.

**Why it happens:** Every stored snippet persists with equal weight indefinitely. There is no mechanism to distinguish stale information from current information. As memory volume grows, noise-to-signal ratio increases and disambiguation becomes harder. The system retrieves outdated preferences, conflicting information, or contextually inappropriate memories.

**How to avoid:**
- Implement time-decay (Ebbinghaus curves) as a first-class retrieval signal, not an afterthought
- Add explicit staleness detection: track when memories were last confirmed/contradicted
- Use recency-weighted scoring in combination with relevance scoring
- Set maximum memory pool sizes per layer with eviction policies
- Test retrieval accuracy at 10x, 100x, and 1000x expected memory volume

**Warning signs:** Retrieval latency growing linearly with memory count; users reporting the agent "remembering wrong things"; confidence scores clustering around the same value regardless of actual relevance.

**Phase to address:** Architecture (Phase 1). The scoring model must be designed before any memories are stored.

**Confidence:** HIGH -- supported by multiple benchmarks (Mem0, MemGPT, LangMem, OpenAI) and the LOCOMO evaluation framework.

---

### 2. Embedding Dimension Mismatch When Switching Providers

**What goes wrong:** Switching embedding models (e.g., OpenAI text-embedding-ada-002 at 1536d to a local model at 768d or 384d) causes silent retrieval failures or hard crashes. Existing vectors in the store become incompatible with new query vectors. ChromaDB, Qdrant, and other stores reject mismatched dimensions.

**Why it happens:** Embedding dimensions are baked into the vector index at creation time. Different providers produce different-dimensioned vectors. Many systems hardcode the dimension or rely on a default. Configuration changes propagate to new writes but not to existing data.

**How to avoid:**
- Store embedding model identifier and dimension alongside every vector
- Implement a migration system: detect dimension mismatch at startup, trigger re-embedding
- Support dual-index querying during migration (search old + new, merge results)
- Abstract embedding behind a provider interface that includes dimension metadata
- Add a startup health check that validates stored dimensions match configured model

**Warning signs:** Zero results returned after config change; cosine similarity scores all near zero; "dimension mismatch" errors in vector store operations.

**Phase to address:** Architecture (Phase 1). The embedding abstraction layer must handle model metadata from day one.

**Confidence:** HIGH -- documented in CrewAI #2464, Second-Me #157, LightRAG #2119, OpenAI community forums, and multiple Medium post-mortems.

---

### 3. Consolidation Destroys Critical Information

**What goes wrong:** Memory consolidation (summarization/compression of old memories) loses details that seem irrelevant at consolidation time but matter later. Over-aggressive pruning permanently destroys useful context. Summaries introduce hallucinated details or flatten nuance.

**Why it happens:** LLM-based summarization is lossy by nature. Consolidation algorithms cannot predict future relevance. Simple keyword extraction misses relational and contextual information. There is a gap between users' queries and the content in consolidated memory units.

**How to avoid:**
- Never delete original memories; mark them as archived/consolidated but keep raw data
- Use multi-level consolidation: raw -> summarized -> abstract, with ability to drill back down
- Test consolidation quality with retrieval benchmarks before and after
- Implement "consolidation auditing" -- log what was merged/removed, allow rollback
- Weight consolidation decisions using access patterns (ACT-R activation scores)
- Keep a "graveyard" of pruned memories that can be resurrected by relevance queries

**Warning signs:** Users saying "I told you this before"; retrieval returning vague summaries instead of specific facts; test suite accuracy dropping after consolidation runs.

**Phase to address:** L4 daemon design (Phase 2-3). But the raw-data-preservation architecture must be decided in Phase 1.

**Confidence:** HIGH -- identified as "the most sensitive and error-prone stage" in the Memory in the Age of AI Agents survey (arxiv 2512.13564), confirmed by Mem0 and MemGPT user complaints.

---

### 4. Multi-Agent Memory Poisoning via Shared Layers

**What goes wrong:** In a multi-agent system with shared memory (L2/L3 layers), one agent writes malicious, incorrect, or context-inappropriate data that other agents then consume and act on. A compromised or poorly-prompted agent can corrupt the shared knowledge base. Memory poisoning success rates can exceed 80% once an attacker understands the memory retrieval pattern.

**Why it happens:** Agents treat retrieved memories as trusted facts. Shared layers lack per-write validation or provenance tracking. There is no semantic analysis of whether a memory write is consistent with existing knowledge. Write access is granted without sufficient access control.

**How to avoid:**
- Implement write provenance: every memory records which agent wrote it, when, and why
- Add semantic validation on writes to shared layers (L2, L3): check for contradictions
- Use trust scores per agent; weight retrieved memories by source trustworthiness
- Require confirmation/consensus for writes to L3 (knowledge commons)
- Implement memory quarantine: new shared memories are unverified until corroborated
- Rate-limit writes to shared layers per agent

**Warning signs:** Sudden behavior changes across multiple agents; contradictory memories in shared layers; one agent's errors propagating to others; unexplained data in L3.

**Phase to address:** Architecture (Phase 1) for trust model; Implementation (Phase 2) for validation logic.

**Confidence:** HIGH -- Microsoft's Taxonomy of Failure Modes in Agentic AI (2025) identifies memory poisoning as a top-3 threat. Case study showed 40% baseline success rate increasing to 80%+ with targeted attacks.

---

### 5. SQLite Write Contention Under Multi-Agent Load

**What goes wrong:** Multiple agents writing memories simultaneously cause SQLITE_BUSY errors, "database is locked" failures, or silently dropped writes. With 100+ concurrent writers, throughput drops from 150k to 80k rows/second even in WAL mode. Checkpoint starvation causes the WAL file to grow without bound.

**Why it happens:** SQLite enforces a single-writer model even in WAL mode. Multi-agent systems generate concurrent writes from multiple sources. Node.js async operations can stack up write attempts faster than SQLite can serialize them. WAL checkpoints cannot complete while reads are active.

**How to avoid:**
- Use Redis for hot-path writes (L1 agent-local, high-frequency operations)
- Use SQLite only for cold storage, archival, and batch operations
- Implement a write queue that serializes SQLite writes through a single channel
- Set appropriate busy_timeout (5000ms+) and implement retry logic with exponential backoff
- Monitor WAL file size; trigger forced checkpoints during low-activity periods
- Use better-sqlite3 (synchronous, faster) rather than node-sqlite3 (async, slower for writes)
- Consider PRAGMA journal_mode=WAL, PRAGMA synchronous=NORMAL, PRAGMA busy_timeout=5000

**Warning signs:** Intermittent "database is locked" errors in logs; WAL file growing beyond 100MB; write latency spikes during multi-agent activity; missing memories that were "successfully" written.

**Phase to address:** Architecture (Phase 1). Storage layer routing must be decided before implementation.

**Confidence:** HIGH -- well-documented SQLite limitation confirmed in sqlite.org docs, better-sqlite3 docs, and multiple production post-mortems.

---

### 6. Redis Memory Eviction Silently Destroys Memories

**What goes wrong:** Redis reaches its maxmemory limit and begins evicting keys according to its eviction policy. Vector indices, memory metadata, or actual memory content gets silently deleted. The system continues operating but with gaps in its memory. No error is raised -- the data simply disappears.

**Why it happens:** Default Redis eviction policies (volatile-lru, allkeys-lru) evict data when memory pressure is high. Vector embeddings are large (1536 floats = ~6KB per vector). Memory-intensive AI workloads can fill Redis faster than expected. Operators configure maxmemory without understanding the eviction implications.

**How to avoid:**
- Set eviction policy to noeviction for memory-critical data; handle OOM errors explicitly
- Use Redis for hot/ephemeral data only; persist everything to SQLite as source of truth
- Monitor Redis memory usage with alerts at 70%, 85%, 95% of maxmemory
- Implement a Redis-to-SQLite spill mechanism: when Redis memory exceeds threshold, move cold data to SQLite
- Calculate expected memory usage: (num_memories x avg_vector_size x overhead_factor)
- Use separate Redis databases or key prefixes for evictable cache vs. critical memory data

**Warning signs:** Redis INFO showing evicted_keys > 0; memories present in SQLite but missing from Redis; intermittent retrieval failures for older memories; used_memory approaching maxmemory.

**Phase to address:** Architecture (Phase 1) for storage strategy; Operations (Phase 3+) for monitoring.

**Confidence:** HIGH -- documented in Redis official docs, Alibaba Cloud incident post-mortem, and multiple production guides.

---

### 7. ACT-R Base-Level Activation Computation Becomes Prohibitively Expensive

**What goes wrong:** The ACT-R base-level activation equation requires summing over every past access of a memory chunk, with each access weighted by a power-law decay. As memories accumulate thousands of accesses, this sum becomes computationally expensive, consuming significant CPU and memory. The exact formula is O(n) per retrieval per chunk where n is access count.

**Why it happens:** The formula B_i = ln(sum(t_j^(-d))) requires iterating over all past access timestamps. In a production system with thousands of memories accessed millions of times, this sum grows unbounded. Additionally, the standard approximation method has a non-monotonic relationship with the decay parameter, making it unreliable for tuning.

**How to avoid:**
- Use the hybrid approximation (Petrov, 2006): keep exact timestamps for the K most recent accesses, use the optimized approximation for all prior accesses
- Pre-compute and cache activation scores; update incrementally on access
- Set a maximum history window (e.g., last 1000 accesses) with an approximation for older ones
- Use the optimized_learning parameter as in ACT-R 7.x: combines exact recent + approximated historical
- Benchmark activation computation separately; it should be <1ms per chunk

**Warning signs:** Retrieval latency growing over time even with constant memory count; CPU usage increasing with system age; activation scores not changing meaningfully despite new accesses (numerical precision loss).

**Phase to address:** Core algorithm design (Phase 1). The approximation strategy must be chosen before implementation.

**Confidence:** MEDIUM -- based on ACT-R academic literature (Petrov 2006, ACT-R 7.x reference manual). Not many production AI systems implement true ACT-R, so real-world post-mortems are limited.

---

### 8. Cosine Similarity Threshold Miscalibration

**What goes wrong:** Fixed similarity thresholds produce wildly different results across different embedding models, content types, and query patterns. A threshold of 0.8 that works well for one model returns zero results for another. Thresholds that are too low return irrelevant noise; too high returns nothing. The "optimal" threshold varies per query.

**Why it happens:** Cosine similarity score distributions vary dramatically across embedding models. Some models produce scores clustered around 0.7-0.9; others around 0.3-0.6. Content type affects score distribution (short queries vs. long documents). A single hardcoded threshold cannot serve all cases.

**How to avoid:**
- Use relative scoring (top-K) instead of absolute thresholds as the primary retrieval mechanism
- If thresholds are needed, calibrate per embedding model using a validation set
- Implement adaptive thresholds based on score distribution of returned results
- Combine cosine similarity with other signals (recency, access frequency, ACT-R activation)
- Log score distributions and monitor for drift after model changes
- Never use a threshold without first profiling the score distribution of your specific model

**Warning signs:** Retrieval returning zero results for reasonable queries; all scores bunched in a narrow range; dramatic behavior change after embedding model update; users getting irrelevant memories.

**Phase to address:** Implementation (Phase 2), but the multi-signal scoring architecture should be designed in Phase 1.

**Confidence:** HIGH -- documented in RAG literature, ResearchGate papers on similarity thresholds, and the COS-Mix hybrid retrieval research.

---

### 9. Node.js Event Loop Blocking During Memory Operations

**What goes wrong:** CPU-intensive memory operations (vector similarity computation, consolidation, large batch writes) block the Node.js event loop, causing retrieval latency to spike above the 200ms target. Other requests queue up. The system appears to hang during consolidation or reindexing.

**Why it happens:** Node.js is single-threaded for JavaScript execution. Computing cosine similarity across thousands of vectors is CPU-bound. Consolidation requires LLM calls and data processing. SQLite operations via better-sqlite3 are synchronous and block the event loop.

**How to avoid:**
- Run all vector similarity computation in worker threads or a separate process
- Use Redis for vector search (offloads computation to Redis server)
- Run consolidation in the L4 daemon as a separate process, not in the request path
- Use worker_threads for any CPU-intensive operation; set timeouts to prevent zombie workers
- Implement circuit breakers: if retrieval exceeds 150ms, return cached/approximate results
- Profile event loop lag continuously; alert if p99 exceeds 50ms

**Warning signs:** Event loop lag increasing during memory operations; retrieval latency variance increasing; other API endpoints slowing down during consolidation; request timeouts.

**Phase to address:** Architecture (Phase 1) for process separation; Implementation (Phase 2) for worker thread management.

**Confidence:** HIGH -- well-documented Node.js limitation, confirmed by Trigger.dev event loop lag deep-dive and Node.js documentation.

---

### 10. Memory Deduplication Failures Create Contradictions

**What goes wrong:** The system stores multiple versions of the same fact (e.g., "user prefers dark mode" and "user prefers light mode") without detecting the contradiction. During retrieval, conflicting memories are returned, causing the agent to produce inconsistent behavior. Or, overly aggressive deduplication merges genuinely distinct memories.

**Why it happens:** Semantic similarity between a fact and its negation is often high (the embeddings of "likes X" and "dislikes X" are close). Simple Jaccard or cosine similarity cannot reliably detect contradictions. Temporal context (which statement is newer) is not factored into deduplication. Different agents may write conflicting observations about the same entity.

**How to avoid:**
- Implement temporal ordering: newer memories supersede older ones for the same entity/attribute
- Use entity-attribute-value extraction: detect when two memories reference the same entity+attribute
- Add explicit contradiction detection beyond simple similarity (use LLM-based validation for shared layers)
- Maintain memory provenance: track source agent, timestamp, confidence
- Implement a "last-writer-wins" policy with audit trail, or require consensus for shared facts
- Set deduplication thresholds conservatively (~70% Jaccard) and log near-misses for review

**Warning signs:** Agent contradicting itself across turns; duplicate memories with slightly different wording; users correcting the agent but old preferences persisting; dedup logs showing frequent near-threshold decisions.

**Phase to address:** Write pipeline design (Phase 2). But the entity extraction strategy should be outlined in Phase 1.

**Confidence:** HIGH -- confirmed by Mem0 user reports, Martian Engineering agent-memory project, and the Memory in the Age of AI Agents survey.

---

### 11. Zettelkasten Link Graph Becomes Unusable at Scale

**What goes wrong:** The note-linking graph accumulates orphan nodes (memories with no connections), over-connected hub nodes (everything links to "user preferences"), and circular reference chains. Graph traversal becomes slow and returns irrelevant results. The graph view becomes "more confusing than helpful" beyond a few hundred nodes.

**Why it happens:** Automated linking without curation creates low-quality connections. When every memory links to related memories, the graph becomes a near-complete graph where connections are meaningless. No pruning of stale or weak links. Hub nodes attract more links (preferential attachment), drowning out useful structure.

**How to avoid:**
- Implement link strength scoring: links decay if not traversed
- Limit outbound links per memory (e.g., max 5-7 strongest connections)
- Use hierarchical structure notes (Zettelkasten "structure notes") as curated entry points
- Prune orphan nodes on a schedule (L4 daemon task)
- Distinguish link types (supports, contradicts, elaborates, supersedes) rather than flat connections
- Monitor graph metrics: average degree, clustering coefficient, largest connected component ratio

**Warning signs:** Average node degree exceeding 20; orphan node percentage exceeding 30%; graph traversal time growing super-linearly; retrieval via graph links returning irrelevant results compared to vector search.

**Phase to address:** Architecture (Phase 1) for link type taxonomy; L4 daemon (Phase 3) for graph maintenance.

**Confidence:** MEDIUM -- based on Zettelkasten community experience (forum.zettelkasten.de discussions) and graph database scaling literature. Less directly tested in AI memory contexts.

---

### 12. Worker Thread Memory Leaks in Long-Running Daemon

**What goes wrong:** The L4 management daemon, running as a long-lived Node.js process with worker threads, accumulates memory over days/weeks. Worker threads that are spawned for consolidation or reindexing tasks leak compiled code memory, ArrayBuffer references, or event listeners. Eventually the process hits OOM and crashes.

**Why it happens:** Node.js worker threads have documented memory leak issues (node/issues #29784, #40878, #45685). Compiled code from V8 is never garbage collected in some worker scenarios. SharedArrayBuffer references can prevent GC. Workers that are terminated but not properly cleaned up leave residual memory.

**How to avoid:**
- Always call worker.terminate() explicitly; implement idle timeout for auto-cleanup
- Use process isolation (child_process.fork()) for heavy tasks instead of worker_threads for long-running daemons
- Set --max-old-space-size appropriately; monitor heap usage
- Implement periodic daemon restart (e.g., every 24h) as a safety net
- Avoid transferring large ArrayBuffers repeatedly; prefer message-passing for smaller data
- Use process managers (pm2, systemd) with memory limit triggers for automatic restart

**Warning signs:** RSS growing monotonically over hours/days; heap snapshots showing increasing "compiled code" sections; worker thread count not returning to zero after tasks complete; OOM crashes after extended uptime.

**Phase to address:** L4 daemon implementation (Phase 3). Process architecture decision (workers vs. child processes) should be made in Phase 1.

**Confidence:** HIGH -- documented in multiple Node.js GitHub issues with confirmed reproduction steps.

---

### 13. Plugin System Lifecycle Mismanagement

**What goes wrong:** The L5 OpenClaw plugin fails to properly initialize, or worse, fails to properly shut down. Memory operations continue after the plugin is unloaded. Database connections remain open. Background timers keep firing. The host framework and plugin have incompatible assumptions about lifecycle ownership.

**Why it happens:** Plugin architectures require bidirectional lifecycle management that is easy to get wrong. Node.js dynamic imports (ESM) have different caching behavior than CommonJS require(). Event listeners registered by the plugin are not cleaned up on unload. The plugin assumes resources (Redis connection, SQLite file) are always available.

**How to avoid:**
- Implement a formal plugin lifecycle: init() -> ready() -> suspend() -> destroy()
- Track all resources (connections, timers, event listeners) in a disposable registry
- Use AbortController/AbortSignal for cancellable operations
- Test plugin load/unload cycles explicitly (load, use, unload, reload)
- Implement health checks that the host framework can call
- Handle the case where the host framework terminates without calling destroy()
- Use Symbol.dispose / Symbol.asyncDispose patterns (ES2024+ explicit resource management)

**Warning signs:** "Connection already closed" errors after plugin reload; memory leaks after unload/reload cycles; timers firing after plugin destruction; host framework hanging on shutdown.

**Phase to address:** L5 plugin interface design (Phase 1). Implementation (Phase 3).

**Confidence:** MEDIUM -- based on Node.js plugin architecture guides (Adaltas, n-school) and general plugin system experience. Specific to MUMA-Mem's OpenClaw integration context.

---

### 14. Embedding Drift Goes Undetected

**What goes wrong:** Over time, the embedding model provider silently updates their model (or you upgrade to a new version). New embeddings are generated in a slightly different vector space than old ones. Retrieval quality degrades gradually -- old memories become harder to find with new queries. No error is raised because dimensions may still match.

**Why it happens:** Cloud embedding providers (OpenAI, Cohere, etc.) may update model weights without changing the API interface or dimension. Even same-dimension embeddings from different model versions occupy different vector spaces. Fine-tuning shifts the embedding space. There is no standard mechanism to detect this drift.

**How to avoid:**
- Pin embedding model versions explicitly (e.g., text-embedding-3-small-20240101)
- Implement drift detection: maintain a set of "canary" queries with known expected results; test periodically
- Store model version with every embedding; flag heterogeneous-version retrieval
- Set up automated alerts when drift metrics exceed thresholds (e.g., PSI > 0.2)
- Plan for periodic full reindexing as part of operational maintenance
- Use the Drift-Adapter approach (Orthogonal Procrustes alignment) for near-zero-downtime migration

**Warning signs:** Retrieval quality declining gradually without code changes; canary query results shifting; cosine similarity score distributions changing over time; users reporting "it used to remember this."

**Phase to address:** Monitoring (Phase 3+). But model version tracking must be in the schema from Phase 1.

**Confidence:** HIGH -- documented by Zilliz, Weaviate ("When Good Models Go Bad"), and the Drift-Adapter paper (arxiv 2509.23471).

---

### 15. Privacy Violations Through Memory Layer Leakage

**What goes wrong:** Agent A's private memories (L1) leak into shared layers (L2/L3) through consolidation, through retrieval result caching, or through poor access control implementation. User A's personal information becomes visible to User B's agents. Memory embeddings can be reverse-engineered to reconstruct original text.

**Why it happens:** Consolidation processes may merge private and shared memories without checking visibility. Caching layers do not enforce per-user isolation. Embedding vectors, while not plaintext, can leak information about the original content. Multi-tenant systems without strict isolation allow cross-tenant data access through bugs.

**How to avoid:**
- Enforce layer boundaries at the storage level, not just the application level (separate Redis keyspaces, separate SQLite tables)
- Tag every memory with owner_user_id and visibility_scope; enforce in every query
- Never consolidate across visibility boundaries without explicit policy
- Implement and test cross-user isolation: User A must never retrieve User B's L1 memories
- Audit memory access logs for cross-boundary retrievals
- Consider encrypting L1 memories at rest with per-user keys

**Warning signs:** Memory retrieval returning results from wrong user; consolidation merging cross-user memories; audit logs showing cross-boundary access patterns; users reporting seeing unfamiliar information.

**Phase to address:** Architecture (Phase 1) for isolation model. Security audit (Phase 3+).

**Confidence:** HIGH -- confirmed by Microsoft's Agentic AI failure taxonomy, EchoLeak CVE-2025-32711 incident, and multi-tenant AI leakage research (LayerX Security).

---

## Technical Debt Patterns

| Shortcut | Short-term Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoded embedding dimensions | Faster initial development | Full rewrite needed to switch providers; dimension mismatch crashes | Never -- abstractions are cheap, migration is expensive |
| Single SQLite database for all layers | Simpler deployment | Write contention, no isolation, backup complexity | Prototype/single-user only |
| No memory provenance tracking | Fewer fields to manage | Cannot debug poisoning, cannot implement trust scoring, no audit trail | Never -- add source_agent_id, timestamp, confidence from the start |
| In-process consolidation | No IPC complexity | Event loop blocking, cannot scale independently, crash takes down main process | Single-agent local testing only |
| Flat cosine similarity scoring | Simple retrieval | Poor relevance, no decay, no personalization, threshold problems | Early prototype; replace within first iteration |
| Global Redis keyspace | Easier key management | No isolation between users/agents, eviction affects everything | Development only |
| Synchronous embedding calls | Simpler control flow | Blocks on provider latency (50-500ms per call), cascading failures | Never for production retrieval path |
| Skip deduplication on write | Faster writes | Contradictory memories, wasted storage, confused retrieval | Acceptable if dedup runs as async background job |
| No migration system for embeddings | Less infrastructure | Stuck on original model forever, or forced cold-turkey migration with downtime | Never -- migration framework should exist from v1 |
| Unbounded memory accumulation | "Remember everything" | Retrieval degradation, storage cost growth, consolidation complexity | Never -- implement eviction/archival policy from start |

---

## Integration Gotchas

| Service/Component | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| OpenAI Embeddings API | Assuming model stability (models get updated/deprecated) | Pin model version, store version with embeddings, plan for migration |
| Redis Vector Search | Using default eviction policy with vector data | Set noeviction or separate critical data from cache; monitor memory |
| SQLite via better-sqlite3 | Using from multiple worker threads without connection pooling | One connection per thread, or use a write queue with single writer |
| Redis Persistence (RDB) | Assuming RDB snapshots prevent data loss | Accept up to 5 minutes of data loss, or use AOF with appendfsync everysec |
| Redis Persistence (AOF) | Using appendfsync always for durability | Accept performance hit or use everysec; monitor for AOF rewrite memory spikes |
| Ollama/Local Models | Assuming same interface as cloud providers | Handle different tokenization, dimension sizes, and latency profiles |
| OpenClaw Plugin Host | Assuming clean shutdown signals | Implement graceful degradation; handle SIGTERM, SIGINT, and abrupt termination |
| Node.js worker_threads | Spawning workers without termination strategy | Set idle timeouts, max lifetime, explicit terminate() calls, memory monitoring |
| LLM for consolidation | Trusting LLM summaries without validation | Validate summaries against source memories; check for information loss and hallucination |
| ChromaDB / Vector stores | Mixing embedding models in same collection | One model per collection; validate dimensions on startup |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-scan vector similarity in JS | 700ms for 10k docs, 7s+ for 100k | Use indexed search (HNSW via Redis); never brute-force in application code | >1000 memories |
| ACT-R activation over full history | Retrieval latency grows with system age | Use hybrid approximation (K recent exact + approximated historical) | >10k accesses per chunk |
| SQLite WAL checkpoint starvation | WAL file grows unbounded, disk fills | Schedule forced checkpoints during low activity; monitor WAL size | Under sustained read+write load |
| Synchronous embedding in request path | 200-500ms added per retrieval | Pre-compute embeddings on write; cache query embeddings | Any production usage |
| Consolidation during peak usage | Event loop blocks, all requests slow | Run consolidation in separate process; schedule during low activity | >100 memories to consolidate |
| Unbounded graph traversal | Graph queries timeout or return too much | Limit traversal depth (max 3 hops); use scored/pruned edges | >10k nodes with avg degree >10 |
| Redis memory fragmentation | Redis using 2x expected memory | Monitor mem_fragmentation_ratio; restart Redis periodically if >1.5 | After many deletes/updates to variable-size values |
| JSON serialization overhead | High CPU on memory read/write | Use JSONB in SQLite; use MessagePack or binary formats for Redis | >1000 operations/second |
| No connection pooling | Connection exhaustion under load | Pool Redis and SQLite connections; set max pool size | >50 concurrent agents |
| Embedding batch size too large | OOM during bulk operations | Limit batch size (100-500); process in chunks with backpressure | Bulk import or reindexing |

---

## Security Mistakes (Multi-Agent Memory Visibility/Access Control)

| Mistake | Risk | Mitigation |
|---------|------|------------|
| No per-memory ownership tracking | Cannot enforce visibility; any agent reads anything | Tag every memory with user_id, agent_id, layer, visibility_scope |
| Shared Redis keyspace for all users | Cross-user data leakage via key enumeration or eviction | Use key prefixes (user:{id}:mem:{id}) or separate Redis databases per user |
| Trusting agent-reported identity | Agent impersonation; poisoning attributed to wrong source | Authenticate agents at the framework level; verify identity server-side |
| No rate limiting on memory writes | Memory flooding/DoS; poisoning via volume | Per-agent write rate limits; escalating limits by trust level |
| Consolidation crosses visibility boundaries | Private L1 memories merged into shared L2/L3 | Enforce layer boundaries in consolidation logic; never merge across users |
| Memory content in error messages/logs | PII exposure through log aggregation | Sanitize memory content in logs; log IDs and metadata only |
| No memory deletion capability | GDPR/privacy violation; users cannot remove data | Implement hard delete across all stores (Redis, SQLite, vector index) |
| Embedding vectors stored without access control | Vectors can be used to reconstruct approximate original text | Encrypt vectors at rest for L1 memories; enforce access control on vector queries |
| Shared cache without tenant isolation | Cache poisoning; one user's cached results served to another | Partition cache by user_id; never cache cross-tenant results |
| No audit trail for memory operations | Cannot investigate incidents or prove compliance | Log all writes, reads, deletes, and consolidations with actor, timestamp, and layer |

---

## UX Pitfalls (How Memory Systems Frustrate Users)

| Problem | User Experience Impact | Mitigation |
|---------|----------------------|------------|
| Agent confidently states wrong memory | Trust destruction; 16% satisfaction drop per repeat | Show memory source and confidence; allow users to correct |
| No way to see what the agent remembers | Users feel surveilled but powerless | Provide a "memory dashboard" showing stored memories per user |
| No way to delete/correct memories | Users stuck with wrong information forever | Implement user-facing memory management (view, edit, delete) |
| Outdated memories presented as current | Agent acts on stale preferences; user must repeatedly correct | Show memory age; implement staleness indicators; prioritize recent |
| Agent remembers things user wanted forgotten | Privacy violation; broken trust | Explicit "forget this" command; respect user memory deletion requests |
| Memory from one context bleeds into another | Professional agent references personal preferences | Context isolation; per-workspace or per-project memory scopes |
| Slow retrieval noticeably delays responses | Users perceive agent as sluggish | <200ms retrieval target; return partial results if timeout approaches |
| Agent asks for information it should already know | 83% of users cite repeating info as most frustrating | Pre-fetch relevant memories at conversation start; proactive recall |
| Contradictory behavior across sessions | Agent says opposite things on different days | Deduplication + contradiction detection; consistent retrieval |
| No explanation of why something was remembered | Users confused about what triggers memory storage | Transparent memory triggers; "I'll remember that" confirmation |

---

## "Looks Done But Isn't" Checklist

- [ ] **Retrieval works** -- but only tested with <100 memories. Test at 10k, 100k.
- [ ] **Embeddings configured** -- but no migration path when model changes. Add version tracking and reindex capability.
- [ ] **Multi-agent writes work** -- but no conflict resolution. Two agents writing contradictory facts about same entity will both persist.
- [ ] **Consolidation runs** -- but never validated output quality. Add before/after retrieval accuracy benchmarks.
- [ ] **Redis connected** -- but no eviction policy set. Will silently lose data at maxmemory.
- [ ] **SQLite persists** -- but no WAL mode enabled. Will get "database locked" under concurrent access.
- [ ] **ACT-R scoring works** -- but uses exact computation. Will degrade as access history grows. Need hybrid approximation.
- [ ] **Plugin loads** -- but no unload/reload tested. Will leak connections and timers.
- [ ] **L4 daemon runs** -- but no memory monitoring. Will OOM after days of operation.
- [ ] **Access control implemented** -- but not tested across layers. L1->L2 promotion may leak private data.
- [ ] **Deduplication enabled** -- but similarity threshold not calibrated. May miss contradictions or merge distinct memories.
- [ ] **Graph links created** -- but no pruning. Will become a hairball that slows traversal.
- [ ] **Error handling exists** -- but not for Redis connection loss mid-operation. Need graceful degradation to SQLite-only mode.
- [ ] **Tests pass** -- but only with mocked embedding provider. Real provider latency, rate limits, and failures not tested.
- [ ] **Privacy controls exist** -- but no hard delete implemented. Archived/consolidated memories may still contain deleted content.
- [ ] **Monitoring exists** -- but only for uptime. Need retrieval latency p50/p95/p99, memory count, consolidation quality metrics.

---

## Recovery Strategies

| Failure Scenario | Detection | Recovery | Prevention |
|------------------|-----------|----------|------------|
| Redis data loss (eviction/crash) | Retrieval returns fewer results than expected; evicted_keys metric | Rebuild Redis from SQLite (source of truth); replay recent writes from AOF | noeviction policy; RDB+AOF persistence; SQLite as authoritative store |
| Embedding model change breaks retrieval | Canary query monitoring fails; zero-result queries spike | Dual-index migration: index with new model alongside old; merge results during transition | Model version pinning; migration framework; drift detection |
| Memory poisoning detected | Audit log anomalies; agent behavior changes; user reports | Quarantine suspected memories; roll back to last known-good state; revoke agent write access | Write validation; trust scoring; rate limiting; provenance tracking |
| SQLite corruption | PRAGMA integrity_check fails; query errors | Restore from backup; rebuild from Redis hot data + last good backup | Regular PRAGMA integrity_check; scheduled backups; WAL mode |
| L4 daemon OOM crash | Process monitor detects exit; memory metrics pre-crash | Auto-restart via pm2/systemd; resume from last checkpoint | Memory limits; periodic restart; heap monitoring |
| Plugin crash takes down host | Host framework error handlers triggered | Plugin isolation (separate process); auto-disable and notify | Process-level isolation; health checks; circuit breakers |
| Cross-user data leak | Audit log shows cross-boundary retrieval; user report | Immediate access revocation; identify and quarantine leaked memories; notify affected users | Storage-level isolation; automated cross-boundary testing; encryption |
| Consolidation corrupts memories | Retrieval quality metrics drop after consolidation run | Rollback consolidation (restore archived originals); disable consolidation until fixed | Never delete originals; consolidation quality benchmarks; dry-run mode |
| Vector index corruption | Retrieval returns wrong results; index size anomaly | Rebuild index from stored vectors in SQLite | Regular index validation; backup index files; rebuild capability |
| Node.js event loop stall | Latency p99 exceeds threshold; health check timeout | Kill and restart process; identify blocking operation in post-mortem | Offload CPU work to workers; monitor event loop lag continuously |

---

## Pitfall-to-Phase Mapping

| Phase | Critical Pitfalls to Address | Key Decisions |
|-------|------------------------------|---------------|
| **Phase 1: Architecture** | #1 (scoring model), #2 (embedding abstraction), #4 (trust model), #5 (storage routing), #6 (Redis eviction), #7 (ACT-R approximation), #9 (process separation), #13 (plugin lifecycle), #15 (isolation model) | Layer boundaries, storage engine per layer, embedding provider interface, activation formula, process architecture (main vs. workers vs. child processes) |
| **Phase 2: Core Implementation** | #3 (consolidation quality), #8 (threshold calibration), #10 (deduplication), #11 (graph management) | Write pipeline validation, retrieval scoring weights, deduplication strategy, link type taxonomy |
| **Phase 3: Integration & L4/L5** | #12 (worker memory leaks), #13 (plugin lifecycle impl), #14 (drift detection) | Daemon restart policy, plugin isolation mechanism, monitoring infrastructure |
| **Phase 4: Hardening** | #15 (security audit), all performance traps | Load testing at 10x expected scale, cross-boundary penetration testing, failure injection |
| **Ongoing Operations** | #6 (Redis monitoring), #14 (drift detection), #3 (consolidation quality), #12 (daemon health) | Alerting thresholds, reindexing schedule, consolidation quality benchmarks, memory growth projections |

---

## Sources

### High Confidence (benchmarks, official docs, confirmed incidents)

- [AI Memory Systems Benchmark: Mem0 vs OpenAI vs LangMem 2025](https://guptadeepak.com/the-ai-memory-wars-why-one-system-crushed-the-competition-and-its-not-openai/) -- Multi-system accuracy benchmarks showing sub-55% accuracy across all systems
- [Mem0 GitHub Issues](https://github.com/mem0ai/mem0/issues) -- Embedding dimension mismatches, integration failures, memory creation bugs
- [Microsoft Taxonomy of Failure Modes in Agentic AI](https://www.microsoft.com/en-us/security/blog/2025/04/24/new-whitepaper-outlines-the-taxonomy-of-failure-modes-in-ai-agents/) -- Memory poisoning, tool misuse, isolation failures
- [Revisiting Zep's LoCoMo Claim](https://github.com/getzep/zep-papers/issues/5) -- Benchmark methodology disputes and corrected accuracy figures
- [SQLite WAL Documentation](https://sqlite.org/wal.html) -- Single-writer limitation, checkpoint behavior
- [Redis Persistence Documentation](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) -- RDB/AOF tradeoffs, data loss scenarios
- [Redis Key Eviction Documentation](https://redis.io/docs/latest/develop/reference/eviction/) -- Eviction policies and memory management
- [Node.js Worker Thread Memory Leaks](https://github.com/nodejs/node/issues/29784) -- Confirmed memory leak in worker threads
- [Node.js Worker Thread Memory Not Cleaned](https://github.com/nodejs/node/issues/45685) -- Memory not released after worker termination
- [CrewAI Embedding Dimension Mismatch #2464](https://github.com/crewAIInc/crewAI/issues/2464) -- Production dimension mismatch bug
- [Trigger.dev Event Loop Lag Deep Dive](https://trigger.dev/blog/event-loop-lag) -- Event loop blocking analysis and mitigations
- [better-sqlite3 Performance Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) -- Write concurrency limitations

### Medium Confidence (research papers, expert analysis, framework documentation)

- [Memory in the Age of AI Agents Survey](https://arxiv.org/abs/2512.13564) -- Comprehensive survey of memory lifecycle challenges
- [ACT-R Base-Level Activation Approximations](https://link.springer.com/article/10.1007/s42113-018-0015-3) -- Comparison of approximation methods for activation computation
- [Petrov 2006 Efficient BLA Approximation](http://alexpetrov.com/pub/iccm06/) -- Hybrid approximation for base-level activation
- [ACT-R 7.x Reference Manual](http://act-r.psy.cmu.edu/actr7.x/reference-manual.pdf) -- Official activation formula documentation
- [Collaborative Memory with Dynamic Access Control](https://arxiv.org/html/2505.18279v1) -- Multi-user memory sharing with bipartite access graphs
- [Drift-Adapter for Near-Zero Downtime Embedding Migration](https://www.arxiv.org/pdf/2509.23471) -- Embedding alignment without full reindexing
- [Weaviate: When Good Models Go Bad](https://weaviate.io/blog/when-good-models-go-bad) -- Embedding model migration challenges
- [Similarity Thresholds in RAG](https://www.researchgate.net/publication/384777929_Similarity_Thresholds_in_Retrieval-Augmented_Generation) -- Threshold calibration research
- [Multi-Tenant AI Leakage](https://layerxsecurity.com/generative-ai/multi-tenant-ai-leakage/) -- Cross-tenant data isolation failures
- [AI Agents and Memory: Privacy and Power](https://www.newamerica.org/oti/briefs/ai-agents-and-memory/) -- Privacy implications of persistent AI memory
- [Letta/MemGPT Integration Issues](https://github.com/letta-ai/letta/issues/689) -- Codebase integration difficulties
- [Zep Feature Retirements May 2025](https://blog.getzep.com/zep-feature-retirements-may-2025/) -- Breaking changes in memory system APIs

### Lower Confidence (community discussions, blog posts, general analysis)

- [The AI Memory Crisis: 62% Wrong](https://medium.com/@mohantaastha/the-ai-memory-crisis-why-62-of-your-ai-agents-memories-are-wrong-792d015b71a4) -- Memory accuracy analysis (numbers not independently verified)
- [The Problem with AI Agent Memory](https://medium.com/@DanGiannone/the-problem-with-ai-agent-memory-9d47924e7975) -- Developer experience critique
- [The Agent's Memory Dilemma](https://medium.com/@tao-hpu/the-agents-memory-dilemma-is-forgetting-a-bug-or-a-feature-a7e8421793d4) -- Forgetting as feature vs. bug analysis
- [Zettelkasten Forum: Struggling with Linking](https://forum.zettelkasten.de/discussion/1754/really-struggling-with-linking) -- Community discussion on graph management
- [SQLite Concurrent Writes](https://oldmoe.blog/2024/07/08/the-write-stuff-concurrent-write-transactions-in-sqlite/) -- Write contention analysis
- [Redis Memory Optimization Techniques](https://medium.com/platform-engineer/redis-memory-optimization-techniques-best-practices-3cad22a5a986) -- Memory management best practices
- [MongoDB: Why Multi-Agent Systems Need Memory Engineering](https://medium.com/mongodb/why-multi-agent-systems-need-memory-engineering-153a81f8d5be) -- Multi-agent coordination failures
- [AI Recommendation Poisoning (Microsoft, Feb 2026)](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) -- Recent memory manipulation for profit
- [Node.js Plugin Architecture Guide](https://www.adaltas.com/en/2020/08/28/node-js-plugin-architecture/) -- Plugin lifecycle patterns
- [Alibaba Cloud Redis Incident](https://www.alibabacloud.com/blog/learn-nearly-everything-about-redis-through-an-incident_602055) -- Production Redis failure analysis
