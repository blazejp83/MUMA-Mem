import { createClient, type RedisClientType } from "redis";
import type {
  MemoryStore,
  VectorSearchOptions,
  VectorSearchResult,
} from "../types/store.js";
import type { Note, NoteCreate, NoteUpdate } from "../types/note.js";

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeNote(note: Note): Record<string, string | Buffer> {
  const record: Record<string, string | Buffer> = {
    id: note.id,
    content: note.content,
    context: note.context,
    keywords: JSON.stringify(note.keywords),
    tags: JSON.stringify(note.tags),
    links: JSON.stringify(note.links),
    created_at: note.created_at,
    updated_at: note.updated_at,
    created_by: note.created_by,
    user_id: note.user_id,
    domain: note.domain,
    visibility: note.visibility,
    access_count: String(note.access_count),
    access_log: JSON.stringify(note.access_log),
    activation: String(note.activation),
    half_life: String(note.half_life),
    importance: String(note.importance),
    source: note.source,
    confidence: String(note.confidence),
    version: String(note.version),
    pinned: note.pinned ? "1" : "0",
  };

  // Store embedding as raw Buffer (binary Float32Array)
  if (note.embedding.length > 0) {
    record.embedding = Buffer.from(
      note.embedding.buffer,
      note.embedding.byteOffset,
      note.embedding.byteLength,
    );
  }

  return record;
}

function deserializeNote(data: Record<string, string>): Note {
  // Rebuild Float32Array from the raw buffer stored in Redis.
  // node-redis returns Buffers as strings when using HGETALL;
  // if it's a Buffer we use it directly, otherwise build from the latin1
  // encoded string returned by the default serializer.
  let embedding: Float32Array;
  const raw = data.embedding;
  if (raw === undefined || raw === "") {
    embedding = new Float32Array(0);
  } else if (Buffer.isBuffer(raw)) {
    const buf = raw as unknown as Buffer;
    embedding = new Float32Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
  } else {
    // HGETALL returns binary data as a latin1-encoded string by default
    const buf = Buffer.from(raw, "latin1");
    embedding = new Float32Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
  }

  return {
    id: data.id,
    content: data.content,
    context: data.context,
    keywords: JSON.parse(data.keywords),
    tags: JSON.parse(data.tags),
    links: JSON.parse(data.links),
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
    user_id: data.user_id,
    domain: data.domain,
    visibility: data.visibility as Note["visibility"],
    access_count: Number(data.access_count),
    access_log: JSON.parse(data.access_log),
    activation: Number(data.activation),
    half_life: Number(data.half_life),
    importance: Number(data.importance),
    source: data.source as Note["source"],
    confidence: Number(data.confidence),
    version: Number(data.version),
    pinned: data.pinned === "1",
    embedding,
  };
}

// ---------------------------------------------------------------------------
// RedisMemoryStore
// ---------------------------------------------------------------------------

export interface RedisStoreConfig {
  url: string;
  prefix: string;
}

export class RedisMemoryStore implements MemoryStore {
  readonly backend = "redis" as const;

  private _client: RedisClientType;
  private _prefix: string;
  private _dimensions: number | null = null;
  private _indexCreated = false;
  private _embeddingDimensions: number | undefined;

  constructor(
    config: RedisStoreConfig,
    embeddingDimensions?: number,
  ) {
    this._client = createClient({ url: config.url }) as RedisClientType;
    this._prefix = config.prefix;
    this._embeddingDimensions = embeddingDimensions;
  }

  // -- Accessors -----------------------------------------------------------

  get dimensions(): number | null {
    return this._dimensions;
  }

  // -- Lifecycle -----------------------------------------------------------

  async initialize(): Promise<void> {
    this._client.on("error", (err: Error) => {
      console.error(`[RedisMemoryStore] Redis client error: ${err.message}`);
    });
    await this._client.connect();

    // If dimensions are known upfront, create the vector index immediately
    if (this._embeddingDimensions !== undefined) {
      this._dimensions = this._embeddingDimensions;
      await this._ensureIndex();
    }
  }

  async close(): Promise<void> {
    if (this._client.isOpen) {
      await this._client.disconnect();
    }
  }

