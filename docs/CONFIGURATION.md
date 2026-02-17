# Configuration Reference

All configuration goes in the `config` block of your `openclaw.json` plugin entry. Every field is optional and has a sensible default.

```json
{
  "plugins": {
    "entries": {
      "memory-muma": {
        "config": {
          ...
        }
      }
    }
  }
}
```

For standalone CLI usage, the same structure goes in `.muma.json` (searched in current directory, then home directory).

---

## `redis`

Redis connection settings. MUMA-Mem tries Redis first; if unavailable, falls back to SQLite.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | `"redis://localhost:6379"` | Redis connection URL. Supports `redis://` and `rediss://` (TLS) protocols. Set to empty string to skip Redis entirely. |
| `prefix` | `string` | `"muma:"` | Key prefix for all Redis keys. Useful for sharing a Redis instance across multiple applications. |

```json
{
  "redis": {
    "url": "redis://localhost:6379",
    "prefix": "muma:"
  }
}
```

Requires Redis Stack 7.2+ with the RediSearch module for vector search.

---

## `sqlite`

SQLite fallback settings. Used automatically when Redis is unavailable.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | `string` | `"~/.openclaw/memory-muma.db"` | Path to the SQLite database file. Created automatically if it doesn't exist. |

```json
{
  "sqlite": {
    "path": "~/.openclaw/memory-muma.db"
  }
}
```

Uses `better-sqlite3` with `sqlite-vec` extension for vector search.

---

## `embedding`

Embedding model for vector search and semantic similarity.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | `"local"` \| `"openai"` | `"local"` | Embedding provider. `"local"` runs the model in-process via HuggingFace Transformers. `"openai"` calls the OpenAI embeddings API. |
| `model` | `string` | `"Xenova/all-MiniLM-L6-v2"` | Model identifier. For `"local"`: any HuggingFace model ID. For `"openai"`: an OpenAI embedding model name (e.g. `"text-embedding-3-small"`). |
| `apiKey` | `string` | _(none)_ | API key. Required when `provider` is `"openai"`. |
| `baseUrl` | `string` | _(none)_ | Custom API base URL. Allows using OpenAI-compatible APIs (e.g. Azure OpenAI, local inference servers). |
| `dimensions` | `number` | _(auto-detected)_ | Embedding vector dimensions. Auto-detected from the model on first use. Only set this if you need to override detection. |

```json
{
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2"
  }
}
```

The system validates embedding dimensions on startup (STORE-05). If existing stored embeddings have a different dimension than the current model, startup fails with a clear error.

---

## `llm`

LLM provider for the write pipeline (fact extraction, deduplication decisions, note evolution) and consolidation.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `provider` | `string` | _(none)_ | LLM provider identifier (e.g. `"openai"`). |
| `model` | `string` | _(none)_ | Model name (e.g. `"gpt-4o-mini"`, `"claude-sonnet-4-5-20250929"`). |
| `apiKey` | `string` | _(none)_ | API key for the provider. |
| `baseUrl` | `string` | _(none)_ | Custom API base URL. Allows using any OpenAI-compatible API endpoint. |
| `temperature` | `number` | `0.7` | Sampling temperature. Lower values (0.0-0.3) produce more deterministic output. Higher values (0.7-1.0) produce more varied output. |
| `maxTokens` | `number` | `1024` | Maximum tokens per LLM response. |

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "temperature": 0.7,
    "maxTokens": 1024
  }
}
```

**Optional.** Without an LLM, MUMA-Mem still provides search, context injection, and working memory. The write pipeline (fact extraction, dedup, evolution) and consolidation are disabled.

---

## `activation`

ACT-R cognitive architecture parameters for memory retrieval scoring.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `contextWeight` | `number` | `11.0` | Spreading activation weight (`w`). Controls how strongly query-memory similarity boosts activation. Higher values make retrieval more context-sensitive. |
| `noiseStddev` | `number` | `1.2` | Standard deviation of Gaussian noise (`sigma`). Adds stochastic variation to recall. `0` disables noise (deterministic retrieval). Higher values make retrieval more varied. |
| `decayParameter` | `number` | `0.5` | Power-law decay exponent (`d`). Controls how quickly activation decays with time. `0.5` is the standard ACT-R value. Higher values cause faster forgetting. |
| `retrievalThreshold` | `number` | `0.0` | Minimum activation score for retrieval. Memories below this threshold are effectively "forgotten" (not returned in search, but not deleted). Lower values retrieve more memories. |

```json
{
  "activation": {
    "contextWeight": 11.0,
    "noiseStddev": 1.2,
    "decayParameter": 0.5,
    "retrievalThreshold": 0.0
  }
}
```

**Activation formula:** `A(m) = B(m) + S(m) + noise`
- Base-level `B(m) = ln(sum(t_now - t_i)^(-d))` over all access timestamps
- Spreading `S(m) = w * cos_sim(query, embedding)`
- Noise ~ `N(0, sigma^2)`

---

## `decay`

Ebbinghaus forgetting curve parameters for background decay sweeps.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sweepIntervalMinutes` | `number` | `60` | How often the background decay sweep runs, in minutes. Each sweep recalculates activation scores and prunes low-activation memories. |
| `pruneThreshold` | `number` | `-2.0` | Soft prune threshold. Memories with activation below this become candidates for pruning. They are flagged but not immediately deleted. |
| `hardPruneThreshold` | `number` | `-5.0` | Hard prune threshold. Memories with activation below this are deleted during the sweep. Must be lower than `pruneThreshold`. |
| `minAgeHours` | `number` | `72` | Minimum age before a memory can be pruned, in hours. Protects recently created memories from premature deletion. |
| `maxAgeHours` | `number` | `720` | Maximum age for adaptive half-life calculation, in hours (720 = 30 days). Memories older than this use the maximum half-life. |

