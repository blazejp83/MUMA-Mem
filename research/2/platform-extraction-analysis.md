# Platform Extraction Analysis: MUMA-Mem → Multi-User Chatbot Platform

## Overview

Analysis of extracting the MUMA-Mem memory system from OpenClaw and rebuilding it as the core of a standalone multi-user, multi-bot chatbot platform where users can create chatbots with distinct personalities and memories.

---

## What's Already Generic (Easy to Extract)

- **Core memory engine**: ACT-R activation, Ebbinghaus decay, vector search, consolidation
- **Storage backends**: SQLite/Redis with a clean `MemoryStore` interface
- **Write pipeline**: Extract → Construct → Retrieve → Decide → Link → Evolve
- **Embedding/LLM providers**: Already abstracted behind interfaces
- **Note data model**: 22-field structure with visibility, domains, linking

## What's OpenClaw-Specific (Needs Replacement)

- **Plugin registration** (`plugin.ts`): 9 lifecycle hooks tied to OpenClaw's SDK
- **Tool exposure**: 10 tools registered via OpenClaw's tool system
- **Identity mapping**: Channel-based (Telegram, Discord) → canonical userId
- **Filesystem sync**: `~/clawd/memory/` markdown files
- **Context injection**: `before_agent_start` hook prepending to system prompts

---

## Platform Requirements

### Multi-Tenancy Model

```
Platform
  └── Users (account holders)
       └── Bots (each user can create multiple)
            ├── Personality (system prompt, behavior rules, tone)
            ├── Memory Store (L2 - per-bot persistent memory)
            └── Sessions (L1 - ephemeral per-conversation)
```

**Key entities:**

- **User** — platform account, owns bots, billing unit
- **Bot** — has a personality/identity, its own memory partition, created by a user
- **Conversation** — a session between an end-user (or the owner) and a bot
- **Memory** — scoped to a bot, optionally shared across bots owned by the same user

### What the Platform Needs to Provide

| Concern | Requirement |
|---------|-------------|
| **Auth & Identity** | User accounts, API keys, bot ownership. Replaces OpenClaw's `identityMap` |
| **Bot Configuration** | Personality definition (system prompt, tone, rules), LLM model selection, memory config overrides |
| **Conversation Management** | Session lifecycle (create, message, end) that triggers L1 working memory creation/promotion |
| **LLM Orchestration** | Route conversations through an LLM with memory-augmented context injection |
| **Memory API** | REST/WebSocket API exposing write, query, forget, pin, consolidate — replaces the 10 OpenClaw tools |
| **Storage Isolation** | Per-bot SQLite databases or namespaced Redis keys, never leaking across bots |
| **Background Jobs** | Decay sweeps, consolidation — replaces the daemon layer (L4) |
| **Embedding Service** | Shared or per-bot embedding generation — the local HuggingFace approach scales poorly for multi-tenant |
| **Admin UI** | Bot creation, memory inspection, personality editing, conversation history |

---

## Extraction Strategy

The memory system splits into two packages:

### Package A: `@promem/core` (the library)

- Everything under `src/` except `plugin.ts` and OpenClaw-specific hooks
- Exports: `MemoryStore`, `WritePipeline`, `SearchEngine`, `WorkingMemory`, `ConsolidationService`, `DecaySweeper`
- Zero opinion on transport (no HTTP, no WebSocket, no plugin system)
- Configuration via the existing Zod schemas

### Package B: `@promem/platform` (the new chatbot platform)

- HTTP/WebSocket API wrapping `@promem/core`
- User/bot/conversation management
- LLM orchestration layer (replaces OpenClaw's gateway)
- Background job scheduler (replaces OpenClaw's lifecycle hooks)
- Admin dashboard

---

## Key Architectural Decisions

| Decision | Options | Tradeoff |
|----------|---------|----------|
| **Storage per bot** | Separate SQLite file per bot vs shared DB with `bot_id` column | Isolation vs operational simplicity |
| **Embedding hosting** | Local (HuggingFace) vs API (OpenAI) vs self-hosted (Ollama) | Cost vs latency vs privacy |
| **LLM routing** | Single provider vs bring-your-own-key vs multiple providers | Simplicity vs flexibility |
| **Bot-to-bot memory sharing** | Disabled, opt-in L3 commons, or full sharing within a user's bots | Privacy vs knowledge reuse |
| **Conversation channels** | Web chat only vs API-first (Telegram/Discord/etc.) | Scope vs reach |
| **Hosting model** | Self-hosted vs managed SaaS vs both | Control vs adoption |
| **Real-time vs batch** | Memory writes synchronous (in conversation) vs async queue | Latency vs throughput |

---

## MVP Scope Suggestion

For a first version:

1. **Extract `@promem/core`** — pure library, no platform dependencies
2. **Build minimal REST API** — `POST /bots`, `POST /bots/:id/conversations`, `POST /conversations/:id/messages`
3. **Web chat UI** — single-page app, one bot at a time
4. **Bot builder** — personality editor + memory config
5. **SQLite per bot** — simplest isolation model
6. **Single LLM provider** — OpenAI or Anthropic, configurable
7. **Background worker** — runs decay + consolidation on a cron

**Skip for MVP**: multi-channel (Telegram/Discord), L3 commons, identity evolution, TF-GRPO, admin analytics.

---

## Appendix: Current MUMA-Mem Architecture Reference

### Five-Layer Architecture

| Layer | Scope | Purpose |
|-------|-------|---------|
| **L1: Working Memory** | Per-session, ephemeral | Task-scoped scratchpad, ACT-R activation scoring |
| **L2: User Shared Memory** | Per-user, persistent (SQLite/Redis) | Durable knowledge store, 22-field Note model |
| **L3: Knowledge Commons** | Cross-agent, role-scoped | Transactive memory index, event bus |
| **L4: Memory Daemon** | System-wide background | Decay sweep, consolidation, conflict resolution |
| **L5: Plugin Integration** | OpenClaw bridge | 9 lifecycle hooks, 10 agent tools |

### Core Interfaces

```typescript
// Storage abstraction
interface MemoryStore {
  initialize(), close()
  create(NoteCreate), read(), update(), delete()
  search(VectorSearchOptions): VectorSearchResult[]
  listByUser(), countByUser()
  saveConflicts(), getConflicts(), resolveConflict()
}

// Embedding abstraction
interface EmbeddingProvider {
  embed(text): Promise<Float32Array>
  readonly modelName, dimensions
}

// LLM abstraction
interface LLMProvider {
  generateJSON<T>(prompt, options): Promise<T>
  readonly modelName
}
```

### Research Foundations

| Source | Contribution |
|--------|--------------|
| Tao An (Medium, 2025) | Forgetting as optimization; consolidation from episodic to semantic |
| Wei et al., "FadeMem" (arXiv, 2026) | Dual-layer memory, Ebbinghaus decay, conflict resolution |
| Honda et al., "ACT-R-Inspired" (HAI '25) | Activation function, base-level scoring, optimal w=11.0 |
| Xu et al., "A-Mem" (arXiv, 2025) | Zettelkasten note structure, autonomous linking, memory evolution |
| Wu & Shu, "LLM-based Multi-agent" (Emory) | Multi-agent topology, transactive memory, coordinated forgetting |
| Chhikara et al., "Mem0" (arXiv, 2025) | Extract-then-update pipeline (ADD/UPDATE/DELETE/NOOP), dual retrieval |
