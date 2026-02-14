import type { EmbeddingProvider } from "./types.js";
import type { MumaConfig } from "../config.js";
import { LocalEmbeddingProvider } from "./local.js";
import { RemoteEmbeddingProvider } from "./remote.js";

export async function createEmbeddingProvider(
  config: MumaConfig,
): Promise<EmbeddingProvider> {
  const provider =
    config.embedding.provider === "openai"
      ? new RemoteEmbeddingProvider(config.embedding)
      : new LocalEmbeddingProvider(config.embedding);
  await provider.initialize();
  return provider;
}
