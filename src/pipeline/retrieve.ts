import type { NoteCreate } from "../types/note.js";
import type { MemoryStore, VectorSearchResult } from "../types/store.js";

/**
 * PIPE-03: Retrieve similar existing notes for a candidate note.
 *
 * Wraps store.search() with the new note's embedding and userId,
 * returning results sorted by similarity score. This is a thin wrapper
 * that gives the pipeline a named step with a clear interface.
 */
export async function retrieve(
  noteCreate: NoteCreate,
  store: MemoryStore,
  topK?: number,
): Promise<VectorSearchResult[]> {
  return store.search({
    query: noteCreate.embedding,
    userId: noteCreate.user_id,
    topK: topK ?? 10,
  });
}