  // -- CRUD ----------------------------------------------------------------

  async create(noteCreate: NoteCreate): Promise<Note> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const note: Note = {
      id,
      content: noteCreate.content,
      context: noteCreate.context ?? "",
      keywords: noteCreate.keywords ?? [],
      tags: noteCreate.tags ?? [],
      embedding: noteCreate.embedding,
      links: noteCreate.links ?? [],
      created_at: now,
      updated_at: now,
      created_by: noteCreate.created_by,
      user_id: noteCreate.user_id,
      domain: noteCreate.domain ?? "",
      visibility: noteCreate.visibility ?? "scoped",
      access_count: 0,
      access_log: [],
      activation: 0,
      half_life: 168, // 7 days
      importance: noteCreate.importance ?? 0.5,
      source: noteCreate.source ?? "experience",
      confidence: noteCreate.confidence ?? 0.5,
      version: 1,
      pinned: false,
    };

    // Track dimensions from first embedding if not yet set
    if (this._dimensions === null && note.embedding.length > 0) {
      this._dimensions = note.embedding.length;
      await this._ensureIndex();
    }

    const key = this._noteKey(note.user_id, id);
    const serialized = serializeNote(note);
    await this._client.hSet(key, serialized);

    return note;
  }

  async read(id: string, userId: string): Promise<Note | null> {
    const key = this._noteKey(userId, id);
    const data = await this._client.hGetAll(key);

    // hGetAll returns {} for missing keys
    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return deserializeNote(data);
  }

  async update(
    id: string,
    userId: string,
    updates: NoteUpdate,
  ): Promise<Note | null> {
    const existing = await this.read(id, userId);
    if (!existing) {
      return null;
    }

    const merged: Note = {
      ...existing,
      ...updates,
      // Keep immutable fields
      id: existing.id,
      created_at: existing.created_at,
      created_by: existing.created_by,
      user_id: existing.user_id,
      // Bump metadata
      version: existing.version + 1,
      updated_at: new Date().toISOString(),
      // Preserve fields not in NoteUpdate
      access_count: existing.access_count,
      access_log: existing.access_log,
      activation: existing.activation,
      half_life: existing.half_life,
      source: existing.source,
    };

    // Use non-null embedding — either the updated one or the existing one
    merged.embedding = updates.embedding ?? existing.embedding;

    const key = this._noteKey(userId, id);
    const serialized = serializeNote(merged);
    await this._client.hSet(key, serialized);

    return merged;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const key = this._noteKey(userId, id);
    const result = await this._client.del(key);
    return result > 0;
  }

  // -- Bulk operations -----------------------------------------------------

  async listByUser(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<Note[]> {
    const pattern = `${this._prefix}${userId}:note:*`;
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const keys: string[] = [];
    for await (const keyOrKeys of this._client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      // scanIterator may yield string or string[] depending on redis version
      if (Array.isArray(keyOrKeys)) {
        keys.push(...keyOrKeys);
      } else {
        keys.push(keyOrKeys as string);
      }
    }

    // Sort for deterministic ordering
    keys.sort();

    const paged = keys.slice(offset, offset + limit);
    const notes: Note[] = [];

    for (const key of paged) {
      const data = await this._client.hGetAll(key);
      if (data && Object.keys(data).length > 0) {
        notes.push(deserializeNote(data));
      }
    }

    return notes;
  }

  async countByUser(userId: string): Promise<number> {
    const pattern = `${this._prefix}${userId}:note:*`;
    let count = 0;

    for await (const keyOrKeys of this._client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (Array.isArray(keyOrKeys)) {
        count += keyOrKeys.length;
      } else {
        count++;
      }
    }

    return count;
  }

  // -- Search (stub — implemented in Task 2) --------------------------------

  async search(_options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    throw new Error("search() not yet implemented — see Task 2");
  }

  // -- Private helpers -----------------------------------------------------

  private _noteKey(userId: string, noteId: string): string {
    return `${this._prefix}${userId}:note:${noteId}`;
  }

  /** Create the RediSearch vector index if it does not already exist. */
  async _ensureIndex(): Promise<void> {
    // Will be fully implemented in Task 2
    this._indexCreated = true;
  }
}
