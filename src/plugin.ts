import type { MumaConfig } from "./config.js";
import { MumaConfigSchema } from "./config.js";
import { createStore } from "./store/factory.js";
import { createEmbeddingProvider } from "./embedding/factory.js";
import { validateEmbeddingDimensions } from "./embedding/validation.js";
import { createLLMProvider } from "./llm/factory.js";
import { registerTools } from "./tools/index.js";
import { write } from "./pipeline/write.js";
import type { MemoryStore } from "./types/store.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import type { LLMProvider } from "./llm/provider.js";

// Module-level state (lives for gateway lifetime)
let store: MemoryStore | null = null;
let embeddingProvider: EmbeddingProvider | null = null;
let llmProvider: LLMProvider | null = null;

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

export function registerPlugin(api: any): void {
  // Parse and validate config
  const rawConfig = api.pluginConfig ?? {};
  const config: MumaConfig = MumaConfigSchema.parse(rawConfig);

  // gateway_start: initialize storage + embedding
  api.on("gateway_start", async () => {
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

    // 5. Register agent tools (PLUG-06)
    registerTools(api);
    api.logger.info("[muma-mem] Agent tools registered.");

    api.logger.info("[muma-mem] Ready.");
  });

  // PLUG-04: Episodic capture hooks
  // message_received — capture user messages as "told" memories
  api.on("message_received", async (event: any) => {
    // Only capture user messages (not system or assistant)
    if (event.role !== "user") return;
    // Skip short messages (less than 20 chars — greetings, acks)
    if (!event.content || event.content.length < 20) return;
    // Skip if LLM provider not configured (read-only mode)
    if (!llmProvider) return;

    try {
      await write(event.content, {
        userId: event.userId,
        agentId: event.agentId ?? "unknown",
        source: "told",  // User told the agent this
      });
    } catch (err) {
      api.logger.warn(`[muma-mem] Episodic capture failed: ${err}`);
      // Non-blocking — don't break the conversation if memory fails
    }
  });

  // after_tool_call — capture tool results as "experience" memories
  api.on("after_tool_call", async (event: any) => {
    // Only capture tool results that contain meaningful data
    if (!event.result || typeof event.result !== "string" || event.result.length < 50) return;
    // Skip if LLM provider not configured (read-only mode)
    if (!llmProvider) return;

    try {
      const content = `Tool ${event.toolName} returned: ${event.result.substring(0, 500)}`;
      await write(content, {
        userId: event.userId,
        agentId: event.agentId ?? "unknown",
        source: "experience",  // Agent experienced this via tool
      });
    } catch (err) {
      api.logger.warn(`[muma-mem] Tool capture failed: ${err}`);
    }
  });

  // gateway_stop: cleanup
  api.on("gateway_stop", async () => {
    api.logger.info("[muma-mem] Shutting down...");
    if (store) {
      await store.close();
      store = null;
    }
    if (embeddingProvider) {
      await embeddingProvider.close();
      embeddingProvider = null;
    }
    llmProvider = null;
    api.logger.info("[muma-mem] Shutdown complete.");
  });
}
