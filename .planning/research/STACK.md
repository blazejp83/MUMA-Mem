# MUMA-Mem Technology Stack Research

> Research date: 2026-02-13
> Target: Node.js 22+, TypeScript 5.9, ESM-first, pnpm
> Constraint: <200ms memory retrieval latency

---

## Core Technologies

| Package | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **TypeScript** | 5.9.x | Type system, build | Latest stable; `import defer` support; improved tsconfig defaults; `NodeNext` module resolution recommended for Node.js ESM |
| **Node.js** | 22 LTS | Runtime | LTS stability; `node:sqlite` builtin available (experimental); native ESM; good perf baseline |
| **redis** (node-redis) | 5.10.x | Redis client | Official Redis client; built-in RediSearch/vector support via `@redis/search`; actively maintained; ioredis is now deprecated/maintenance-only |
| **better-sqlite3** | 12.6.x | SQLite driver | Fastest synchronous SQLite for Node.js; native addon; battle-tested; compatible with sqlite-vec extension loading |
| **sqlite-vec** | 0.1.7-alpha.2 | SQLite vector search | Pure C, zero dependencies; successor to sqlite-vss; `vec0` virtual tables for KNN; works with better-sqlite3 via `sqliteVec.load(db)` |
| **@huggingface/transformers** | 3.8.x | Local embedding generation | Runs all-MiniLM-L6-v2 locally via ONNX; `pipeline("feature-extraction", ...)` API; no Python dependency; 384-dim vectors |
| **onnxruntime-node** | 1.24.x | ONNX inference runtime | Backend for @huggingface/transformers on Node.js; CPU inference; supports Node.js 22 |
| **BullMQ** | 5.69.x | Background job queue | Redis-based; scheduled jobs, retries, rate limiting, parent-child flows; ideal for consolidation daemon and decay recalculation |
| **zod** | 4.3.x | Schema validation | TypeScript-first; runtime validation for config, memory payloads, API boundaries; JSON Schema interop |

## Supporting Libraries

| Package | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **pino** | 10.3.x | Structured logging | 30,000+ lines/sec; JSON output; async I/O; TypeScript types built-in; use `pino-pretty` for dev only |
| **nanoid** | 5.x | ID generation | URL-safe, small, fast; good for memory IDs and correlation tokens |
| **mitt** or **eventemitter3** | 3.x / 5.x | In-process event bus | Lightweight pub/sub for internal plugin events; mitt is 200 bytes |
| **ms** | 2.1.x | Time string parsing | Parse human-readable durations ("5m", "1h") for TTL configs |
| **fast-cosine-similarity** | 1.x | Vector math fallback | 6x faster than compute-cosine-similarity; TypeScript support; for in-memory similarity when Redis unavailable |

## Development Tools

| Package | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **tsdown** | 0.20.x | Build/bundle | Successor to tsup (tsup no longer actively maintained); powered by Rolldown/Oxc; ESM-first; generates .d.ts; migration path from tsup |
| **vitest** | 4.0.x | Test framework | Native ESM + TypeScript; fast; Jest-compatible API; no config needed for most cases |
| **tsx** | 4.x | Dev runner | Run TypeScript directly; fast startup; ESM support; for development and scripts |
| **@biomejs/biome** | 1.x | Lint + format | Single tool replaces ESLint + Prettier; fast Rust-based; TypeScript-aware |
| **pino-pretty** | 13.x | Dev log formatting | Human-readable log output during development |
| **@types/better-sqlite3** | 7.x | SQLite type defs | TypeScript definitions for better-sqlite3 |
| **changesets** | (cli) | Versioning/publish | Manages changelogs and npm publishing for monorepo or standalone packages |

## Installation Commands

```bash
# Core dependencies
pnpm add redis better-sqlite3 sqlite-vec @huggingface/transformers onnxruntime-node bullmq zod pino nanoid mitt ms fast-cosine-similarity

# Dev dependencies
pnpm add -D typescript tsdown vitest tsx @biomejs/biome pino-pretty @types/better-sqlite3 @types/ms
```

## Project Structure (ESM-first npm package)

```
promem/
  package.json          # "type": "module", exports map
  tsconfig.json         # module: "NodeNext", target: "ES2024"
  tsdown.config.ts      # ESM output, .d.ts generation
  src/
    index.ts            # Public API surface
    config/             # Zod schemas, defaults
    core/               # Memory engine, activation scoring
    embeddings/         # Provider interface, local ONNX, remote adapter
    storage/
      redis/            # Redis backend (RediSearch vector index)
      sqlite/           # SQLite backend (sqlite-vec KNN)
      interface.ts      # Storage adapter contract
    pipeline/           # Write pipeline (extract, score, store)
    consolidation/      # BullMQ workers for decay, merge, prune
    sync/               # Redis pub/sub for cross-agent events
    types/              # Shared TypeScript types
  test/
  dist/                 # Build output (not in git)
```

### Key tsconfig.json settings

