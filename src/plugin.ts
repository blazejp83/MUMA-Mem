import type { MumaConfig } from "./config.js";
import { MumaConfigSchema } from "./config.js";
import { createStore } from "./store/factory.js";
import { createEmbeddingProvider } from "./embedding/factory.js";
import { validateEmbeddingDimensions } from "./embedding/validation.js";
import { createLLMProvider } from "./llm/factory.js";
import { registerTools } from "./tools/index.js";
import { write } from "./pipeline/write.js";
import { search } from "./pipeline/read.js";
import { WorkingMemory } from "./memory/index.js";
import type { MemoryStore } from "./types/store.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import type { LLMProvider } from "./llm/provider.js";
import type { EventBus } from "./sync/index.js";
import { createEventBus, FilesystemSync } from "./sync/index.js";
import { TransactiveMemoryIndex, createTransactiveIndex } from "./access/index.js";
import { startSweepScheduler, startConsolidationScheduler } from "./daemon/index.js";
import type {
  OpenClawPluginApi,
  PluginHookBeforeAgentStartEvent,
  PluginHookAgentContext,
  PluginHookBeforeAgentStartResult,
  PluginHookMessageReceivedEvent,
  PluginHookMessageReceivedContext,
  PluginHookAfterToolCallEvent,
  PluginHookAfterToolCallContext,
  PluginHookSessionEndEvent,
  PluginHookSessionEndContext,
  PluginHookGatewayStartEvent,
  PluginHookGatewayStopEvent,
  PluginHookGatewayContext,
} from "./types/openclaw.js";
import { deriveUserId, deriveUserIdFromMessageCtx } from "./utils/index.js";
import * as os from "node:os";
import * as path from "node:path";

// Module-level state (lives for gateway lifetime)
let store: MemoryStore | null = null;
let embeddingProvider: EmbeddingProvider | null = null;
let llmProvider: LLMProvider | null = null;
let mumaConfig: MumaConfig | null = null;
let eventBus: EventBus | null = null;
let transactiveIndex: TransactiveMemoryIndex | null = null;
let filesystemSync: FilesystemSync | null = null;
let sweepCleanup: (() => void) | null = null;
let consolidationCleanup: (() => void) | null = null;

// Per-session L1 working memory stores
const sessions: Map<string, WorkingMemory> = new Map();

/**
 * Get or create a WorkingMemory instance for a given session.
 */
function getOrCreateSession(sessionId: string, config: MumaConfig): WorkingMemory {
  let wm = sessions.get(sessionId);
  if (!wm) {
    wm = new WorkingMemory({
      decayParameter: config.activation.decayParameter,
      contextWeight: config.activation.contextWeight,
      noiseStddev: config.activation.noiseStddev,
    });
    sessions.set(sessionId, wm);
  }
  return wm;
}

/**
 * Public accessor: get working memory for a session.
 */
export function getWorkingMemory(sessionId: string): WorkingMemory | null {
  return sessions.get(sessionId) ?? null;
}

export function getStore(): MemoryStore {
  if (!store) throw new Error("[muma-mem] Store not initialized. Is the gateway running?");
  return store;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingProvider) throw new Error("[muma-mem] Embedding provider not initialized.");
  return embeddingProvider;
}

export function getLLMProvider(): LLMProvider {
  if (!llmProvider) throw new Error("[muma-mem] LLM provider not configured. Set llm.apiKey and llm.model in config.");
  return llmProvider;
}

export function getConfig(): MumaConfig {
  if (!mumaConfig) throw new Error("[muma-mem] Config not initialized. Is the gateway running?");
  return mumaConfig;
}

export function getEventBus(): EventBus | null {
  return eventBus;
}

export function getTransactiveIndex(): TransactiveMemoryIndex | null {
  return transactiveIndex;
}

