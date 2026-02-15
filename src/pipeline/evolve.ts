import type { Note } from "../types/note.js";
import type { MemoryStore } from "../types/store.js";
import type { LLMProvider } from "../llm/provider.js";

export interface EvolveResult {
  updatedNoteIds: string[]; // IDs of notes whose context was updated
}

interface EvolveUpdate {
  noteId: string;
  shouldUpdate: boolean;
  updatedContext?: string;
  newTags?: string[];
}

interface EvolveResponse {
  updates: EvolveUpdate[];
}

const EVOLVE_SYSTEM_PROMPT = `You are a memory evolution system. When a new memory arrives that is linked to existing memories, you determine whether the existing memories' context should be updated to reflect the new relationship.

You will receive a new memory and a list of linked existing memories. For each existing memory, decide if its context field should be updated to incorporate awareness of the new related memory.

Rules:
- Only update context and tags — NEVER change the note's content (that would alter the original memory)
- Update context when the new memory adds meaningful relationship context (e.g., temporal sequence, causal link, elaboration)
- Add new tags only if the new memory introduces a clearly relevant category not already captured
- If the existing memory's context already captures the relationship, set shouldUpdate to false
- Be conservative: only update when the new information genuinely enriches understanding of the existing memory

Respond with a JSON object containing an "updates" array. Each element must have:
- "noteId": the ID of the existing note
- "shouldUpdate": boolean
- "updatedContext": the new context string (required if shouldUpdate is true; omit if false)
- "newTags": array of new tag strings to add (optional; omit if no new tags)

Respond ONLY with valid JSON. No markdown fences, no explanation.`;

const MAX_LINKED_NOTES = 5;

/**
 * PIPE-06, LINK-04: Update linked notes' context when new related memory arrives.
 *
 * Uses a single batched LLM call to determine which linked notes need
 * their context updated. Only modifies context and tags — never content.
 * Caps at 5 linked notes per call to bound LLM token usage.
 */
export async function evolve(
  note: Note,
  linkedNoteIds: string[],
  store: MemoryStore,
  llm: LLMProvider,
): Promise<EvolveResult> {
  if (linkedNoteIds.length === 0) {
    return { updatedNoteIds: [] };
  }

  // Cap linked notes to bound token usage
  const idsToProcess = linkedNoteIds.slice(0, MAX_LINKED_NOTES);

  // Fetch all linked notes
  const linkedNotes: Note[] = [];
  for (const id of idsToProcess) {
    const fetched = await store.read(id, note.user_id);
    if (fetched) {
      linkedNotes.push(fetched);
    }
  }

  if (linkedNotes.length === 0) {
    return { updatedNoteIds: [] };
  }

  // Build batched prompt with all linked notes
  const linkedDescriptions = linkedNotes
    .map((n, i) => {
      return [
        `--- Existing Memory ${i + 1} ---`,
        `ID: ${n.id}`,
        `Content: ${n.content}`,
        `Context: ${n.context}`,
        `Keywords: ${n.keywords.join(", ")}`,
        `Tags: ${n.tags.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");

  const userPrompt = [
    "=== NEW MEMORY (just added) ===",
    `Content: ${note.content}`,
    `Context: ${note.context}`,
    `Keywords: ${note.keywords.join(", ")}`,
    "",
    `=== LINKED EXISTING MEMORIES (${linkedNotes.length}) ===`,
    linkedDescriptions,
    "",
    "For each existing memory, determine if its context should be updated given the new related memory.",
  ].join("\n");

  // Single batched LLM call for all linked notes
  let response: EvolveResponse;
  try {
    response = await llm.generateJSON<EvolveResponse>(userPrompt, {
      systemPrompt: EVOLVE_SYSTEM_PROMPT,
      temperature: 0.3,
    });
  } catch {
    // If LLM returns invalid response, skip evolution (no data loss)
    return { updatedNoteIds: [] };
  }

  // Validate response structure
  if (!response || !Array.isArray(response.updates)) {
    return { updatedNoteIds: [] };
  }

  // Build a set of valid linked note IDs for validation
  const validNoteIds = new Set(linkedNotes.map((n) => n.id));
  const updatedNoteIds: string[] = [];

  for (const update of response.updates) {
    // Validate each update entry
    if (
      !update ||
      typeof update.noteId !== "string" ||
      !validNoteIds.has(update.noteId) ||
      update.shouldUpdate !== true
    ) {
      continue;
    }

    if (typeof update.updatedContext !== "string" || update.updatedContext.trim() === "") {
      continue;
    }

    // Find the linked note to get its current tags
    const linkedNote = linkedNotes.find((n) => n.id === update.noteId);
    if (!linkedNote) continue;

    // Merge tags: existing tags + any new tags from LLM
    const mergedTags = [...linkedNote.tags];
    if (Array.isArray(update.newTags)) {
      const existingTagSet = new Set(mergedTags);
      for (const tag of update.newTags) {
        if (typeof tag === "string" && tag.trim() !== "" && !existingTagSet.has(tag)) {
          mergedTags.push(tag);
          existingTagSet.add(tag);
        }
      }
    }

    // Update the linked note with new context and merged tags
    await store.update(update.noteId, note.user_id, {
      context: update.updatedContext,
      tags: mergedTags,
    });

    updatedNoteIds.push(update.noteId);
  }

  return { updatedNoteIds };
}
