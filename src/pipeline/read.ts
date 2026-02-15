import type { Note } from "../types/note.js";
import { getStore } from "../plugin.js";
import { getEmbeddingProvider } from "../plugin.js";

export interface SearchOptions {
  query: string;              // Natural language query
  userId: string;
  topK?: number;              // Default 10
  minScore?: number;          // Minimum similarity threshold
  expandLinks?: boolean;      // Default true — include 1-hop linked notes
}

export interface SearchResult {
  note: Note;
  score: number;              // Similarity score from vector search
  linkedNotes?: Note[];       // 1-hop linked notes (if expandLinks=true)
}

/**
 * Semantic search over memory notes.
 *
 * 1. Embeds query via the configured embedding provider
 * 2. Performs vector similarity search through the store
 * 3. Optionally expands results with 1-hop linked notes
 * 4. Fires non-blocking access tracking (future: ACT-R activation)
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    userId,
    topK = 10,
    minScore,
    expandLinks = true,
  } = options;

  const store = getStore();
  const embeddingProvider = getEmbeddingProvider();

  // 1. Embed the natural language query
  const queryEmbedding = await embeddingProvider.embed(query);

  // 2. Vector search
  const vectorResults = await store.search({
    query: queryEmbedding,
    userId,
    topK,
    minScore,
  });

  // 3. Build search results
  const results: SearchResult[] = vectorResults.map((vr) => ({
    note: vr.note,
    score: vr.score,
  }));

  // 4. Expand 1-hop linked notes if requested
  if (expandLinks && results.length > 0) {
    const resultIds = new Set(results.map((r) => r.note.id));

    for (const result of results) {
      if (result.note.links.length === 0) continue;

      // Collect linked IDs not already in result set
      const linkedIds = result.note.links.filter((id) => !resultIds.has(id));
      if (linkedIds.length === 0) continue;

      // Batch-fetch linked notes (filter by userId for isolation)
      const linkedNotes: Note[] = [];
      for (const linkedId of linkedIds) {
        const linked = await store.read(linkedId, userId);
        if (linked) {
          linkedNotes.push(linked);
        }
        // Silently skip null results (deleted or wrong user)
      }

      if (linkedNotes.length > 0) {
        result.linkedNotes = linkedNotes;
      }
    }
  }

  // 5. Fire-and-forget access tracking (non-blocking for SEARCH-02: 200ms target)
  // Note: store.update with empty update — store implementations should handle
  // access_count/access_log bumping internally. If not yet supported, this is a
  // no-op that will be wired up in Phase 3 (ACT-R activation).
  for (const result of results) {
    void store.update(result.note.id, userId, {}).catch(() => {
      // Silently swallow — access tracking is best-effort
    });
  }

  return results;
}
