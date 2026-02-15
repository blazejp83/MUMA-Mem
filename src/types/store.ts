import type { Note, NoteCreate, NoteUpdate, MemoryConflict } from "./note.js";

export interface VectorSearchOptions {
  query: Float32Array;           // Query embedding
  userId: string;                // User isolation
  topK?: number;                 // Default 10
  minScore?: number;             // Minimum similarity threshold
}

export interface VectorSearchResult {
  note: Note;
  score: number;                 // Similarity score
}

export interface MemoryStore {
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;

  // CRUD
  create(note: NoteCreate): Promise<Note>;
  read(id: string, userId: string): Promise<Note | null>;
  update(id: string, userId: string, updates: NoteUpdate): Promise<Note | null>;
  delete(id: string, userId: string): Promise<boolean>;

  // Search
  search(options: VectorSearchOptions): Promise<VectorSearchResult[]>;

  // Bulk operations
  listByUser(userId: string, options?: { limit?: number; offset?: number }): Promise<Note[]>;
  listAllNotes(options?: { limit?: number; offset?: number }): Promise<Note[]>;
  countByUser(userId: string): Promise<number>;

  // Conflict storage (for consolidation)
  saveConflicts(conflicts: MemoryConflict[]): Promise<void>;
  getConflicts(options?: { resolved?: boolean; limit?: number }): Promise<MemoryConflict[]>;
  resolveConflict(conflictId: string, resolution: string): Promise<boolean>;

  // Metadata
  readonly backend: "redis" | "sqlite";
  readonly dimensions: number | null;  // null until first vector stored
}
