import { z } from "zod";

// --- Visibility enum (shared with note types) ---

const VisibilityEnum = z.enum(["open", "scoped", "private", "user-only"]);

// --- Redis config ---

const RedisConfigSchema = z.object({
  url: z.string().default("redis://localhost:6379"),
  prefix: z.string().default("muma:"),
});

// --- SQLite config ---

const SqliteConfigSchema = z.object({
  path: z.string().optional(),
});

// --- Embedding config ---

const EmbeddingConfigSchema = z.object({
  provider: z.enum(["local", "openai"]).default("local"),
  model: z.string().default("Xenova/all-MiniLM-L6-v2"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  dimensions: z.number().optional(),
});

// --- LLM config ---

const LlmConfigSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.number().default(0.7),
  maxTokens: z.number().default(1024),
});

// --- ACT-R Activation config ---

const ActivationConfigSchema = z.object({
  contextWeight: z.number().default(11.0),
  noiseStddev: z.number().default(1.2),
  decayParameter: z.number().default(0.5),
  retrievalThreshold: z.number().default(0.0),
});

// --- Decay / Forgetting config ---

const DecayConfigSchema = z.object({
  sweepIntervalMinutes: z.number().default(60),
  pruneThreshold: z.number().default(-2.0),
  hardPruneThreshold: z.number().default(-5.0),
  minAgeHours: z.number().default(72),
  maxAgeHours: z.number().default(720),
});

// --- Visibility config ---

const VisibilityConfigSchema = z.object({
  defaultVisibility: VisibilityEnum.default("scoped"),
  domainRules: z.record(z.string(), VisibilityEnum).default({}),
  domainBoost: z.number().default(1.0),
});

// --- Agent memory profile ---

const AgentMemoryProfileSchema = z.object({
  domains: z.array(z.string()),
  canSeePrivate: z.boolean().default(false),
});

// --- Default agent memory ---

const DefaultAgentMemorySchema = z.object({
  domains: z.array(z.string()).default(["*"]),
  canSeePrivate: z.boolean().default(false),
});

// --- Top-level config ---
// Use factory functions for .default() so Zod v4 resolves inner defaults at parse time.

export const MumaConfigSchema = z.object({
  redis: RedisConfigSchema.default(() => RedisConfigSchema.parse({})),
  sqlite: SqliteConfigSchema.default(() => SqliteConfigSchema.parse({})),
  embedding: EmbeddingConfigSchema.default(() => EmbeddingConfigSchema.parse({})),
  llm: LlmConfigSchema.default(() => LlmConfigSchema.parse({})),
  activation: ActivationConfigSchema.default(() => ActivationConfigSchema.parse({})),
  decay: DecayConfigSchema.default(() => DecayConfigSchema.parse({})),
  visibility: VisibilityConfigSchema.default(() => VisibilityConfigSchema.parse({})),
  agentMemory: z.record(z.string(), AgentMemoryProfileSchema).default({}),
  defaultAgentMemory: DefaultAgentMemorySchema.default(() => DefaultAgentMemorySchema.parse({})),
  identityMap: z.record(z.string(), z.array(z.string())).optional(),
});

export type MumaConfig = z.infer<typeof MumaConfigSchema>;
