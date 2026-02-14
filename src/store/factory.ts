import type { MemoryStore } from "../types/store.js";
import type { MumaConfig } from "../config.js";
import { RedisMemoryStore } from "./redis.js";
import { SQLiteMemoryStore } from "./sqlite.js";

export async function createStore(config: MumaConfig): Promise<MemoryStore> {
  // Try Redis first (full features)
  if (config.redis?.url) {
    try {
      const store = new RedisMemoryStore(config.redis, config.embedding.dimensions);
      await store.initialize();
      return store;
    } catch (err) {
      console.warn(`[muma-mem] Redis connection failed (${(err as Error).message}), falling back to SQLite`);
    }
  }

  // Fallback to SQLite (degraded: no pub/sub)
  const sqlitePath = config.sqlite?.path ?? "memory-muma.db";
  const store = new SQLiteMemoryStore({ path: sqlitePath }, config.embedding.dimensions);
  await store.initialize();
  return store;
}
