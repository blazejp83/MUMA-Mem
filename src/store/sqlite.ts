import Database, { type Database as DatabaseType } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type {
  MemoryStore,
  VectorSearchOptions,
  VectorSearchResult,
} from "../types/store.js";
import type { Note, NoteCreate, NoteUpdate } from "../types/note.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SqliteStoreConfig {
  path: string; // Use ":memory:" for in-memory database
}

// ---------------------------------------------------------------------------
// SQLiteMemoryStore
// ---------------------------------------------------------------------------

export class SQLiteMemoryStore implements MemoryStore {
  readonly backend = "sqlite" as const;

  private _db: DatabaseType | null = null;
  private _dimensions: number | null = null;
  private _vecTableCreated = false;
  private _config: SqliteStoreConfig;
  private _embeddingDimensions: number | undefined;

  constructor(config: SqliteStoreConfig, embeddingDimensions?: number) {
    this._config = config;
    this._embeddingDimensions = embeddingDimensions;
  }

  // -- Accessors -----------------------------------------------------------

  get dimensions(): number | null {
    return this._dimensions;
  }

  // -- Lifecycle -----------------------------------------------------------

  async initialize(): Promise<void> {
    this._db = new Database(this._config.path);

    // Load sqlite-vec extension
    sqliteVec.load(this._db);

    // Enable WAL mode for concurrent read performance
    this._db.pragma("journal_mode = WAL");

    // Create notes table with all 22 Note fields (embedding stored separately in vec table)
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        keywords TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        links TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        user_id TEXT NOT NULL,
        domain TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'scoped',
        access_count INTEGER NOT NULL DEFAULT 0,
        access_log TEXT NOT NULL DEFAULT '[]',
        activation REAL NOT NULL DEFAULT 0,
        half_life REAL NOT NULL DEFAULT 168,
        importance REAL NOT NULL DEFAULT 0.5,
        source TEXT NOT NULL DEFAULT 'experience',
        confidence REAL NOT NULL DEFAULT 0.5,
        version INTEGER NOT NULL DEFAULT 1,
        pinned INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create indexes for user isolation and common queries
    this._db.exec(
      `CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id)`,
    );
    this._db.exec(
      `CREATE INDEX IF NOT EXISTS idx_notes_domain ON notes(user_id, domain)`,
    );
    this._db.exec(
      `CREATE INDEX IF NOT EXISTS idx_notes_vis ON notes(user_id, visibility)`,
    );

    // If dimensions are known upfront, create vec table immediately
    if (this._embeddingDimensions !== undefined) {
      this._dimensions = this._embeddingDimensions;
      this._createVecTable(this._embeddingDimensions);
    }
  }

  async close(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }

  // -- CRUD ----------------------------------------------------------------

  async create(noteCreate: NoteCreate): Promise<Note> {
    const db = this._getDb();
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

    // Insert into notes table
    const insertNote = db.prepare(`
      INSERT INTO notes (
        id, content, context, keywords, tags, links,
        created_at, updated_at, created_by, user_id, domain, visibility,
        access_count, access_log, activation, half_life, importance,
        source, confidence, version, pinned
      ) VALUES (
        @id, @content, @context, @keywords, @tags, @links,
        @created_at, @updated_at, @created_by, @user_id, @domain, @visibility,
        @access_count, @access_log, @activation, @half_life, @importance,
        @source, @confidence, @version, @pinned
      )
    `);

    insertNote.run({
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
      access_count: note.access_count,
      access_log: JSON.stringify(note.access_log),
      activation: note.activation,
      half_life: note.half_life,
      importance: note.importance,
      source: note.source,
      confidence: note.confidence,
      version: note.version,
      pinned: note.pinned ? 1 : 0,
    });

    // Get the rowid assigned to this note (for vec table mapping)
    const rowInfo = db
      .prepare(`SELECT rowid FROM notes WHERE id = ?`)
      .get(note.id) as { rowid: number } | undefined;

    // Insert embedding into vec table if embedding exists
    if (note.embedding.length > 0) {
      // Ensure vec table exists (deferred creation)
      if (!this._vecTableCreated) {
        this._dimensions = note.embedding.length;
        this._createVecTable(note.embedding.length);
      }

      if (rowInfo) {
        this._insertEmbedding(rowInfo.rowid, note.embedding);
      }
    }

    return note;
  }