export function registerPlugin(api: OpenClawPluginApi): void {
  // Parse and validate config
  const rawConfig = api.pluginConfig ?? {};
  const config: MumaConfig = MumaConfigSchema.parse(rawConfig);

  // Store config as module-level singleton for access by other modules
  mumaConfig = config;

  // gateway_start: initialize storage + embedding
  api.on("gateway_start", async (_event: PluginHookGatewayStartEvent, _ctx: PluginHookGatewayContext) => {
    api.logger.info("[muma-mem] Initializing...");

    // 1. Create embedding provider
    embeddingProvider = await createEmbeddingProvider(config);
    api.logger.info(`[muma-mem] Embedding: ${embeddingProvider.modelName} (${embeddingProvider.dimensions}d)`);

    // 2. Create storage backend (Redis -> SQLite fallback)
    store = await createStore(config);
    api.logger.info(`[muma-mem] Storage: ${store.backend}`);

    // 3. Validate embedding dimensions (STORE-05)
    const validation = await validateEmbeddingDimensions(embeddingProvider, store);
    if (!validation.ok) {
      api.logger.error(`[muma-mem] ${validation.error}`);
      throw new Error(validation.error);
    }

    // 4. Create LLM provider (optional — only if configured)
    llmProvider = createLLMProvider(config);
    if (llmProvider) {
      api.logger.info(`[muma-mem] LLM: ${llmProvider.modelName}`);
    }

    // 5. Create event bus for cross-agent notifications (AGENT-03)
    try {
      eventBus = await createEventBus(store.backend, config);
      api.logger.info(`[muma-mem] Event bus: ${store.backend}`);
    } catch (err) {
      api.logger.warn(`[muma-mem] Event bus init failed (non-fatal): ${err}`);
      // Event bus is optional — system works without it
    }

    // 6. Create transactive memory index (AGENT-04)
    transactiveIndex = createTransactiveIndex();
    if (eventBus) {
      eventBus.subscribe((event) => {
        if (event.type === "memory:write" || event.type === "memory:update") {
          transactiveIndex?.recordWrite(event.agentId, event.domain);
        }
      });
    }
    api.logger.info("[muma-mem] Transactive memory index initialized.");

    // 7. Start filesystem sync for human-readable memory files (SYNC-01)
    try {
      const syncDir = path.join(os.homedir(), "clawd", "memory");
      filesystemSync = new FilesystemSync(syncDir);
      await filesystemSync.start(store, eventBus);
      await filesystemSync.initialSync(store);
      api.logger.info(`[muma-mem] Filesystem sync: ${syncDir}`);
    } catch (err) {
      api.logger.warn(`[muma-mem] Filesystem sync init failed (non-fatal): ${err}`);
      // Filesystem sync is optional — system works without it
    }

    // 8. Start decay sweep scheduler (FORGET-05)
    sweepCleanup = startSweepScheduler(store, config, api.logger);
    api.logger.info(`[muma-mem] Decay sweep: every ${config.decay.sweepIntervalMinutes}min`);

    // 9. Start daily consolidation scheduler (CONSOL-04) — only if LLM configured
    if (llmProvider && embeddingProvider) {
      consolidationCleanup = startConsolidationScheduler(
        store, embeddingProvider, llmProvider, config, api.logger,
      );
      api.logger.info("[muma-mem] Consolidation: daily");
    }

    // 10. Register agent tools (PLUG-06 + PLUG-07)
    registerTools(api);
    api.logger.info("[muma-mem] Agent tools registered.");

    api.logger.info("[muma-mem] Ready.");
  });

  // PLUG-02: before_agent_start — inject combined L1 + L2 context
  api.on("before_agent_start", async (event: PluginHookBeforeAgentStartEvent, ctx: PluginHookAgentContext): Promise<PluginHookBeforeAgentStartResult | void> => {
    try {
      // Guard: skip if store or embedding not ready
      if (!store || !embeddingProvider) return;

      const sessionId: string | undefined = ctx.sessionId;
      const userId: string = deriveUserId(ctx.sessionKey);
      const agentId: string | undefined = ctx.agentId;

      if (!agentId) return;

      const memories: string[] = [];

      // L1: Get working memory context (if session exists)
      if (sessionId) {
        const wm = sessions.get(sessionId);
        if (wm) {
          const l1Items = wm.getContextItems(userId, agentId, 5);
          for (const item of l1Items) {
            memories.push(`[session] ${item.content}`);
          }
        }
      }

      // L2: Search persistent memory for relevant context
      const queryText = event.prompt || "";
      if (queryText && store) {
        try {
          const l2Results = await search({
            query: queryText,
            userId,
            agentId,  // VIS-04: enables visibility filtering
            topK: 10,
          });
          for (const result of l2Results) {
            memories.push(`[memory] ${result.note.content}`);
          }
        } catch {
          // Silently skip L2 if search fails
        }
      }

      if (memories.length === 0) return;

      // Format and return context for injection
      const formatted = "## Relevant Memories\n\n" + memories.map((m) => `- ${m}`).join("\n");

      return { prependContext: formatted };
    } catch (err) {
      api.logger.warn(`[muma-mem] Context injection failed: ${err}`);
    }
  });

  // PLUG-03: session_end — promote high-activation L1 items to L2, discard rest
  api.on("session_end", async (event: PluginHookSessionEndEvent, ctx: PluginHookSessionEndContext) => {
    const sessionId: string | undefined = event.sessionId;
    if (!sessionId) return;

    const agentId = ctx.agentId ?? "unknown";
    const userId = deriveUserId(undefined); // session_end ctx has no sessionKey; "default" fallback is acceptable

    const wm = sessions.get(sessionId);
    if (!wm) return;

    try {
      const threshold = config.activation.retrievalThreshold;
      const promoted = wm.getTopActivated(threshold);
      let promotedCount = 0;
      const totalCount = wm.size;

      // Only promote if LLM provider is configured (write() requires LLM)
      if (llmProvider) {
        for (const item of promoted) {
          try {
            await write(item.content, {
              userId: item.userId,
              agentId: item.agentId,
              source: item.source,
            });
            promotedCount++;
          } catch {
            // Skip individual promotion failures
          }
        }
      }

      api.logger.info(
        `[muma-mem] Session ${sessionId}: promoted ${promotedCount}/${totalCount} items to L2, discarded ${totalCount - promotedCount}`,
      );
    } catch (err) {
      api.logger.warn(`[muma-mem] Session end promotion failed: ${err}`);
    } finally {
      // Always clean up
      wm.clear();
      sessions.delete(sessionId);
    }
  });

  // PLUG-04: Episodic capture hooks
  // message_received — capture user messages as "told" memories
  api.on("message_received", async (event: PluginHookMessageReceivedEvent, ctx: PluginHookMessageReceivedContext) => {
    // All message_received events are user messages (no role field)
    // Skip short messages (less than 20 chars — greetings, acks)
    if (!event.content || event.content.length < 20) return;

    // Derive userId from message context (channelId + accountId)
    const userId = deriveUserIdFromMessageCtx(ctx);

    // Note: L1 working memory capture not possible here —
    // message_received context has no sessionId or agentId.
    // L1 capture will be handled in Phase 10 via session_start/before_compaction hooks.

    // L2: Write to persistent store (requires LLM)
    if (!llmProvider) return;

    try {
      await write(event.content, {
        userId,
        agentId: "unknown",  // agentId not available in message_received context
        source: "told",  // User told the agent this
      });
    } catch (err) {
      api.logger.warn(`[muma-mem] Episodic capture failed: ${err}`);
      // Non-blocking — don't break the conversation if memory fails
    }
  });

  // after_tool_call — capture tool results as "experience" memories
  api.on("after_tool_call", async (event: PluginHookAfterToolCallEvent, ctx: PluginHookAfterToolCallContext) => {
    // Convert result to string (event.result is typed as unknown)
    const resultStr = typeof event.result === "string"
      ? event.result
      : event.result != null
        ? JSON.stringify(event.result)
        : "";

    // Only capture tool results that contain meaningful data
    if (!resultStr || resultStr.length < 50) return;

    const content = `Tool ${event.toolName} returned: ${resultStr.substring(0, 500)}`;

    // Derive userId and agentId from context
    const userId = deriveUserId(ctx.sessionKey);
    const agentId = ctx.agentId ?? "unknown";

    // Note: L1 working memory capture not possible here —
    // after_tool_call ctx has sessionKey but not sessionId.
    // The sessions map is keyed by sessionId, so L1 lookup would fail.
    // L1 capture for tool calls will be addressed in Phase 10.

    // L2: Write to persistent store (requires LLM)
    if (!llmProvider) return;

    try {
      await write(content, {
        userId,
        agentId,
        source: "experience",  // Agent experienced this via tool
      });
    } catch (err) {
      api.logger.warn(`[muma-mem] Tool capture failed: ${err}`);
    }
  });

  // gateway_stop: cleanup
  api.on("gateway_stop", async (_event: PluginHookGatewayStopEvent, _ctx: PluginHookGatewayContext) => {
    api.logger.info("[muma-mem] Shutting down...");

    // Clear all working memory sessions
    for (const wm of sessions.values()) {
      wm.clear();
    }
    sessions.clear();

    // Stop decay sweep scheduler
    if (sweepCleanup) {
      sweepCleanup();
      sweepCleanup = null;
    }

    // Stop consolidation scheduler
    if (consolidationCleanup) {
      consolidationCleanup();
      consolidationCleanup = null;
    }

    if (transactiveIndex) {
      transactiveIndex.clear();
      transactiveIndex = null;
    }
    if (filesystemSync) {
      await filesystemSync.stop();
      filesystemSync = null;
    }
    if (eventBus) {
      await eventBus.close();
      eventBus = null;
    }
    if (store) {
      await store.close();
      store = null;
    }
    if (embeddingProvider) {
      await embeddingProvider.close();
      embeddingProvider = null;
    }
    llmProvider = null;
    mumaConfig = null;
    api.logger.info("[muma-mem] Shutdown complete.");
  });
}
