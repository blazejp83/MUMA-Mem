# MUMA-Mem

Multi-user multi-agent memory system for [OpenClaw](https://github.com/nichochar/openclaw). Replaces the default file-backed memory with an intelligent, layered architecture featuring ACT-R activation scoring, Ebbinghaus forgetting curves, Zettelkasten-style note linking, and automatic consolidation.

## How It Works

Agents automatically receive the right memories at the right time without explicit tool calls. Memories are:

- **Scoped** by domain and visibility (open / scoped / private / user-only)
- **Ranked** by ACT-R activation (base-level + spreading + stochastic noise)
- **Decayed** by Ebbinghaus adaptive half-life forgetting
- **Consolidated** from episodes into durable knowledge via nightly "sleep cycles"

### Memory Layers

| Layer | Scope | Purpose |
|-------|-------|---------|
| L1 Working Memory | Per-session, in-process | Ephemeral scratchpad with activation-based promotion |
| L2 User Shared | Per-user, persistent | Zettelkasten note store with semantic search |
| L3 Knowledge Commons | Cross-agent | Transactive memory index, pub/sub coordination |
| L4 Daemon | Background | Decay sweeps, consolidation, conflict detection |
| L5 Plugin | OpenClaw integration | Hooks, tools, CLI, lifecycle management |

## Installation

### Via OpenClaw CLI (recommended)

```bash
openclaw plugins install @risitech/memory-muma
```

This downloads the package from npm, installs it to `~/.openclaw/extensions/memory-muma/`, installs dependencies, and enables it in your config automatically.

### For local development

```bash
# Link from a local checkout (changes reflect immediately, no copy)
openclaw plugins install --link /path/to/promem

# Or add as a workspace dependency
pnpm add @risitech/memory-muma
```

Requires Node.js 22+.

### Storage Backends

**Redis** (recommended) — full features including real-time cross-agent sync:

```bash
# Requires Redis Stack 7.2+ with RediSearch module
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest
```

**SQLite** (zero-dependency fallback) — works without Redis, uses polling-based sync:

```bash
# No setup needed — creates ~/.openclaw/memory-muma.db automatically
```

## Plugin Setup

After installation, configure in your `openclaw.json`:

```json
{
  "plugins": {
    "enabled": true,
    "slots": {
      "memory": "memory-muma"
    },
    "entries": {
      "memory-muma": {
        "enabled": true,
        "config": {
          "embedding": {
            "provider": "local",
            "model": "Xenova/all-MiniLM-L6-v2"
          },
          "llm": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "apiKey": "sk-..."
          }
        }
      }
    }
  }
}
```

The LLM config is optional — without it, the system runs without the write pipeline and consolidation.

The plugin ships with an `openclaw.plugin.json` manifest, so OpenClaw auto-discovers it from `node_modules` without extra path configuration.

## Configuration

All settings have sensible defaults. Override what you need in the `config` block:

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
  "agentMemory": {
    "code-agent": {
      "domains": ["code", "devops"],
      "canSeePrivate": false
    }
  }
}
```

## Agent Tools

10 tools are registered automatically when the plugin loads. Each agent session receives its own tool instances scoped to the correct userId and agentId.

| Tool | Description |
|------|-------------|
| `memory_write` | Store a memory with automatic deduplication |
| `memory_query` | Search memories by semantic similarity |
| `memory_forget` | Mark a memory for forgetting |
| `memory_pin` | Pin a memory (exempt from decay) |
| `memory_set_visibility` | Change memory visibility level |
| `memory_get_context` | Get current session context (L1 + L2) |
| `memory_stats` | Get memory statistics for the user |
| `memory_link` | Create explicit links between notes |
| `memory_search_agents` | Query transactive memory index |
| `memory_consolidate` | Trigger manual consolidation |

## Lifecycle Hooks

The plugin registers 9 hooks into OpenClaw's lifecycle:

| Hook | What it does |
|------|-------------|
| `gateway_start` | Initialize storage, embeddings, LLM, event bus, sync, and background schedulers |
| `session_start` | Create L1 working memory and map sessionKey to sessionId |
| `before_agent_start` | Inject combined L1 + L2 memory context into the agent prompt |
| `message_received` | Capture user messages as episodic memories in L2 |
| `after_tool_call` | Capture tool results in L1 (working memory) and L2 (persistent) |
| `before_compaction` | Promote high-activation L1 items to L2 (session continues) |
| `before_reset` | Promote all L1 items to L2 and clear working memory |
| `session_end` | Promote remaining L1 items and clean up session state |
| `gateway_stop` | Shut down all subsystems and release resources |

## CLI

### Standalone

Direct memory management without running OpenClaw:

```bash
# Show memory counts, activation distribution, and domains
muma stats --user alice

