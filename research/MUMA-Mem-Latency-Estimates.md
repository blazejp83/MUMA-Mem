# MUMA-Mem Latency Estimates

> Detailed latency analysis for each operation in the MUMA-Mem architecture, grounded in published benchmarks from research papers and component-level measurements.

---

## 1. Component-Level Latencies

All measurements assume a typical VPS deployment: 4-core AMD EPYC, 8-16GB RAM, NVMe SSD, Redis running locally (no network hop for DB operations).

### 1.1 Redis Operations

| Operation | p50 | p95 | Source |
|-----------|-----|-----|--------|
| Key GET (single) | 0.4 ms | 0.8 ms | Redis benchmark docs |
| Key SET (single) | 0.5 ms | 1.0 ms | Redis benchmark docs |
| Vector KNN search (384-dim, 10K entries) | 3 ms | 8 ms | Redis vector benchmark blog |
| Vector KNN search (384-dim, 100K entries) | 5 ms | 15 ms | Redis vector benchmark blog |
| Vector KNN search (384-dim, 1M entries) | 15 ms | 40 ms | Redis vector benchmark blog (extrapolated) |
| Pub/Sub message delivery | 0.5 ms | 1.5 ms | Redis pub/sub docs |
| Multi-key GET (10 keys, pipelined) | 1.0 ms | 2.5 ms | Redis pipeline benchmark |
| JSON document read | 0.5 ms | 1.2 ms | Redis JSON benchmark |
| JSON document write | 0.6 ms | 1.5 ms | Redis JSON benchmark |

**Note:** These assume Redis and the application are on the same machine (Unix socket or localhost TCP). Add 0.5-2ms for cross-network calls.

### 1.2 Embedding Model (all-MiniLM-L6-v2)

| Operation | VPS CPU (4-core) | GPU (if available) | Source |
|-----------|-----------------|-------------------|--------|
| Single sentence embed | 25-40 ms | 0.5-1.0 ms | SBERT docs, HuggingFace benchmarks |
| Batch embed (10 sentences) | 60-100 ms | 2-5 ms | SBERT docs |
| Batch embed (100 sentences) | 400-700 ms | 15-25 ms | SBERT docs |

**Note:** The model is 33M parameters, ~90MB. It fits comfortably in memory on any VPS. First inference has a cold-start penalty of ~500ms for model loading; subsequent calls use the warm model.

### 1.3 LLM API (GPT-4o-mini)

| Operation | TTFT | Total Time | Tokens Out | Source |
|-----------|------|------------|------------|--------|
| Note construction (keywords, tags, context) | 580 ms | 2.0-3.5 s | ~150-200 | Artificial Analysis benchmark |
| Decision (ADD/UPDATE/DELETE/NOOP) | 580 ms | 1.5-2.5 s | ~50-100 | Artificial Analysis benchmark |
| Link analysis | 580 ms | 1.5-2.5 s | ~50-100 | Artificial Analysis benchmark |
| Memory evolution (update linked notes) | 580 ms | 2.0-3.0 s | ~100-150 | Artificial Analysis benchmark |
| Conflict resolution judgment | 580 ms | 1.5-2.5 s | ~50-100 | Artificial Analysis benchmark |

**GPT-4o-mini throughput:** ~46.4 tokens/second output (OpenAI provider).

### 1.4 LLM Local (Qwen-2.5-3B via Ollama, 4-core VPS CPU)

| Operation | TTFT | Total Time | Tokens Out | Source |
|-----------|------|------------|------------|--------|
| Note construction | 95 ms | 14-19 s | ~150-200 | Qwen speed benchmark |
| Decision | 95 ms | 5-10 s | ~50-100 | Qwen speed benchmark |
| Link analysis | 95 ms | 5-10 s | ~50-100 | Qwen speed benchmark |
| Memory evolution | 95 ms | 10-15 s | ~100-150 | Qwen speed benchmark |

**Qwen-2.5-3B throughput:** ~10.6 tokens/second on CPU (Q4_K_M quantization).

