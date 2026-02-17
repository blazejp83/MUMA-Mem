# Getting Started

This guide walks you through setting up MUMA-Mem and using it with your first agent.

## 1. Install

```bash
openclaw plugins install @risitech/memory-muma
```

See [INSTALLATION.md](INSTALLATION.md) for alternative install methods.

## 2. Minimal config

Add to your `openclaw.json`:

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
        "config": {}
      }
    }
  }
}
```

With an empty `config`, MUMA-Mem uses sensible defaults: local embeddings, SQLite storage, and no LLM (write pipeline and consolidation disabled).

## 3. Add an LLM (optional but recommended)

The write pipeline and consolidation require an LLM. Add one to unlock the full feature set:

```json
{
  "config": {
    "llm": {
      "provider": "openai",
      "model": "gpt-4o-mini",
      "apiKey": "sk-..."
    }
  }
}
```

Without an LLM, MUMA-Mem still works for search, context injection, and working memory — it just can't extract structured facts from raw input or run nightly consolidation.

## 4. Start OpenClaw

```bash
openclaw start
```

Watch for the startup log:

```
[muma-mem] Embedding: Xenova/all-MiniLM-L6-v2 (384d)
[muma-mem] Storage: sqlite
[muma-mem] Ready.
```

## 5. How it works in practice

Once running, MUMA-Mem operates transparently:

**Automatic context injection** — Before each agent turn, the `before_agent_start` hook searches L1 (session) and L2 (persistent) memory and injects relevant memories into the agent's prompt. No tool calls needed.

**Episodic capture** — User messages (`message_received`) and tool results (`after_tool_call`) are automatically captured as memories.

**Session lifecycle** — Working memory (L1) accumulates during a session. On session end, high-activation items promote to persistent storage (L2). Low-activation items are discarded.

**Background intelligence** — Decay sweeps run hourly. Consolidation runs daily (if LLM configured). Both are automatic.

## 6. Agent tools

Agents also have explicit tools when they need direct memory control:

| Tool | What it does |
|------|-------------|
| `memory_write` | Store a memory with automatic deduplication |
| `memory_query` | Search memories by semantic similarity |
| `memory_forget` | Mark a memory for forgetting |
| `memory_pin` | Pin a memory (exempt from decay) |
| `memory_set_visibility` | Change memory visibility level |
| `memory_get_context` | Get current session context |
| `memory_stats` | Get memory statistics |
| `memory_link` | Create explicit links between notes |
| `memory_search_agents` | Query transactive memory index |
| `memory_consolidate` | Trigger manual consolidation |

## 7. CLI

### Standalone

```bash
muma stats --user alice
muma export --user alice --output memories.json
muma consolidate --user alice
muma conflicts --user alice --all
```

The standalone CLI reads config from `.muma.json` in the current directory or home directory.

### Via OpenClaw

```bash
openclaw memory stats --user alice
openclaw memory export --user alice --output memories.json
```

## 8. Multi-user / multi-channel

By default, each channel identity (e.g. `telegram:12345`) gets its own memory store. If the same person uses multiple channels, add an `identityMap` so they share one store:

```json
{
  "config": {
    "identityMap": {
      "alice": ["telegram:12345", "discord:98765"],
      "bob": ["slack:U456"]
    }
  }
}
```

Now `telegram:12345` and `discord:98765` both resolve to `alice` and share the same memories.

## Next steps

- [CONFIGURATION.md](CONFIGURATION.md) — Full reference for every config variable
- [README.md](../README.md) — Architecture, memory layers, and project structure
