import { createClient, type RedisClientType } from "redis";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import type { MumaConfig } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryEventType = "memory:write" | "memory:update" | "memory:delete";

export interface MemoryEvent {
  type: MemoryEventType;
  noteId: string;
  userId: string;
  agentId: string;
  domain: string;
  timestamp: string; // ISO 8601
}

export type MemoryEventHandler = (event: MemoryEvent) => void;

export interface EventBus {
  emit(event: MemoryEvent): Promise<void>;
  subscribe(handler: MemoryEventHandler): () => void; // returns unsubscribe fn
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// RedisEventBus
// ---------------------------------------------------------------------------

export class RedisEventBus implements EventBus {
  private _pubClient: RedisClientType;
  private _subClient: RedisClientType;
  private _channel: string;
  private _handlers: Set<MemoryEventHandler> = new Set();
  private _subscribed = false;

  constructor(redisUrl: string, channel = "muma:events") {
    this._pubClient = createClient({ url: redisUrl }) as RedisClientType;
    this._subClient = createClient({ url: redisUrl }) as RedisClientType;
    this._channel = channel;
  }

  /**
   * Connect both pub and sub clients. Must be called before emit/subscribe.
   */
  async init(): Promise<void> {
    this._pubClient.on("error", (err: Error) => {
      console.error(`[RedisEventBus] Pub client error: ${err.message}`);
    });
    this._subClient.on("error", (err: Error) => {
      console.error(`[RedisEventBus] Sub client error: ${err.message}`);
    });

    await this._pubClient.connect();
    await this._subClient.connect();

    // Subscribe to channel on the dedicated subscriber connection
    await this._subClient.subscribe(this._channel, (message: string) => {
      try {
        const event: MemoryEvent = JSON.parse(message);
        for (const handler of this._handlers) {
          handler(event);
        }
      } catch {
        // Ignore malformed messages
      }
    });
    this._subscribed = true;
  }

  async emit(event: MemoryEvent): Promise<void> {
    await this._pubClient.publish(this._channel, JSON.stringify(event));
  }

  subscribe(handler: MemoryEventHandler): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    if (this._subscribed) {
      await this._subClient.unsubscribe(this._channel);
      this._subscribed = false;
    }
    this._handlers.clear();

    if (this._subClient.isOpen) {
      await this._subClient.disconnect();
    }
    if (this._pubClient.isOpen) {
      await this._pubClient.disconnect();
    }
  }
}

// ---------------------------------------------------------------------------
// SQLiteEventBus
// ---------------------------------------------------------------------------

export class SQLiteEventBus implements EventBus {
  private _db: DatabaseType;
  private _handlers: Set<MemoryEventHandler> = new Set();
  private _lastSeenId = 0;
  private _pollInterval: ReturnType<typeof setInterval> | null = null;
  private _pollMs: number;

  constructor(dbPath: string, pollMs = 2000) {
    this._db = new Database(dbPath);
    this._pollMs = pollMs;
  }

  /**
   * Initialize the events table and start polling.
   */
  async init(): Promise<void> {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS muma_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Seed lastSeenId to current max so we only see new events
    const row = this._db.prepare("SELECT MAX(id) as maxId FROM muma_events").get() as
      | { maxId: number | null }
      | undefined;
    this._lastSeenId = row?.maxId ?? 0;

    // Start polling
    this._pollInterval = setInterval(() => this._poll(), this._pollMs);
  }

  async emit(event: MemoryEvent): Promise<void> {
    this._db.prepare("INSERT INTO muma_events (payload) VALUES (?)").run(JSON.stringify(event));
  }

  subscribe(handler: MemoryEventHandler): () => void {
    this._handlers.add(handler);
    return () => {
      this._handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this._handlers.clear();
    // Don't close the DB — it may be shared with the store
  }

  private _poll(): void {
    try {
      const rows = this._db
        .prepare("SELECT id, payload FROM muma_events WHERE id > ? ORDER BY id")
        .all(this._lastSeenId) as Array<{ id: number; payload: string }>;

      for (const row of rows) {
        this._lastSeenId = row.id;
        try {
          const event: MemoryEvent = JSON.parse(row.payload);
          for (const handler of this._handlers) {
            handler(event);
          }
        } catch {
          // Ignore malformed payloads
        }
      }
    } catch {
      // Ignore polling errors (DB may be busy)
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createEventBus(
  storeBackend: "redis" | "sqlite",
  config: MumaConfig,
): Promise<EventBus> {
  if (storeBackend === "redis") {
    const bus = new RedisEventBus(config.redis.url);
    await bus.init();
    return bus;
  }

  // SQLite fallback
  const dbPath = config.sqlite?.path ?? "memory-muma.db";
  const bus = new SQLiteEventBus(dbPath);
  await bus.init();
  return bus;
}