**Verdict:** Local inference is 3-5x slower per operation. Only viable for privacy-critical or offline deployments. GPT-4o-mini is the recommended default.

### 1.5 Filesystem I/O

| Operation | Time | Notes |
|-----------|------|-------|
| Write JSON file (1-10KB) | 0.5-2 ms | NVMe SSD |
| Read JSON file (1-10KB) | 0.3-1 ms | NVMe SSD, likely cached |
| Write MEMORY.md (10-50KB) | 1-5 ms | NVMe SSD |
| Directory listing | 1-3 ms | Depends on file count |

Filesystem I/O is negligible relative to LLM and embedding operations.

---

## 2. Composite Operation Latencies

### 2.1 Memory Read Pipeline (Agent Queries Memory)

This is the critical hot path -- what a user experiences when their agent needs to recall something.

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Embed query                    30 ms      40 ms      CPU, warm model
2. Vector search (top-10)          5 ms      15 ms      100K entries typical
3. Fetch retrieved notes          1.0 ms     2.5 ms     10 Redis GETs, pipelined
4. Link expansion (1-hop)         1.5 ms     3.0 ms     ~5 linked notes per result, pipelined
5. Role filter                    0.1 ms     0.2 ms     In-memory, trivial
6. Format context                 0.2 ms     0.5 ms     String assembly
─────────────────────────────────────────────────────────────────
TOTAL (memory retrieval only)     ~38 ms     ~61 ms
```

**Comparison to research baselines:**

| System | Search p50 | Search p95 | Source |
|--------|-----------|-----------|--------|
| **MUMA-Mem (estimated)** | **38 ms** | **61 ms** | This analysis |
| Mem0 (reported) | 148 ms | 200 ms | Mem0 paper, Table 2 |
| Mem0g (reported) | 476 ms | 657 ms | Mem0 paper, Table 2 |
| A-Mem (reported) | 668 ms | 1,485 ms | Mem0 paper, Table 2 |
| Zep (reported) | 513 ms | 778 ms | Mem0 paper, Table 2 |
| LangMem (reported) | 17,990 ms | 59,820 ms | Mem0 paper, Table 2 |

MUMA-Mem's estimated retrieval is **~4x faster than Mem0** because:
- Redis vector search is faster than Mem0's vector DB (which uses a Python wrapper)
- Embedding is done once per query (same as Mem0)
- Local Redis eliminates network round-trips that cloud-hosted vector DBs incur
- No LLM call in the read path (Mem0 also avoids this)

### 2.2 Memory Read + LLM Response (End-to-End User Experience)

What the user actually waits for: memory retrieval + LLM generates an answer using the retrieved context.

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Memory retrieval               38 ms      61 ms      From 2.1 above
2. LLM response generation       1.5 s      3.5 s      GPT-4o-mini, ~100 token answer
                                                         with ~1.7K token context
─────────────────────────────────────────────────────────────────
TOTAL (end-to-end)                ~1.5 s     ~3.6 s
```

**Comparison:**

| System | Total p50 | Total p95 | Source |
|--------|----------|----------|--------|
| **MUMA-Mem (estimated)** | **~1.5 s** | **~3.6 s** | This analysis |
| Mem0 (reported) | 708 ms | 1,440 ms | Mem0 paper, Table 2 |
| Mem0g (reported) | 1,091 ms | 2,590 ms | Mem0 paper, Table 2 |
| A-Mem (reported) | 1,410 ms | 4,374 ms | Mem0 paper, Table 2 |
| Full-context (reported) | 9,870 ms | 17,117 ms | Mem0 paper, Table 2 |
| RAG k=2, 256 chunk (reported) | 802 ms | 1,907 ms | Mem0 paper, Table 2 |

**Note:** Mem0's reported "total" times use GPT-4o-mini for both retrieval and response. Our estimate is comparable. The variance comes from the LLM response generation step, which dominates total latency. Memory retrieval is <5% of end-to-end time.