  async read(id: string, userId: string): Promise<Note | null> {
    const db = this._getDb();
    const row = db
      .prepare(`SELECT rowid, * FROM notes WHERE id = ? AND user_id = ?`)
      .get(id, userId) as (SqliteNoteRow & { rowid: number }) | undefined;

    if (!row) {
      return null;
    }

    // Fetch embedding from vec table
    const embedding = this._getEmbedding(row.rowid);

    return deserializeRow(row, embedding);
  }

  async update(
    id: string,
    userId: string,
    updates: NoteUpdate,
  ): Promise<Note | null> {
    const db = this._getDb();

    // Read existing first
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

    // Use non-null embedding
    merged.embedding = updates.embedding ?? existing.embedding;

    // Update notes table
    db.prepare(`
      UPDATE notes SET
        content = @content,
        context = @context,
        keywords = @keywords,
        tags = @tags,
        links = @links,
        updated_at = @updated_at,
        domain = @domain,
        visibility = @visibility,
        importance = @importance,
        confidence = @confidence,
        pinned = @pinned,
        version = @version
      WHERE id = @id AND user_id = @user_id
    `).run({
      id: merged.id,
      user_id: merged.user_id,
      content: merged.content,
      context: merged.context,
      keywords: JSON.stringify(merged.keywords),
      tags: JSON.stringify(merged.tags),
      links: JSON.stringify(merged.links),
      updated_at: merged.updated_at,
      domain: merged.domain,
      visibility: merged.visibility,
      importance: merged.importance,
      confidence: merged.confidence,
      pinned: merged.pinned ? 1 : 0,
      version: merged.version,
    });

    // Update embedding if changed
    if (updates.embedding) {
      const rowInfo = db
        .prepare(`SELECT rowid FROM notes WHERE id = ?`)
        .get(id) as { rowid: number } | undefined;

      if (rowInfo) {
        // Ensure vec table exists
        if (!this._vecTableCreated) {
          this._dimensions = updates.embedding.length;
          this._createVecTable(updates.embedding.length);
        }

        // Delete old embedding, insert new
        this._deleteEmbedding(rowInfo.rowid);
        this._insertEmbedding(rowInfo.rowid, updates.embedding);
      }
    }

    return merged;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const db = this._getDb();

    // Get rowid for vec table cleanup
    const rowInfo = db
      .prepare(`SELECT rowid FROM notes WHERE id = ? AND user_id = ?`)
      .get(id, userId) as { rowid: number } | undefined;

    const result = db
      .prepare(`DELETE FROM notes WHERE id = ? AND user_id = ?`)
      .run(id, userId);

    // Clean up vec table
    if (rowInfo && this._vecTableCreated) {
      this._deleteEmbedding(rowInfo.rowid);
    }

    return result.changes > 0;
  }

  // -- Bulk operations -----------------------------------------------------