```jsonc
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

### Key package.json fields

```jsonc
{
  "name": "promem",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "engines": {
    "node": ">=22.0.0"
  }
}
```

## Architecture Notes for <200ms Retrieval

### Hot path (retrieval)
1. **Redis path**: `redis` client -> `FT.SEARCH` with KNN vector query -> deserialize -> return
   - Redis FT.SEARCH with pre-built HNSW index: typically <10ms for KNN on thousands of vectors
   - node-redis v5 uses dialect 2 by default for vector queries
   - Store embeddings as binary blobs in Redis hashes
2. **SQLite fallback path**: `better-sqlite3` -> `sqlite-vec` KNN via `vec0` virtual table -> return
   - Synchronous API avoids async overhead
   - sqlite-vec brute-force KNN is fast for <100k vectors
   - Wrap vectors in `Float32Array` and use `.buffer` for parameter binding
3. **In-memory similarity**: `fast-cosine-similarity` for small candidate sets after pre-filtering

### Cold path (write/consolidation)
- BullMQ queues for: embedding generation, consolidation, decay recalculation, pruning
- Worker threads (via BullMQ sandboxed processors) for CPU-heavy embedding work
- Redis pub/sub for cross-agent memory update notifications

### Embedding generation
- Default: `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Pipeline: `await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")`
- First call downloads and caches model (~23MB ONNX); subsequent calls are fast (~5-15ms per embedding on CPU)
- Remote override: accept any function matching `(text: string) => Promise<Float32Array>`

### Redis vector index creation

```typescript
// Schema for RediSearch vector index
await client.ft.create('idx:memories', {
  '$.embedding': {
    type: SchemaFieldTypes.VECTOR,
    AS: 'embedding',
    ALGORITHM: 'HNSW',
    TYPE: 'FLOAT32',
    DIM: 384,
    DISTANCE_METRIC: 'COSINE'
  },
  '$.content': { type: SchemaFieldTypes.TEXT, AS: 'content' },
  '$.userId': { type: SchemaFieldTypes.TAG, AS: 'userId' },
  '$.agentId': { type: SchemaFieldTypes.TAG, AS: 'agentId' }
}, { ON: 'JSON', PREFIX: 'memory:' });
```

### SQLite vector table creation

```typescript
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";

const db = new Database("memories.db");
sqliteVec.load(db);

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS vec_memories
  USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding float[384]
  )
`);
```

### Cross-agent sync pattern

```typescript
// Publisher (on memory write)
await redisClient.publish('memory:updates', JSON.stringify({
  type: 'memory:created',
  userId, agentId, memoryId, timestamp
}));