### 2.3 Memory Write Pipeline (Agent Stores a Memory)

This runs asynchronously -- the user does NOT wait for this to complete. The agent fires the write and continues.

#### Variant A: Full pipeline, GPT-4o-mini (recommended)

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Embed content                  30 ms      40 ms      CPU, warm model
2. CONSTRUCT (LLM: keywords,
   tags, context)                 2.5 s      3.5 s      GPT-4o-mini, ~200 tokens out
3. RETRIEVE similar (top-10)      5 ms       15 ms      Vector search
4. DECIDE (LLM: ADD/UPDATE/
   DELETE/NOOP)                   2.0 s      2.5 s      GPT-4o-mini, ~100 tokens out
5. LINK (LLM: analyze
   connections)                   2.0 s      2.5 s      GPT-4o-mini, ~100 tokens out
6. EVOLVE (LLM: update linked
   notes)                         2.5 s      3.0 s      GPT-4o-mini, ~150 tokens out
7. Redis writes (notes + links)   2 ms       5 ms       Multiple SET operations
8. Pub/Sub notification           0.5 ms     1.5 ms     Notify sibling agents
─────────────────────────────────────────────────────────────────
TOTAL (sequential)                ~9.0 s     ~11.6 s
```

#### Variant B: Optimized pipeline (parallel LLM calls where possible)

Steps 5 (LINK) and 6 (EVOLVE) depend on step 4 (DECIDE), but steps 2 (CONSTRUCT) can be partially combined with step 4 into a single LLM call with a richer prompt. Additionally, LINK and EVOLVE can be combined.

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Embed content                  30 ms      40 ms      CPU
2. CONSTRUCT + DECIDE (single
   LLM call with combined prompt) 3.0 s      4.0 s      ~250 tokens out
3. RETRIEVE similar (top-10)      5 ms       15 ms      Vector search (can run
                                                         parallel with step 2
                                                         after embedding is done)
4. LINK + EVOLVE (single LLM
   call, combined)                2.5 s      3.5 s      ~200 tokens out
5. Redis writes + pub/sub         3 ms       7 ms       Multiple operations
─────────────────────────────────────────────────────────────────
TOTAL (optimized)                 ~5.5 s     ~7.6 s
```

#### Variant C: Local Qwen-2.5-3B (offline/privacy mode)

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Embed content                  30 ms      40 ms      CPU
2. CONSTRUCT + DECIDE             15 s       20 s       ~250 tokens at 10.6 tok/s
3. RETRIEVE similar               5 ms       15 ms      Vector search
4. LINK + EVOLVE                  12 s       17 s       ~200 tokens at 10.6 tok/s
5. Redis writes + pub/sub         3 ms       7 ms       Multiple operations
─────────────────────────────────────────────────────────────────
TOTAL (local LLM)                 ~27 s      ~37 s
```

**Important:** Write pipeline latency is invisible to the user because writes are asynchronous. The agent continues operating while the write pipeline processes in the background. The user only experiences read latency.

### 2.4 Cross-Agent Synchronization

When one agent writes a memory and another agent needs to be notified:

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Pub/Sub publish                0.5 ms     1.5 ms     Redis pub/sub
2. Pub/Sub delivery to
   subscriber                     0.5 ms     1.5 ms     Same Redis instance
3. Subscriber cache invalidation  0.1 ms     0.3 ms     In-memory flag
─────────────────────────────────────────────────────────────────
TOTAL                             ~1.1 ms    ~3.3 ms
```

The actual memory refresh (re-reading updated notes) happens lazily on the subscribing agent's next query, so it adds the cost of a read pipeline (~38-61ms) to that query only.

### 2.5 Transactive Index Lookup

