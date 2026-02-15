export type Visibility = "open" | "scoped" | "private" | "user-only";
export type MemorySource = "experience" | "told" | "inferred";
export type WriteOperation = "ADD" | "UPDATE" | "DELETE" | "NOOP";

export interface Note {
  id: string;                    // UUID v4
  content: string;               // Natural language memory content
  context: string;               // LLM-generated semantic summary
  keywords: string[];            // Ordered by salience
  tags: string[];                // Categorical labels
  embedding: Float32Array;       // Dense vector from embedding provider
  links: string[];               // Bidirectional note IDs (JSON adjacency)
  created_at: string;            // ISO 8601 timestamp
  updated_at: string;            // ISO 8601 timestamp
  created_by: string;            // Agent ID that created this memory
  user_id: string;               // User isolation key
  domain: string;                // Topical classification (e.g., "business/sales")
  visibility: Visibility;        // Access scope
  access_count: number;          // Total retrievals
  access_log: string[];          // ISO 8601 timestamps of each retrieval
  activation: number;            // Current activation score
  half_life: number;             // Hours until retention drops to 50%
  importance: number;            // 0-1, LLM-scored at creation
  source: MemorySource;          // Origin type
  confidence: number;            // 0-1
  version: number;               // Incremented on update
  pinned: boolean;               // Exempt from decay if true
}

// For creating new notes (fields auto-populated by system)
export interface NoteCreate {
  content: string;
  context?: string;
  keywords?: string[];
  tags?: string[];
  embedding: Float32Array;
  links?: string[];
  created_by: string;
  user_id: string;
  domain?: string;
  visibility?: Visibility;
  importance?: number;
  source?: MemorySource;
  confidence?: number;
}

export interface NoteUpdate {
  content?: string;
  context?: string;
  keywords?: string[];
  tags?: string[];
  embedding?: Float32Array;
  links?: string[];
  domain?: string;
  visibility?: Visibility;
  importance?: number;
  confidence?: number;
  pinned?: boolean;
  access_count?: number;
  access_log?: string[];
  activation?: number;
  half_life?: number;
}
