import type { EmbeddingProvider } from "./types.js";
import type { MemoryStore } from "../types/store.js";

export interface DimensionValidationResult {
  ok: boolean;
  providerDimensions: number;
  storedDimensions: number | null;
  error?: string;
}

/**
 * Validate that the embedding provider's dimensions match what's already stored.
 *
 * Prevents silent retrieval failures when a user switches embedding providers
 * (e.g., local MiniLM at 384-dim to OpenAI at 1536-dim) without re-indexing.
 *
 * Should be called during gateway_start (Plan 05).
 *
 * @returns DimensionValidationResult with ok=true if compatible, ok=false with error message if mismatched
 */
export async function validateEmbeddingDimensions(
  provider: EmbeddingProvider,
  store: MemoryStore,
): Promise<DimensionValidationResult> {
  const providerDimensions = provider.dimensions;
  const storedDimensions = store.dimensions;

  // First run: no vectors stored yet, no mismatch possible
  if (storedDimensions === null) {
    return {
      ok: true,
      providerDimensions,
      storedDimensions: null,
    };
  }

  // Dimensions match: all good
  if (storedDimensions === providerDimensions) {
    return {
      ok: true,
      providerDimensions,
      storedDimensions,
    };
  }

  // Mismatch detected
  return {
    ok: false,
    providerDimensions,
    storedDimensions,
    error:
      `Embedding dimension mismatch: store contains ${storedDimensions}-dim vectors ` +
      `but provider generates ${providerDimensions}-dim vectors. ` +
      `This will cause silent retrieval failures. ` +
      `Either switch back to the previous embedding provider or re-embed all existing memories.`,
  };
}