When an agent needs to find "who knows about X":

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Embed topic query              30 ms      40 ms      CPU
2. Search transactive index       2 ms       5 ms       Small index, simple KNN
3. Return expert list             0.1 ms     0.3 ms     In-memory format
─────────────────────────────────────────────────────────────────
TOTAL                             ~32 ms     ~45 ms
```

### 2.6 Cross-User Query (via Transactive Index)

Agent A needs information from User B's memory:

```
Step                              p50        p95        Notes
─────────────────────────────────────────────────────────────────
1. Transactive index lookup       32 ms      45 ms      From 2.5
2. Route query to User B's
   shared memory                  0.5 ms     1.0 ms     Redis namespace switch
3. Vector search in User B's
   memory (scoped)                5 ms       15 ms      Same Redis, different key prefix
4. Fetch + filter results         2 ms       5 ms       Role-based access control
─────────────────────────────────────────────────────────────────
TOTAL                             ~40 ms     ~66 ms
```

This is only ~5ms slower than a local user memory query because all data lives in the same Redis instance.

---

## 3. Background Process Latencies

These do not affect user experience directly but determine system resource consumption.

### 3.1 Decay Sweep (hourly)

```
Operation                         Time       Notes
─────────────────────────────────────────────────────────────────
Per memory item:
  Read activation + access_log    0.4 ms     Redis GET
  Recalculate activation          0.01 ms    In-memory math
  Write updated activation        0.5 ms     Redis SET
  Total per item                  ~1 ms

For 10K memories (single user):  ~10 s       Sequential, can be batched
For 50K memories (10 users):     ~50 s       Or ~10s with 5x pipeline batching
For 1M memories (large deploy):  ~17 min     With 1000x pipeline batching: ~60s
```

**Optimization:** Redis pipelining reduces per-item overhead dramatically. A batch of 100 read-recalculate-write operations can complete in ~15ms versus 100ms sequential.

### 3.2 Consolidation Cycle (daily, per user)

```
Step                              Time       Notes
─────────────────────────────────────────────────────────────────
1. Collect episodic memories
   from last 24h                  50-200 ms  Redis SCAN + filter by timestamp
2. Embed all collected memories
   (batch)                        100-500 ms Depends on count (typically 20-100)
3. Cluster by similarity          50-200 ms  In-memory agglomerative clustering
4. Generate summaries
   (LLM per cluster)              5-15 s     1-5 clusters × 2-3s per LLM call
5. Conflict detection
   (pairwise similarity scan)     200-500 ms For ~1K high-activation memories
6. Conflict resolution
   (LLM per conflict)             2-5 s      0-2 conflicts typical × 2-3s each
7. Write consolidated notes       5-20 ms    Redis writes
8. Prune archived memories        10-50 ms   Redis DELs + filesystem writes
9. Regenerate MEMORY.md           2-4 s      LLM summarization of top memories
─────────────────────────────────────────────────────────────────
TOTAL per user                    ~10-25 s   Typical daily cycle
TOTAL for 10 users                ~2-4 min   Sequential (can be parallelized)
```

### 3.3 Knowledge Promotion (weekly)

```
Step                              Time       Notes
─────────────────────────────────────────────────────────────────
1. Scan all users for promotion
   candidates                     1-5 s      Redis SCAN with activation filter
2. Cross-user deduplication       500 ms-2 s Pairwise embedding similarity
3. LLM-based anonymization/
   generalization                 3-10 s     Per candidate (typically 1-5)
4. Write to Knowledge Commons     5-20 ms    Redis writes
─────────────────────────────────────────────────────────────────
TOTAL                             ~5-20 s    Weekly, completely invisible
```

### 3.4 Filesystem Sync (every 15 minutes)

```
Step                              Time       Notes
─────────────────────────────────────────────────────────────────
1. Read dirty flags from Redis    1-5 ms     Check which notes changed
2. Serialize changed notes
   to JSON                        10-50 ms   Depends on change volume
3. Write files to disk            5-30 ms    NVMe, typically 1-20 files
4. Check for human edits
   (file mtime comparison)        5-20 ms    Filesystem stat calls
5. Ingest human edits
   (parse + embed + write Redis)  0-500 ms   Usually 0 (no human edits)
