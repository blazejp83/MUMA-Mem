import type { WriteOperation } from "../types/note.js";
import type { NoteCreate } from "../types/note.js";
import type { VectorSearchResult } from "../types/store.js";
import type { LLMProvider } from "../llm/provider.js";

export interface WriteDecision {
  operation: WriteOperation;   // "ADD" | "UPDATE" | "DELETE" | "NOOP"
  targetNoteId?: string;       // ID of existing note to UPDATE or DELETE (undefined for ADD/NOOP)
  reason: string;              // LLM explanation for the decision
  mergedContent?: string;      // For UPDATE: the merged content combining old + new
}

const DECIDE_SYSTEM_PROMPT = `You are a memory deduplication and management system. Given a new candidate memory and a list of similar existing memories, decide what write operation to perform.

The four operations are:

1. "ADD" - No semantic equivalent exists among the similar memories. The new information is distinct and should be stored as a new note.

2. "UPDATE" - An existing note covers the same topic but the new information adds to it, refines it, or provides more recent data. Provide the targetNoteId of the note to update and mergedContent that combines the existing note's content with the new information into a single coherent statement.

3. "DELETE" - The new information directly contradicts and supersedes an existing note, making the old note incorrect or obsolete. Provide the targetNoteId of the note to delete. The new information will be added separately.

4. "NOOP" - The new information is already adequately captured by an existing note. No action needed. Provide the targetNoteId of the existing note that covers it.

Respond with a JSON object containing:
- "operation": one of "ADD", "UPDATE", "DELETE", "NOOP"
- "targetNoteId": the ID of the existing note (required for UPDATE, DELETE, NOOP; omit for ADD)
- "reason": a brief explanation of why this operation was chosen
- "mergedContent": the merged content string (required for UPDATE; omit otherwise)

Respond ONLY with valid JSON. No markdown fences, no explanation.`;

const VALID_OPERATIONS = new Set<WriteOperation>(["ADD", "UPDATE", "DELETE", "NOOP"]);

/**
 * PIPE-04: Decide the write operation for a candidate note.
 *
 * If no similar notes exist, returns ADD immediately. Otherwise, uses
 * the LLM to compare the new note against similar existing notes and
 * determine the appropriate operation (ADD/UPDATE/DELETE/NOOP).
 */
export async function decide(
  noteCreate: NoteCreate,
  similar: VectorSearchResult[],
  llm: LLMProvider,
): Promise<WriteDecision> {
  // Fast path: no similar notes means ADD
  if (similar.length === 0) {
    return {
      operation: "ADD",
      reason: "No similar memories found",
    };
  }

  // Build user prompt with candidate and similar notes
  const similarDescriptions = similar.map((s, i) => {
    const n = s.note;
    return [
      `--- Similar Note ${i + 1} ---`,
      `ID: ${n.id}`,
      `Content: ${n.content}`,
      `Context: ${n.context}`,
      `Keywords: ${n.keywords.join(", ")}`,
      `Similarity Score: ${s.score.toFixed(4)}`,
    ].join("\n");
  }).join("\n\n");

  const userPrompt = [
    "=== NEW CANDIDATE MEMORY ===",
    `Content: ${noteCreate.content}`,
    `Context: ${noteCreate.context ?? ""}`,
    `Keywords: ${(noteCreate.keywords ?? []).join(", ")}`,
    "",
    "=== SIMILAR EXISTING MEMORIES ===",
    similarDescriptions,
    "",
    "Decide the write operation for the new candidate memory.",
  ].join("\n");

  const raw = await llm.generateJSON<Partial<WriteDecision>>(userPrompt, {
    systemPrompt: DECIDE_SYSTEM_PROMPT,
    temperature: 0.2,
  });

  // Validate the response
  const operation = VALID_OPERATIONS.has(raw.operation as WriteOperation)
    ? (raw.operation as WriteOperation)
    : "ADD";

  const validNoteIds = new Set(similar.map((s) => s.note.id));

  // Validate targetNoteId if provided
  const targetNoteId = typeof raw.targetNoteId === "string" && validNoteIds.has(raw.targetNoteId)
    ? raw.targetNoteId
    : undefined;

  // If operation requires a target but none is valid, default to ADD
  if ((operation === "UPDATE" || operation === "DELETE" || operation === "NOOP") && !targetNoteId) {
    return {
      operation: "ADD",
      reason: `Defaulted to ADD: LLM chose ${operation} but provided no valid target note ID`,
    };
  }

  return {
    operation,
    targetNoteId,
    reason: typeof raw.reason === "string" ? raw.reason : "LLM decision",
    mergedContent: operation === "UPDATE" && typeof raw.mergedContent === "string"
      ? raw.mergedContent
      : undefined,
  };
}
