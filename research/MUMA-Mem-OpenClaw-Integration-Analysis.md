# MUMA-Mem → OpenClaw Plugin Integration Analysis

## Executive Summary

MUMA-Mem maps remarkably well onto OpenClaw's plugin architecture. OpenClaw already has a **memory slot system** (`kind: "memory"`) where exactly one memory plugin is active at a time (currently `memory-core`). MUMA-Mem would replace this slot. The five MUMA-Mem layers map cleanly to OpenClaw's plugin registration mechanisms.

---

## Layer-to-Plugin Mapping

| MUMA-Mem Layer | OpenClaw Mechanism | Notes |
|---|---|---|
| **L1: Agent Local Memory** | `on("session_start")` / `on("session_end")` + in-process state | Per-session ephemeral memory with ACT-R activation |
| **L2: User Shared Memory** | `registerTool()` (memory_write, memory_query, etc.) | Replaces `memory-core`'s memory_search/memory_get |
| **L3: Knowledge Commons** | `registerGatewayMethod()` + `registerHttpRoute()` | Team-scoped shared state via gateway RPC |
| **L4: Memory Manager** | `registerService()` | Background daemon with start/stop lifecycle |
| **L5: MCP Bridge** | Native — OpenClaw tools ARE the MCP interface | No separate MCP servers needed |

---

## Hook Integration Points

OpenClaw's 14 typed lifecycle hooks cover every MUMA-Mem trigger point:

| MUMA-Mem Event | OpenClaw Hook | What Happens |
|---|---|---|
| Agent starts, needs context | `before_agent_start` | Query L2 with visibility gate (filter by agent role permissions) + domain boost, inject relevant memories into `prependContext` |
| Agent session ends | `session_end` | Promote surviving L1 memories to L2 via write pipeline |
| Message arrives | `message_received` | Capture as episodic memory candidate |
| Agent generates response | `message_sending` | Optionally enrich with memory context |
| Tool is called | `after_tool_call` | Record tool usage as experiential memory |
| Context compacted | `after_compaction` | Opportunity to persist memories that would be lost |
| Gateway starts | `gateway_start` | Start the Memory Manager daemon (decay sweeps, consolidation) |
| Gateway stops | `gateway_stop` | Flush Redis state to filesystem, stop daemon |

---

## Plugin Structure

```
extensions/memory-muma/
├── package.json                    # @openclaw/memory-muma
├── openclaw.plugin.json            # kind: "memory", configSchema
├── index.ts                        # Plugin entry, register()
├── config.ts                       # Zod schema for plugin config
├── layers/
│   ├── local.ts                    # L1: In-process agent memory + ACT-R activation
│   ├── shared.ts                   # L2: User shared memory (Redis-backed)
│   ├── commons.ts                  # L3: Knowledge Commons
│   └── manager.ts                  # L4: Daemon processes (decay, consolidation, sync)
├── pipeline/
│   ├── write.ts                    # Extract → Construct (incl. visibility) → Retrieve → Decide → Link → Evolve
│   ├── read.ts                     # Visibility gate → activation-weighted scoring + domain boost → link expansion
│   └── conflict.ts                 # Compatible/contradictory/subsumes resolution
├── visibility/
│   ├── gate.ts                     # Hard visibility filter (open/scoped/private/user-only)
│   ├── rules.ts                    # Domain-level visibility rules, longest-prefix matching
│   └── classify.ts                 # LLM visibility classification for CONSTRUCT step
├── activation/
│   ├── actr.ts                     # B(m) + w * cos_sim + noise
│   └── decay.ts                    # Ebbinghaus forgetting curves, adaptive half-life
├── tools/
│   ├── memory-write.ts             # memory.write tool
│   ├── memory-query.ts             # memory.query tool
│   ├── memory-forget.ts            # memory.forget tool
│   ├── memory-context.ts           # memory.get_context tool
│   ├── memory-pin.ts               # memory.pin tool
│   ├── memory-set-visibility.ts    # memory.set_visibility tool
│   └── memory-stats.ts             # memory.stats tool
├── sync/
│   ├── redis-fs.ts                 # Bidirectional Redis ↔ filesystem sync
│   └── pubsub.ts                   # Cross-agent synchronization
└── cli/
    └── memory-cli.ts               # CLI subcommands (stats, export, consolidate, conflicts)
```