─────────────────────────────────────────────────────────────────
TOTAL                             ~20-100 ms Typical sync cycle (no changes: ~10ms)
```

---

## 4. Latency Budget Summary

### User-Facing Operations (What People Wait For)

| Operation | p50 | p95 | User Perception |
|-----------|-----|-----|-----------------|
| **Memory query (retrieval only)** | 38 ms | 61 ms | Instantaneous |
| **Memory query + LLM response** | 1.5 s | 3.6 s | Feels responsive (LLM-dominated) |
| **Transactive index lookup** | 32 ms | 45 ms | Instantaneous |
| **Cross-user query** | 40 ms | 66 ms | Instantaneous |
| **Agent sync notification** | 1.1 ms | 3.3 ms | Invisible |

### Background Operations (Invisible to Users)

| Operation | Typical Duration | Frequency | CPU Impact |
|-----------|-----------------|-----------|------------|
| **Memory write pipeline** | 5.5-7.6 s (optimized, GPT-4o-mini) | Per memory event | Low (mostly waiting on API) |
| **Decay sweep** | 10-60 s (depends on scale) | Hourly | Low |
| **Consolidation cycle** | 10-25 s per user | Daily | Moderate (LLM calls) |
| **Filesystem sync** | 20-100 ms | Every 15 min | Negligible |
| **Knowledge promotion** | 5-20 s | Weekly | Low |

### Latency Breakdown: Where Time Is Spent

For the critical read path (memory query + LLM response):

```
┌─────────────────────────────────────────────────────┐
│              End-to-End: ~1.5s (p50)                │
│                                                      │
│  ┌──────┐  ┌────┐  ┌──┐  ┌──┐  ┌────────────────┐  │
│  │Embed │  │Vec │  │IO│  │  │  │ LLM Response   │  │
│  │ 30ms │  │5ms │  │3ms│ │<1│  │ Generation     │  │
│  │(2.0%)│  │(.3%)│  │(.2%)│(.1%)│  │ ~1,460ms       │  │
│  │      │  │    │  │  │  │  │  │ (97.4%)        │  │
│  └──────┘  └────┘  └──┘  └──┘  └────────────────┘  │
│  Embedding  Search  Redis  Filter     LLM            │
└─────────────────────────────────────────────────────┘
```

**The LLM response generation accounts for ~97% of user-perceived latency.** Memory retrieval is effectively free relative to the LLM call. This means:

1. Optimizing the memory layer beyond this point yields diminishing returns for user experience.
2. The memory system's primary value is **quality of retrieved context**, not retrieval speed.
3. Investing in better retrieval relevance (activation tuning, link quality) has more impact than shaving milliseconds off vector search.

---

## 5. Scaling Projections

### 5.1 Memory Count Scaling

How read latency changes as total memories grow:

| Total Memories | Vector Search p50 | Vector Search p95 | Total Read p50 | Notes |
|---------------|-------------------|-------------------|---------------|-------|
| 1,000 | 1 ms | 3 ms | 33 ms | Small deployment |
| 10,000 | 3 ms | 8 ms | 35 ms | Typical single user after 6 months |
| 50,000 | 5 ms | 15 ms | 38 ms | 10 users, moderate usage |
| 100,000 | 8 ms | 20 ms | 41 ms | 10 users, heavy usage |
| 500,000 | 12 ms | 30 ms | 45 ms | Large team deployment |
| 1,000,000 | 15 ms | 40 ms | 48 ms | Enterprise scale |

**Key insight:** Read latency scales sub-linearly with memory count. Even at 1M memories, the read pipeline stays under 50ms. This is because RediSearch uses HNSW (Hierarchical Navigable Small World) index, which has O(log N) search complexity.

### 5.2 Concurrent User Scaling

How latency changes with multiple simultaneous queries:

| Concurrent Queries | Read p50 | Read p95 | Notes |
|-------------------|----------|----------|-------|
| 1 | 38 ms | 61 ms | Baseline |
| 5 | 40 ms | 70 ms | Minimal contention |
| 10 | 45 ms | 85 ms | Redis handles easily |
| 50 | 55 ms | 120 ms | CPU contention on embedding becomes visible |
| 100 | 80 ms | 200 ms | Need GPU or embedding service at this scale |

**Bottleneck at scale:** The embedding model (all-MiniLM-L6-v2) running on CPU becomes the bottleneck at >50 concurrent queries. Mitigation options:
- Batch embedding requests
- Move embedding to GPU
- Use an embedding microservice with request pooling
- Cache frequent query embeddings

### 5.3 Redis Memory Scaling

| Users | Memories/User | Total Memories | Embedding Storage | Total Redis Memory |
|-------|--------------|---------------|-------------------|-------------------|
| 1 | 5,000 | 5,000 | 7.3 MB | ~30 MB |
| 10 | 5,000 | 50,000 | 73 MB | ~300 MB |
| 10 | 10,000 | 100,000 | 146 MB | ~600 MB |
| 50 | 10,000 | 500,000 | 732 MB | ~3 GB |
| 100 | 10,000 | 1,000,000 | 1.46 GB | ~6 GB |

**Calculation:** 384 dimensions × 4 bytes (float32) = 1,536 bytes per embedding. Plus ~500 bytes metadata per note. Total ~2KB per memory item for the index, plus the full note content.

**Optimization for large deployments:** Quantize embeddings from float32 to float16 (768 bytes per embedding, halving memory usage) with negligible retrieval quality loss.

---

## 6. Cost Estimates

### 6.1 LLM API Cost per Memory Write (GPT-4o-mini)

```
Optimized pipeline (2 LLM calls):

