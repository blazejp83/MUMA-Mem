# Installation

## Requirements

- Node.js 22+
- pnpm (recommended) or npm
- One of: Redis Stack 7.2+ **or** SQLite (zero-dependency fallback)

## Via OpenClaw CLI (recommended)

```bash
openclaw plugins install @risitech/memory-muma
```

This downloads the package from npm, installs it to `~/.openclaw/extensions/memory-muma/`, installs dependencies, and enables it in your config automatically.

## Local development

```bash
# Link from a local checkout (changes reflect immediately, no copy)
openclaw plugins install --link /path/to/promem

# Or add as a workspace dependency
pnpm add @risitech/memory-muma
```

## Storage backend setup

MUMA-Mem tries Redis first. If Redis is unavailable, it falls back to SQLite automatically.

### Redis (recommended)

Full features including real-time cross-agent sync via pub/sub.

Requires Redis Stack 7.2+ with the RediSearch module:

```bash
docker run -d --name redis-stack -p 6379:6379 redis/redis-stack:latest
```

### SQLite (zero-dependency fallback)

Works without Redis. Uses polling-based sync instead of pub/sub. No setup needed — creates `~/.openclaw/memory-muma.db` automatically on first run.

## Enable the plugin

After installation, add MUMA-Mem to your `openclaw.json`:

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
          }
        }
      }
    }
  }
}
```

The plugin ships with an `openclaw.plugin.json` manifest, so OpenClaw auto-discovers it from `node_modules` without extra path configuration.

## Verify installation

Start OpenClaw and check the logs for:

```
[muma-mem] Embedding: Xenova/all-MiniLM-L6-v2 (384d)
[muma-mem] Storage: redis (or sqlite)
[muma-mem] Ready.
```

## Building from source

```bash
git clone <repo-url>
cd promem
pnpm install
pnpm build        # Compile TypeScript
pnpm test         # Run test suite
pnpm run typecheck  # Type check without emitting
```