```json
{
  "decay": {
    "sweepIntervalMinutes": 60,
    "pruneThreshold": -2.0,
    "hardPruneThreshold": -5.0,
    "minAgeHours": 72,
    "maxAgeHours": 720
  }
}
```

**How decay works:** Each memory has an adaptive half-life that increases with successful retrieval (reinforcement). The sweep recalculates activation using the Ebbinghaus curve and current access history. Pinned memories are exempt from decay.

---

## `visibility`

Access control for multi-agent environments.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `defaultVisibility` | `"open"` \| `"scoped"` \| `"private"` \| `"user-only"` | `"scoped"` | Default visibility for new memories. |
| `domainRules` | `Record<string, Visibility>` | `{}` | Per-domain visibility overrides. Keys are domain names, values are visibility levels. Uses longest-prefix matching. |
| `domainBoost` | `number` | `1.0` | Activation boost for memories matching the querying agent's domain. Higher values prefer domain-relevant memories. |

```json
{
  "visibility": {
    "defaultVisibility": "scoped",
    "domainRules": {
      "finance": "private",
      "health": "user-only",
      "code": "open"
    },
    "domainBoost": 1.0
  }
}
```

**Visibility levels:**

| Level | Who can read |
|-------|-------------|
| `open` | All agents for this user |
| `scoped` | Agents in the same domain |
| `private` | Only the agent that created the memory |
| `user-only` | Only the human user (no agents) |

The visibility gate runs before scoring — unauthorized memories are never returned in search results.

---

## `agentMemory`

Per-agent memory profiles. Keys are agent IDs.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `domains` | `string[]` | _(required)_ | Domains this agent can access. Controls which memories are visible via domain-scoped access. |
| `canSeePrivate` | `boolean` | `false` | Whether this agent can see `"private"` memories from other agents. |

```json
{
  "agentMemory": {
    "code-agent": {
      "domains": ["code", "devops"],
      "canSeePrivate": false
    },
    "research-agent": {
      "domains": ["research", "papers"],
      "canSeePrivate": false
    }
  }
}
```

Agents not listed here use the `defaultAgentMemory` profile.

---

## `defaultAgentMemory`

Fallback profile for agents not listed in `agentMemory`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `domains` | `string[]` | `["*"]` | Domains this agent can access. `["*"]` means all domains. |
| `canSeePrivate` | `boolean` | `false` | Whether unlisted agents can see `"private"` memories. |

```json
{
  "defaultAgentMemory": {
    "domains": ["*"],
    "canSeePrivate": false
  }
}
```

---

## `identityMap`

Cross-channel identity mapping. Lets the same person using multiple channels share one memory store.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| _(key)_ | `string` | — | Canonical user name. This becomes the `userId` for all matched identities. |
| _(value)_ | `string[]` | — | List of channel identities that resolve to this user. Format: `"channel:id"` (e.g. `"telegram:12345"`, `"discord:98765"`, `"slack:U456"`). |

```json
{
  "identityMap": {
    "alice": ["telegram:12345", "discord:98765"],
    "bob": ["slack:U456", "telegram:67890"]
  }
}
```

**How it works:** At startup, the identity map is inverted into a reverse lookup (`telegram:12345` -> `alice`). Every `deriveUserId` call checks this map first. If the raw channel identity is found, the canonical name is returned instead.

**Validation:** Each channel identity must appear in exactly one group. If the same identity appears under multiple users, startup fails with a clear error message.

**Without `identityMap`:** Each channel identity gets its own isolated memory store. `telegram:12345` and `discord:98765` would be treated as separate users.

---

## Full example

```json
{
  "redis": {
    "url": "redis://localhost:6379",
    "prefix": "muma:"
  },
  "sqlite": {
    "path": "~/.openclaw/memory-muma.db"
  },
  "embedding": {
    "provider": "local",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "temperature": 0.7,
    "maxTokens": 1024
  },
  "activation": {
    "contextWeight": 11.0,
    "noiseStddev": 1.2,
    "decayParameter": 0.5,
    "retrievalThreshold": 0.0
  },
  "decay": {
    "sweepIntervalMinutes": 60,
    "pruneThreshold": -2.0,
    "hardPruneThreshold": -5.0,
    "minAgeHours": 72,
    "maxAgeHours": 720
  },
  "visibility": {
    "defaultVisibility": "scoped",
    "domainRules": {
      "finance": "private",
      "health": "user-only"
    },
    "domainBoost": 1.0
  },
  "identityMap": {
    "alice": ["telegram:12345", "discord:98765"],
    "bob": ["slack:U456"]
  },
  "agentMemory": {
    "code-agent": {
      "domains": ["code", "devops"],
      "canSeePrivate": false
    }
  },
  "defaultAgentMemory": {
    "domains": ["*"],
    "canSeePrivate": false
  }
}
```