Call 1: CONSTRUCT + DECIDE
  Input:  ~800 tokens (content + similar notes + system prompt)
  Output: ~250 tokens (keywords, tags, context, decision)
  Cost:   800 × $0.15/1M + 250 × $0.60/1M = $0.00027

Call 2: LINK + EVOLVE
  Input:  ~600 tokens (note + linked notes + system prompt)
  Output: ~200 tokens (link decisions, evolution updates)
  Cost:   600 × $0.15/1M + 200 × $0.60/1M = $0.00021

TOTAL per memory write: ~$0.0005 (0.05 cents)
```

### 6.2 LLM API Cost for Daily Consolidation (per user)

```
Typical daily cycle:
  3 cluster summaries × ~500 tokens output = 1,500 tokens
  1 conflict resolution × ~100 tokens output = 100 tokens
  1 MEMORY.md generation × ~500 tokens output = 500 tokens
  Total input: ~5,000 tokens
  Total output: ~2,100 tokens

  Cost: 5,000 × $0.15/1M + 2,100 × $0.60/1M = $0.002 (0.2 cents)
```

### 6.3 Monthly Cost Projection

| Component | Per User/Month | 10 Users/Month |
|-----------|---------------|---------------|
| Memory writes (~20/day) | $0.30 | $3.00 |
| Daily consolidation | $0.06 | $0.60 |
| Weekly promotion | $0.01 | $0.10 |
| Ad-hoc conflict resolution | $0.02 | $0.20 |
| **LLM API subtotal** | **$0.39** | **$3.90** |
| Redis (VPS included) | $0 | $0 |
| VPS (4-core, 16GB) | -- | $40-80 |
| **Total** | -- | **$44-84** |

**Note:** These estimates assume GPT-4o-mini at current pricing ($0.15/1M input, $0.60/1M output). Costs drop further with local Qwen inference (electricity only) at the expense of write pipeline latency.

---

## 7. Comparison with Reported Systems

### 7.1 End-to-End Latency Comparison

| System | Memory Retrieval p50 | Total Response p50 | Total Response p95 | Source |
|--------|---------------------|-------------------|-------------------|--------|
| **MUMA-Mem** | **38 ms** | **~1,500 ms** | **~3,600 ms** | This estimate |
| Mem0 | 148 ms | 708 ms | 1,440 ms | Mem0 paper |
| Mem0g | 476 ms | 1,091 ms | 2,590 ms | Mem0 paper |
| A-Mem | 668 ms | 1,410 ms | 4,374 ms | Mem0 paper |
| Zep | 513 ms | 1,292 ms | 2,926 ms | Mem0 paper |
| LangMem | 17,990 ms | 18,530 ms | 60,400 ms | Mem0 paper |
| Full-context | N/A | 9,870 ms | 17,117 ms | Mem0 paper |
| Best RAG (k=2, 256) | 255 ms | 802 ms | 1,907 ms | Mem0 paper |

### 7.2 Analysis

**MUMA-Mem retrieval is faster** (~38ms vs 148ms for Mem0) because:
- Redis with RediSearch is faster than Python-wrapped vector stores
- Local Redis eliminates network hops
- Pipelined multi-key fetches reduce round trips

**MUMA-Mem total response is comparable or slightly slower** (~1.5s vs ~0.7s for Mem0) because:
- Mem0's benchmark numbers include the LLM response, using the same GPT-4o-mini
- The difference likely comes from token context size: MUMA-Mem sends more context (~1.7K tokens with link expansion) than basic Mem0 (~1.7K but without link expansion)
- In practice, the richer context should produce better answers, trading latency for quality

**MUMA-Mem vs Full-context is dramatically faster** (~1.5s vs ~9.9s):
- Full-context sends ~26K tokens per query
- MUMA-Mem sends ~1.7K tokens (93% reduction)
- This translates to both latency savings and cost savings

### 7.3 Where MUMA-Mem Adds Latency Not Present in Simpler Systems

| Feature | Added Latency | Justification |
|---------|--------------|---------------|
| Link expansion (1-hop) | +2-5 ms per read | Richer context, better multi-hop reasoning |
| Role-based filtering | +0.1-0.3 ms per read | Multi-user security (negligible cost) |
| Write pipeline (async) | 5.5-7.6 s per write | Memory quality (user never waits) |
| Consolidation | 10-25 s/day per user | Long-term memory health (runs in background) |
| Pub/sub sync | +1-3 ms per write | Multi-agent consistency (negligible) |
| Transactive index | +32 ms when routing cross-user | Better routing (only on cross-user queries) |

---

## 8. Latency Optimization Roadmap

If specific latency targets need to be met:

### Target: Sub-20ms Memory Retrieval

```
Current: ~38ms p50
Bottleneck: Embedding (30ms)

