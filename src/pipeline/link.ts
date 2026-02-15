import type { Note } from "../types/note.js";
import type { MemoryStore } from "../types/store.js";

export interface LinkResult {
  linkedNoteIds: string[]; // IDs of notes that were linked to
}

/**
 * PIPE-05, LINK-01, LINK-03, LINK-05: Auto-link new memory to related existing memories.
 *
 * Uses vector similarity (not LLM) to find related notes and creates
 * bidirectional links between the new note and each similar note.
 * Links are stored as string[] in note.links (JSON adjacency list).
 */
export async function link(
  note: Note,
  store: MemoryStore,
  options?: { maxLinks?: number; minScore?: number },
): Promise<LinkResult> {
  const maxLinks = options?.maxLinks ?? 5;
  const minScore = options?.minScore ?? 0.5;

  // Search for similar notes using the note's embedding
  const similar = await store.search({
    query: note.embedding,
    userId: note.user_id,
    topK: maxLinks + 1, // Overfetch by 1 to account for filtering self
    minScore,
  });

  // Filter out the note itself from results
  const candidates = similar.filter((r) => r.note.id !== note.id);

  // Cap at maxLinks after filtering
  const toLink = candidates.slice(0, maxLinks);

  if (toLink.length === 0) {
    return { linkedNoteIds: [] };
  }

  const linkedNoteIds: string[] = [];
  const newNoteLinks = new Set(note.links);

  for (const result of toLink) {
    const similarNote = result.note;

    // Add similar note's ID to the new note's links (if not already present)
    newNoteLinks.add(similarNote.id);

    // Add the new note's ID to the similar note's links (bidirectional — LINK-03)
    const similarNoteLinks = new Set(similarNote.links);
    if (!similarNoteLinks.has(note.id)) {
      similarNoteLinks.add(note.id);
      await store.update(similarNote.id, similarNote.user_id, {
        links: Array.from(similarNoteLinks),
      });
    }

    linkedNoteIds.push(similarNote.id);
  }

  // Update the new note with all accumulated links
  await store.update(note.id, note.user_id, {
    links: Array.from(newNoteLinks),
  });

  return { linkedNoteIds };
}