# Export memories to JSON
muma export --user alice --output memories.json

# Trigger manual consolidation
muma consolidate --user alice

# List detected conflicts
muma conflicts --user alice --all
```

The standalone CLI reads config from `.muma.json` in the current directory or home directory.

### OpenClaw Subcommands

When loaded as a plugin, the same commands are available under `openclaw memory`:

```bash
openclaw memory stats --user alice
openclaw memory export --user alice --output memories.json
openclaw memory consolidate --user alice
openclaw memory conflicts --user alice --all
```

## Architecture

### Write Pipeline

When new information arrives, MUMA-Mem processes it through six stages:

1. **Extract** — LLM extracts discrete facts from raw input
2. **Construct** — Creates note objects with metadata, tags, visibility
3. **Retrieve** — Finds existing similar notes via vector search
4. **Decide** — LLM decides: ADD new, UPDATE existing, DELETE obsolete, or NOOP
5. **Link** — Connects related notes via vector similarity
6. **Evolve** — LLM enriches context of linked notes

### Activation Scoring

Memory retrieval uses ACT-R cognitive architecture:

- **Base-level activation**: `B(m) = ln(sum(t - t_i)^(-d))` — frequently/recently accessed memories score higher
- **Spreading activation**: `w * cos_sim(query, embedding)` — contextually relevant memories get boosted
- **Stochastic noise**: Gaussian noise (sigma=1.2) for natural recall variation — not every retrieval returns the same results

Memories below the retrieval threshold are effectively "forgotten" but not deleted until the background daemon prunes them.

### Background Intelligence

- **Decay sweeps** run every 60 minutes (configurable), pruning memories whose activation has fallen below threshold
- **Consolidation** runs daily, clustering related episodic memories into durable knowledge summaries
- **Conflict detection** identifies contradictory memories across agents and flags them for resolution

### Filesystem Sync

Memories are bidirectionally synced to `~/clawd/memory/` as human-readable markdown files with YAML frontmatter. You can inspect, edit, or add memories directly through the filesystem.

## Project Structure

```
src/
├── access/          # Visibility rules, transactive memory index
├── activation/      # ACT-R scoring, Ebbinghaus decay, activation tracking
├── cli/             # Standalone CLI + OpenClaw CLI registrar
├── consolidation/   # Clustering, conflict detection, summarization
├── daemon/          # Background sweep and consolidation schedulers
├── embedding/       # Local (HuggingFace) and remote embedding providers
├── llm/             # LLM provider abstraction (OpenAI-compatible)
├── memory/          # L1 working memory implementation
├── pipeline/        # 6-stage write pipeline + read/search pipeline
├── store/           # Redis and SQLite storage backends
├── sync/            # Event bus + filesystem sync
├── types/           # Core types, note schema, OpenClaw SDK types
├── utils/           # userId derivation, shared utilities
├── config.ts        # Zod config schema with defaults
├── index.ts         # Plugin definition export
└── plugin.ts        # Hook handlers and registration logic
```

## Development

```bash
# Install dependencies
pnpm install

# Type check
pnpm run typecheck

# Run tests (86 tests across 8 test files)
pnpm test

# Build
pnpm build
```

## Tech Stack

- TypeScript 5.9 / ESM / Node.js 22+
- Redis Stack 7.2+ with RediSearch (optional)
- SQLite via better-sqlite3 + sqlite-vec (fallback)
- @huggingface/transformers for local embeddings
- Zod 4 for config validation
- Vitest 4 for testing

## License

Business Source License 1.1 (BUSL-1.1)

Free for non-production use (development, testing, personal projects). Production use requires a commercial license from [RisiTech](https://risitech.pl).

Converts to Apache 2.0 on 2029-02-17 (3 years from initial release).

See [LICENSE](LICENSE) for full terms.