---

## Key Integration Considerations

### 1. Redis Dependency — The Biggest Friction Point

OpenClaw's existing memory uses **sqlite-vec** (or LanceDB via a plugin) for vector search. MUMA-Mem assumes Redis + RediSearch. Options:

- **Option A: Redis as required dependency** — Add Redis to MUMA-Mem's config schema. The plugin starts Redis on `gateway_start` or expects it running. Cleanest implementation, but adds operational burden.
- **Option B: Abstract the storage backend** — Use an interface (`MemoryStore`) with Redis as default and sqlite-vec as fallback. Loses pub/sub for cross-agent sync but works single-user without Redis.
- **Option C: Redis for hot path, SQLite for persistence** — Use Redis when available (multi-user, team mode) and fall back to SQLite + filesystem for single-user VPS deployments.

### 2. Embedding Model Mismatch

OpenClaw's memory system uses whatever embedding provider is configured (OpenAI, Gemini, etc.). MUMA-Mem specifies **all-MiniLM-L6-v2** (local, 384-dim). The plugin should:

- Ship with or require a local SBERT model for the activation function
- Use `api.runtime.config` to check existing embedding provider and bridge or replace it

### 3. The `MemorySearchManager` Interface Gap

OpenClaw's existing memory contract (`src/memory/types.ts`) expects `search()`, `readFile()`, `status()`, `sync()`, etc. MUMA-Mem's retrieval is fundamentally different (activation-weighted, not just cosine similarity). The plugin would need to either:

- Implement `MemorySearchManager` as a compatibility shim (wrapping MUMA-Mem's read pipeline)
- Or bypass it entirely by registering its own tools and hooks, which is allowed since `kind: "memory"` claims the slot exclusively

### 4. Multi-User Identity Mapping

MUMA-Mem has explicit `user_id` and `agent_id` fields. OpenClaw provides these via:

- `ctx.sessionKey` (session-scoped identity)
- `ctx.config` (user profile config)
- `PluginHookAgentContext.agentId` (in hooks)

The plugin needs to map OpenClaw's session/account model to MUMA-Mem's user/agent model.

### 5. LLM Calls in the Write Pipeline

MUMA-Mem needs 3 LLM calls per memory write (construct, decide, evolve). OpenClaw provides model access through the agent runtime, but the plugin would need its own LLM client for background operations (consolidation daemon running outside agent sessions). The config schema should accept a model provider/key for background processing.

### 6. The `before_agent_start` Hook Is the Critical Path

This is where MUMA-Mem's value is delivered — injecting relevant memories into the agent's system prompt. The hook returns `{ prependContext: string }`. The plugin must:

- Resolve the agent's memory profile from `PluginHookAgentContext.agentId` using `agentMemory` config (falling back to `defaultAgentMemory` for unlisted agents)
- Apply the **visibility gate** (hard filter): remove all memories the agent cannot see based on its role's visibility permissions (`open` always passes; `scoped` requires domain match; `private` requires `can_see_private`; `user-only` always blocked)
- Score remaining memories with activation-weighted similarity + **domain boost** for the agent's primary domains
- Retrieve top-k
- Expand links (1-hop), applying the visibility gate again on linked notes
- Format results as a compact context package
- All within a reasonable latency budget (the hook runs before the agent can respond)

---

## Config Schema

```json
{
  "id": "memory-muma",
  "kind": "memory",
  "configSchema": {
    "type": "object",
    "properties": {
      "redis": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "default": "redis://localhost:6379" },
          "prefix": { "type": "string", "default": "muma:" }
        }
      },
      "embedding": {
        "type": "object",
        "properties": {
          "model": { "type": "string", "default": "all-MiniLM-L6-v2" },
          "provider": { "type": "string", "enum": ["local", "openai", "config"], "default": "local" }
        }
      },
      "activation": {
        "type": "object",
        "properties": {
          "contextWeight": { "type": "number", "default": 11.0 },
          "noiseStddev": { "type": "number", "default": 1.2 },
          "decayParameter": { "type": "number", "default": 0.5 },
          "retrievalThreshold": { "type": "number", "default": 0.0 }
        }
      },
      "consolidation": {
        "type": "object",
        "properties": {
          "intervalHours": { "type": "number", "default": 24 },
          "llmModel": { "type": "string", "description": "Model for background processing" }
        }
      },
      "decay": {
        "type": "object",
        "properties": {
          "sweepIntervalMinutes": { "type": "number", "default": 60 },
          "pruneThreshold": { "type": "number", "default": -2.0 },
          "hardPruneThreshold": { "type": "number", "default": -5.0 }
        }
      },
      "sync": {
        "type": "object",
        "properties": {
          "intervalMinutes": { "type": "number", "default": 15 },
          "memoryDir": { "type": "string", "description": "Override ~/clawd/memory/ path" }
        }
      },
      "visibility": {
        "type": "object",
        "description": "Two-axis access control: domain for relevance, visibility for permissions",
        "properties": {
          "defaultVisibility": {
            "type": "string",
            "enum": ["open", "scoped", "private", "user-only"],
            "default": "scoped"
          },
          "domainRules": {
            "type": "object",
            "description": "Domain-level visibility overrides (longest-prefix match). Overrides LLM classification.",
            "additionalProperties": {
              "type": "string",
              "enum": ["open", "scoped", "private", "user-only"]
            },
            "default": {
              "personal/health": "private",
              "personal/finance": "private",
              "personal/preferences": "open",
              "personal/location": "open",
              "skills": "open"
            }
          },
          "domainBoost": {
            "type": "number",
            "description": "Activation score bonus for memories matching the agent's primary domains",
            "default": 1.0
          }
        }
      },
      "agentMemory": {
        "type": "object",
        "description": "Per-agent memory access profiles. Keys are agent IDs from agents.list[]. Agents not listed here inherit defaultAgentMemory. The plugin reads agents.list[] from api.config to discover all agents — no need to re-declare them.",
        "additionalProperties": {
          "type": "object",
          "properties": {
            "domains": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Memory domains this agent's scoped memories are drawn from. Also used for domain_boost in scoring."
            },
            "canSeePrivate": {
              "type": "boolean",
              "default": false,
              "description": "Whether this agent can see private-visibility memories."
            }
          },
          "required": ["domains"]
        },
        "examples": {
          "main": { "domains": ["*"], "canSeePrivate": true },
          "family": { "domains": ["personal/family", "personal/preferences"] },
          "work": { "domains": ["business/coding", "business/research", "skills"] }
        }
      },
      "defaultAgentMemory": {
        "type": "object",
        "description": "Memory access profile for agents not explicitly listed in agentMemory. Applied to any agent from agents.list[] that has no specific config.",
        "properties": {
          "domains": { "type": "array", "items": { "type": "string" }, "default": ["*"] },
          "canSeePrivate": { "type": "boolean", "default": false }
        }
      },
      "commons": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean", "default": false },
          "promotionIntervalDays": { "type": "number", "default": 7 }
        }
      }
    }
  }
}
```

---

## Multi-Agent Routing Integration

OpenClaw's multi-agent system (`agents.list[]` + `bindings[]`) handles channel-to-agent routing before MUMA-Mem is ever invoked. This means:

1. **MUMA-Mem never sees channels** — by the time `before_agent_start` fires, OpenClaw has already resolved which agent handles the request. The plugin only sees `agentId`, not the WhatsApp group or Discord channel that triggered it.

2. **Agent identity is the only key** — the `agentId` from `PluginHookAgentContext` maps directly to an `agentMemory` entry. No need to reason about bindings, providers, or peer matching.

3. **No redundant agent declarations** — the plugin reads `agents.list[]` from `api.config` to discover all agents. Memory profiles in `agentMemory` reference these by ID. Agents not listed in `agentMemory` get the `defaultAgentMemory` profile.

**Example: how it flows end-to-end**

```
User config:
  agents.list = [
    { id: "main",   name: "Personal Assistant", ... },
    { id: "family", name: "Family Bot",         ... },
    { id: "work",   name: "Work Agent",         ... }
  ]
  bindings = [
    { agentId: "family", match: { provider: "whatsapp", peer: { id: "family-group" } } },
    { agentId: "work",   match: { provider: "slack" } }
  ]

MUMA-Mem plugin config:
  agentMemory = {
    "main":   { domains: ["*"],                          canSeePrivate: true  },
    "family": { domains: ["personal/family", "personal/preferences"]          },
    "work":   { domains: ["business", "skills", "docs"]                       }
  }
  visibility.domainRules = {
    "personal/health":  "private",
    "personal/finance": "private",
    "personal/preferences": "open"
  }

What happens when a message arrives from the family WhatsApp group:
  1. OpenClaw binding resolves → agentId: "family"
  2. before_agent_start fires with agentId: "family"
  3. Plugin looks up agentMemory["family"] → domains: ["personal/family", "personal/preferences"]
  4. Visibility gate: "family" sees open memories (all) + scoped in its domains only
  5. "User is based in Berlin" (open) → included
  6. "User prefers dark mode" (open, personal/preferences) → included
  7. "Acme Corp deal closed" (scoped, business/sales) → filtered out (domain mismatch)
  8. "Therapy appointment Thursday" (private, personal/health) → filtered out (canSeePrivate: false)
  9. Relevant memories injected into prependContext

What happens when a message arrives from Slack:
  1. OpenClaw binding resolves → agentId: "work"
  2. before_agent_start fires with agentId: "work"
  3. Plugin looks up agentMemory["work"] → domains: ["business", "skills", "docs"]
  4. "User is based in Berlin" (open) → included
  5. "Deploy script uses blue-green strategy" (scoped, business/coding) → included
  6. "Family dinner plans" (scoped, personal/family) → filtered out
  7. "Therapy appointment Thursday" (private) → filtered out
```

The binding system and the visibility model are **complementary, non-overlapping layers**: bindings decide *which agent runs*, visibility decides *which memories that agent sees*. Neither needs to know about the other.

---

## What Works Well

1. **Exclusive memory slot** — `kind: "memory"` means MUMA-Mem cleanly replaces memory-core without conflict
2. **Service lifecycle** — `registerService` with `start()`/`stop()` maps perfectly to the Memory Manager daemon
3. **Rich hook system** — All 14 hooks cover every MUMA-Mem trigger point
4. **Tool factory pattern** — `registerTool((ctx) => ...)` gives per-session context (agent ID, session key) needed for visibility-aware retrieval. The agent ID maps to a memory profile (`agentMemory` config), which determines visibility permissions and domain boost.
5. **CLI registration** — `registerCli` gives access to Commander.js for memory stats, export, manual consolidation
6. **HTTP routes** — `registerHttpRoute` enables a monitoring dashboard for memory stats/conflicts
7. **Plugin config with JSON Schema** — MUMA-Mem's many tunable parameters (activation weights, decay thresholds, intervals) fit naturally into the config schema with validation

---

## What Needs Extension or Workaround

1. **No native Redis support** — Must be added as a plugin dependency or abstracted behind a storage interface
2. **No background scheduler in plugin runtime** — `registerService` gives start/stop but no built-in cron; the plugin must bring its own scheduler (e.g., `setInterval` or a lightweight scheduler library)
3. **No inter-plugin communication** — If a separate orchestrator plugin exists, there's no direct plugin-to-plugin API. Would need to use the internal hook system or gateway methods as intermediary
4. **No user approval workflow** — Knowledge promotion (L4 → L3) requires user consent. OpenClaw's `registerCommand` could handle `/approve-promotion` commands, but there's no built-in approval queue UI
5. **Embedding model runtime** — Running all-MiniLM-L6-v2 locally requires ONNX Runtime or similar. The plugin would need to bundle or require this as a native dependency, similar to how OpenClaw handles `sqlite-vec`
6. **Visibility classification reliability** — The CONSTRUCT step's LLM call now classifies visibility in addition to keywords, tags, and context. LLM misclassification could expose private data to the wrong agent or over-restrict useful memories. Mitigation: domain-level visibility rules (longest-prefix match) override LLM classification, so users can set blanket policies like `personal/health → private` that don't depend on per-memory LLM judgment. The LLM classification is only the fallback when no domain rule matches.