  async listByUser(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<Note[]> {
    const db = this._getDb();
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    const rows = db
      .prepare(
        `SELECT rowid, * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(userId, limit, offset) as (SqliteNoteRow & { rowid: number })[];

    return rows.map((row) => {
      const embedding = this._getEmbedding(row.rowid);
      return deserializeRow(row, embedding);
    });
  }

  async countByUser(userId: string): Promise<number> {
    const db = this._getDb();
    const result = db
      .prepare(`SELECT COUNT(*) as count FROM notes WHERE user_id = ?`)
      .get(userId) as { count: number };

    return result.count;
  }

  // -- Search --------------------------------------------------------------

  async search(options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    // Vec table not created yet — return empty results
    if (!this._vecTableCreated) {
      return [];
    }

    const db = this._getDb();
    const topK = options.topK ?? 10;

    // sqlite-vec KNN query: use MATCH with raw float buffer, k = N in WHERE
    // We fetch more candidates than needed because the user_id filter is
    // applied after the KNN search (vec table has no user_id column).
    const overFetchK = topK * 3;

    const queryBuffer = Buffer.from(
      options.query.buffer,
      options.query.byteOffset,
      options.query.byteLength,
    );

    // Two-step query: KNN from vec_notes, then join with notes for user filter
    const rows = db
      .prepare(
        `
        SELECT
          n.rowid as note_rowid,
          n.*,
          v.distance
        FROM (
          SELECT note_rowid, distance
          FROM vec_notes
          WHERE embedding MATCH ?
            AND k = ?
        ) v
        INNER JOIN notes n ON n.rowid = v.note_rowid
        WHERE n.user_id = ?
        LIMIT ?
        `,
      )
      .all(queryBuffer, overFetchK, options.userId, topK) as (SqliteNoteRow & {
      note_rowid: number;
      distance: number;
    })[];

    const results: VectorSearchResult[] = [];

    for (const row of rows) {
      // Convert distance to similarity score (cosine distance → similarity)
      const score = 1 - row.distance;

      // Apply minScore filter
      if (options.minScore !== undefined && score < options.minScore) {
        continue;
      }

      const embedding = this._getEmbedding(row.note_rowid);
      const note = deserializeRow(row, embedding);

      results.push({ note, score });
    }

    return results;
  }

  // -- Private helpers -----------------------------------------------------

  private _getDb(): DatabaseType {
    if (!this._db) {
      throw new Error(
        "SQLiteMemoryStore not initialized. Call initialize() first.",
      );
    }
    return this._db;
  }

  /**
   * Create the vec0 virtual table for vector search.
   * Must know dimensions before creation.
   */
  private _createVecTable(dimensions: number): void {
    if (this._vecTableCreated) return;
    const db = this._getDb();

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_notes USING vec0(
        note_rowid INTEGER PRIMARY KEY,
        embedding float[${dimensions}]
      )
    `);

    this._vecTableCreated = true;
  }

  /**
   * Insert embedding vector for a note row.
   * sqlite-vec requires BigInt for integer primary key values in bindings.
   */
  private _insertEmbedding(noteRowid: number, embedding: Float32Array): void {
    const db = this._getDb();
    db.prepare(
      `INSERT INTO vec_notes(note_rowid, embedding) VALUES (?, ?)`,
    ).run(
      BigInt(noteRowid),
      Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
    );
  }

  /** Delete embedding vector for a note row. */
  private _deleteEmbedding(noteRowid: number): void {
    const db = this._getDb();
    db.prepare(`DELETE FROM vec_notes WHERE note_rowid = ?`).run(
      BigInt(noteRowid),
    );
  }

  /** Get embedding vector for a note row. Returns empty Float32Array if not found. */
  private _getEmbedding(noteRowid: number): Float32Array {
    if (!this._vecTableCreated) {
      return new Float32Array(0);
    }

    const db = this._getDb();
    const row = db
      .prepare(`SELECT embedding FROM vec_notes WHERE note_rowid = ?`)
      .get(BigInt(noteRowid)) as { embedding: Buffer } | undefined;

    if (!row || !row.embedding) {
      return new Float32Array(0);
    }

    const buf = Buffer.isBuffer(row.embedding)
      ? row.embedding
      : Buffer.from(row.embedding as unknown as string, "binary");

    return new Float32Array(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );
  }
}

// ---------------------------------------------------------------------------
// Row type and deserialization
// ---------------------------------------------------------------------------

interface SqliteNoteRow {
  id: string;
  content: string;
  context: string;
  keywords: string;
  tags: string;
  links: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  user_id: string;
  domain: string;
  visibility: string;
  access_count: number;
  access_log: string;
  activation: number;
  half_life: number;
  importance: number;
  source: string;
  confidence: number;
  version: number;
  pinned: number;
}

function deserializeRow(row: SqliteNoteRow, embedding: Float32Array): Note {
  return {
    id: row.id,
    content: row.content,
    context: row.context,
    keywords: JSON.parse(row.keywords),
    tags: JSON.parse(row.tags),
    links: JSON.parse(row.links),
    created_at: row.created_at,
    updated_at: row.updated_at,
    created_by: row.created_by,
    user_id: row.user_id,
    domain: row.domain,
    visibility: row.visibility as Note["visibility"],
    access_count: row.access_count,
    access_log: JSON.parse(row.access_log),
    activation: row.activation,
    half_life: row.half_life,
    importance: row.importance,
    source: row.source as Note["source"],
    confidence: row.confidence,
    version: row.version,
    pinned: row.pinned === 1,
    embedding,
  };
}
