import { MumaConfigSchema } from "./config.js";
import { registerPlugin } from "./plugin.js";

// Re-export types for consumers
export type { Note, NoteCreate, NoteUpdate, Visibility, MemorySource } from "./types/note.js";
export type { MemoryStore, VectorSearchOptions, VectorSearchResult } from "./types/store.js";
export type { EmbeddingProvider } from "./embedding/types.js";
export type { MumaConfig } from "./config.js";
export { MumaConfigSchema } from "./config.js";
export { getStore, getEmbeddingProvider } from "./plugin.js";

const memoryMumaPlugin = {
  id: "memory-muma",
  name: "MUMA-Mem",
  description: "Multi-user multi-agent memory with ACT-R activation, Ebbinghaus forgetting, and semantic note linking",
  kind: "memory" as const,
  configSchema: MumaConfigSchema,
  register: registerPlugin,
};

export default memoryMumaPlugin;
