import type { MumaConfig } from "../config.js";
import type { LLMProvider } from "./provider.js";
import { OpenAICompatibleLLMProvider } from "./provider.js";

/**
 * Create an LLM provider from config.
 * Returns null if LLM is not configured (provider and apiKey both unset).
 */
export function createLLMProvider(config: MumaConfig): LLMProvider | null {
  // LLM is optional — if neither provider nor apiKey is set, skip
  if (!config.llm.provider && !config.llm.apiKey) {
    return null;
  }

  return new OpenAICompatibleLLMProvider({
    model: config.llm.model,
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
  });
}
