export interface LLMProviderConfig {
  provider: string;              // "openai", "anthropic", "ollama", etc.
  model: string;                 // Model name
  apiKey?: string;               // API key (can use env var reference)
  baseUrl?: string;              // Custom base URL
  temperature?: number;          // Default 0.7
  maxTokens?: number;            // Default 1024
}