// Subscriber (other agents)
const sub = redisClient.duplicate();
await sub.subscribe('memory:updates', (message) => {
  const event = JSON.parse(message);
  // Invalidate local cache, trigger re-scoring, etc.
});
```

## Alternatives Considered

| Alternative | Evaluated For | Verdict | Reason |
|-------------|--------------|---------|--------|
| **ioredis** | Redis client | SKIP | Deprecated; maintenance-only; node-redis is officially recommended; ioredis lacks built-in RediSearch/vector helpers |
| **tsup** | Build tool | SKIP | No longer actively maintained; authors recommend tsdown as successor |
| **sqlite-vss** | SQLite vectors | SKIP | Deprecated; replaced by sqlite-vec; Faiss dependency made it hard to install |
| **node:sqlite** (builtin) | SQLite driver | WAIT | Experimental; sqlite-vec docs recommend Node.js >=23.5.0 for reliable extension loading; better-sqlite3 is proven today |
| **@xenova/transformers** | Embeddings | SKIP | Renamed to @huggingface/transformers in v3; old package name is v1/v2 only |
| **Transformers.js v4** | Embeddings | WAIT | Currently in preview (published under `next` tag); use v3 stable for now |
| **Jest** | Testing | SKIP | ESM support still awkward; slower than Vitest; Vitest 4.0 is the 2026 standard |
| **Winston** | Logging | SKIP | 10x slower than pino; heavier; pino is the performance choice |
| **Agenda / node-cron** | Job scheduling | SKIP | Agenda uses MongoDB; node-cron is in-process only; BullMQ is Redis-native and fits the existing Redis dependency |
| **chromadb** | Vector DB | SKIP | External server dependency; project needs embedded/in-process vector search |
| **Weaviate / Pinecone** | Vector DB | SKIP | Cloud-hosted; adds latency, cost, and external dependency; project needs local-first |
| **pgvector** | Vector search | SKIP | Requires PostgreSQL; project specifies Redis + SQLite only |
| **LangChain.js** | Orchestration | SKIP | Too heavy for a focused memory library; brings large dependency tree; better to use primitives directly |

## What NOT to Use

| Package/Approach | Why Not |
|-----------------|---------|
| **ioredis** | Deprecated/maintenance-only; no built-in RediSearch vector support |
| **sqlite-vss** | Deprecated; replaced by sqlite-vec |
| **@xenova/transformers** | Old package name; use @huggingface/transformers v3+ |
| **tsup** | No longer actively maintained |
| **node-sqlite3** (async) | Async API adds overhead; mutex thrashing; better-sqlite3 is faster |
| **compute-cosine-similarity** | 6x slower than fast-cosine-similarity |
| **ESLint + Prettier combo** | Biome replaces both in a single fast tool |
| **CommonJS output** | Node.js 22+ has full ESM support; ESM-only simplifies build; drop CJS unless proven consumer need |
| **jest** | Poor native ESM support; Vitest is the modern standard |
| **tensorflow.js** | Heavier than ONNX runtime for embedding inference; onnxruntime-node is lighter and faster for this use case |

## Version Compatibility Matrix

| Component | Minimum Version | Tested With | Notes |
|-----------|----------------|-------------|-------|
| Node.js | 22.0.0 | 22.x LTS | Required for ESM, perf; node:sqlite experimental but not used |
| TypeScript | 5.9.0 | 5.9.x | `module: "NodeNext"` required |
| Redis Server | 7.2+ (Redis Stack) | 7.4.x | RediSearch module required for FT.SEARCH vector queries |
| SQLite | 3.41+ | Bundled with better-sqlite3 | sqlite-vec requires recent SQLite |
| pnpm | 9.x | 9.x | Workspace support, strict dependency resolution |

## Key Risk Areas

1. **sqlite-vec is alpha (0.1.7-alpha.2)**: Last npm publish was ~1 year ago. GitHub is active but npm releases lag. Mitigation: pin version; wrap behind storage adapter interface; SQLite is fallback path anyway.
2. **onnxruntime-node native addon**: Requires native compilation on install. May cause issues in some CI/CD environments. Mitigation: use optional peer dependency; allow remote embedding provider as alternative.
3. **better-sqlite3 native addon**: Same native compilation concern. Mitigation: well-established with prebuilt binaries for most platforms.
4. **tsdown is pre-1.0 (0.20.x)**: Rapidly evolving. Mitigation: tsup (8.5.1) still works if tsdown causes issues; migration path is straightforward.

## Sources

### HIGH Confidence (official docs, npm registry, verified)
- [redis npm package v5.10.0](https://www.npmjs.com/package/redis) -- Official Redis Node.js client
- [Redis vector search Node.js docs](https://redis.io/docs/latest/develop/clients/nodejs/vecsearch/) -- Official Redis documentation, updated Dec 2025
- [better-sqlite3 npm v12.6.x](https://www.npmjs.com/package/better-sqlite3) -- npm registry, actively maintained
- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec) -- Official repo, MIT/Apache-2.0
- [sqlite-vec Node.js usage](https://alexgarcia.xyz/sqlite-vec/js.html) -- Official docs by author
- [@huggingface/transformers npm v3.8.x](https://www.npmjs.com/package/@huggingface/transformers) -- Official HuggingFace package
- [Transformers.js docs](https://huggingface.co/docs/transformers.js/index) -- Official HuggingFace documentation
- [onnxruntime-node npm v1.24.x](https://www.npmjs.com/package/onnxruntime-node) -- Microsoft official package
- [BullMQ npm v5.69.x](https://www.npmjs.com/package/bullmq) -- npm registry
- [BullMQ docs](https://docs.bullmq.io) -- Official documentation
- [Vitest 4.0 release](https://vitest.dev/blog/vitest-4) -- Official Vitest blog
- [TypeScript 5.9 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) -- Official TypeScript docs
- [zod npm v4.3.x](https://www.npmjs.com/package/zod) -- npm registry
- [pino npm v10.3.x](https://www.npmjs.com/package/pino) -- npm registry
- [tsdown npm v0.20.x](https://www.npmjs.com/package/tsdown) -- npm registry
- [tsdown migration from tsup](https://tsdown.dev/guide/migrate-from-tsup) -- Official tsdown docs
- [ioredis deprecation/migration](https://redis.io/docs/latest/develop/clients/nodejs/migration/) -- Official Redis migration guide

### MEDIUM Confidence (well-known tech blogs, cross-verified)
- [TypeScript ESM npm packages tutorial (2ality)](https://2ality.com/2025/02/typescript-esm-packages.html) -- Dr. Axel Rauschmayer, well-known authority
- [TypeScript ESM/CJS publishing challenges (Liran Tal)](https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing) -- Node.js security WG member
- [Set up TypeScript project in 2026](https://thelinuxcode.com/set-up-a-typescript-project-in-2026-node-tsconfig-and-a-clean-build-pipeline/) -- Recent guide, cross-verified with official docs
- [fast-cosine-similarity npm](https://www.npmjs.com/package/fast-cosine-similarity) -- npm registry, small package
- [BullMQ + Worker Threads scaling](https://medium.com/@shresthaayush49/mastering-scalable-background-processing-in-node-js-pm2-bullmq-worker-threads-351ec3a020d5) -- Medium article, Dec 2025

### LOW Confidence (unverified, community sources)
- sqlite-vec npm publish frequency -- Last publish was ~1 year ago per npm; GitHub may be more active
- onnxruntime-node + Node.js 22 specific compatibility -- Docs say v12.x+ minimum but no explicit Node 22 test matrix found
- Embedding latency claims (5-15ms per embedding) -- Varies by hardware; not independently benchmarked for this research
- tsdown stability for production use -- Pre-1.0 software; consider tsup 8.5.1 as fallback