Optimizations:
  1. Cache frequent query embeddings (Redis, TTL 5min)     → saves 30ms on cache hit
  2. Pre-compute embeddings for common task templates       → saves 30ms for template queries
  3. Use ONNX Runtime for embedding inference               → 15ms instead of 30ms
  4. Quantize embeddings to float16 in search index         → marginal search speedup

Expected result: ~8-15ms p50 (with cache hits), ~23ms p50 (cache miss with ONNX)
```

### Target: Sub-1s Total Response

```
Current: ~1.5s p50
Bottleneck: LLM response generation (1,460ms)

Optimizations:
  1. Stream LLM response (user sees tokens as they arrive)  → perceived <500ms TTFT
  2. Use smaller context window (top-5 instead of top-10)    → fewer input tokens
  3. Pre-fetch likely memories based on conversation topic    → overlap retrieval with user typing
  4. Use GPT-4o-mini with lower max_tokens                   → faster completion

Expected result: ~580ms to first visible token (streaming)
```

### Target: Sub-3s Write Pipeline

```
Current: ~5.5s p50 (optimized)
Bottleneck: Two sequential LLM calls

Optimizations:
  1. Single LLM call (combine all steps into one prompt)    → eliminates 1 TTFT (580ms)
  2. Use function calling for structured output              → slightly faster parsing
  3. Skip EVOLVE for low-importance memories                 → saves 1 LLM call (~50% of writes)
  4. Batch multiple writes into single LLM call              → amortize overhead

Expected result: ~2-3s p50 for important memories, ~1.5-2s for routine ones
```
