import type { MumaConfig } from "./config.js";
import { MumaConfigSchema } from "./config.js";
import { createStore } from "./store/factory.js";
import { createEmbeddingProvider } from "./embedding/factory.js";
import { validateEmbeddingDimensions } from "./embedding/validation.js";
import type { MemoryStore } from "./types/store.js";
import type { EmbeddingProvider } from "./embedding/types.js";

// Module-level state (lives for gateway lifetime)
let store: MemoryStore | null = null;
let embeddingProvider: EmbeddingProvider | null = null;

export function getStore(): MemoryStore {
  if (!store) throw new Error("[muma-mem] Store not initialized. Is the gateway running?");
  return store;
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingProvider) throw new Error("[muma-mem] Embedding provider not initialized.");
  return embeddingProvider;
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

    api.logger.info("[muma-mem] Ready.");
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
    api.logger.info("[muma-mem] Shutdown complete.");
  });
}
