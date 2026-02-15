import { MumaConfigSchema } from "./config.js";
import { registerPlugin } from "./plugin.js";

// Re-export types for consumers
export type { Note, NoteCreate, NoteUpdate, Visibility, MemorySource, WriteOperation } from "./types/note.js";
export type { MemoryStore, VectorSearchOptions, VectorSearchResult } from "./types/store.js";
export type { EmbeddingProvider } from "./embedding/types.js";
export type { LLMProvider, GenerateOptions } from "./llm/index.js";
export type { MumaConfig } from "./config.js";
export { MumaConfigSchema } from "./config.js";
export { getStore, getEmbeddingProvider, getLLMProvider, getConfig, getWorkingMemory, getEventBus, getTransactiveIndex } from "./plugin.js";
export { search, extract, construct, retrieve, decide, link, evolve, write } from "./pipeline/index.js";
export type { SearchOptions, SearchResult, ExtractedFacts, ConstructOptions, WriteDecision, LinkResult, EvolveResult, WriteOptions, WriteResult } from "./pipeline/index.js";
export { WorkingMemory } from "./memory/index.js";
export type { WorkingMemoryItem } from "./memory/index.js";
export { registerTools } from "./tools/index.js";
export type { MemoryEventType, MemoryEvent, MemoryEventHandler, EventBus } from "./sync/index.js";
export { createEventBus } from "./sync/index.js";
export { TransactiveMemoryIndex, createTransactiveIndex } from "./access/index.js";
export type { AgentProfile } from "./access/index.js";
export { consolidate, distillMemoryMd, writeMemoryMdFile } from "./consolidation/index.js";
export type { ConsolidationReport } from "./consolidation/index.js";
export type { ConflictType, MemoryConflict } from "./types/note.js";

const memoryMumaPlugin = {
  id: "memory-muma",
  name: "MUMA-Mem",
  description: "Multi-user multi-agent memory with ACT-R activation, Ebbinghaus forgetting, and semantic note linking",
  kind: "memory" as const,
  configSchema: MumaConfigSchema,
  register: registerPlugin,
};

export default memoryMumaPlugin;
