import type { Note, MemorySource, WriteOperation } from "../types/note.js";
import { getStore, getEmbeddingProvider, getLLMProvider, getEventBus } from "../plugin.js";
import { extract } from "./extract.js";
import { construct } from "./construct.js";
import { retrieve } from "./retrieve.js";
import { decide } from "./decide.js";
import { link } from "./link.js";
import { evolve } from "./evolve.js";

export interface WriteOptions {
  userId: string;
  agentId: string;
  source?: MemorySource;      // Default "experience"
}

export interface WriteResult {
  operation: WriteOperation;   // What happened
  note: Note | null;           // The created/updated note (null for DELETE/NOOP)
  targetNoteId?: string;       // For UPDATE/DELETE/NOOP: the existing note affected
  reason: string;              // LLM explanation
}

/**
 * Full write pipeline orchestrator.
 *
 * Composes the Extract -> Construct -> Retrieve -> Decide -> Link -> Evolve chain.
 *
 * 1. Extract: Parse raw input into structured facts via LLM
 * 2. Construct: Build a NoteCreate with embedding
 * 3. Retrieve: Find similar existing notes via vector search
 * 4. Decide: LLM determines operation (ADD/UPDATE/DELETE/NOOP)
 * 5. Execute: Perform the decided operation on the store
 * 6. Link + Evolve: For ADD/UPDATE, create links and evolve context
 */
export async function write(
  input: string,
  options: WriteOptions,
): Promise<WriteResult> {
  const store = getStore();
  const embedding = getEmbeddingProvider();
  const llm = getLLMProvider();

  // 1. Extract structured facts from raw input
  const facts = await extract(input, llm);

  // 2. Construct a NoteCreate object with embedding
  const noteCreate = await construct(facts, embedding, options);

  // 3. Retrieve similar existing notes
  const similar = await retrieve(noteCreate, store);

  // 4. Decide what write operation to perform
  const decision = await decide(noteCreate, similar, llm);

  // 5. Execute based on decision
  let note: Note | null = null;

  const bus = getEventBus();

  switch (decision.operation) {
    case "ADD": {
      note = await store.create(noteCreate);
      // Fire-and-forget event emission (non-blocking)
      if (bus && note) {
        void bus.emit({
          type: "memory:write",
          noteId: note.id,
          userId: options.userId,
          agentId: options.agentId,
          domain: note.domain,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      break;
    }
    case "UPDATE": {
      await store.update(decision.targetNoteId!, options.userId, {
        content: decision.mergedContent,
        context: facts.context,
        keywords: facts.keywords,
        tags: facts.tags,
        embedding: noteCreate.embedding,
      });
      note = await store.read(decision.targetNoteId!, options.userId);
      // Fire-and-forget event emission (non-blocking)
      if (bus) {
        void bus.emit({
          type: "memory:update",
          noteId: decision.targetNoteId!,
          userId: options.userId,
          agentId: options.agentId,
          domain: note?.domain ?? "",
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      break;
    }
    case "DELETE": {
      await store.delete(decision.targetNoteId!, options.userId);
      // Fire-and-forget event emission (non-blocking)
      if (bus) {
        void bus.emit({
          type: "memory:delete",
          noteId: decision.targetNoteId!,
          userId: options.userId,
          agentId: options.agentId,
          domain: "",
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
      return {
        operation: "DELETE",
        note: null,
        targetNoteId: decision.targetNoteId,
        reason: decision.reason,
      };
    }
    case "NOOP": {
      return {
        operation: "NOOP",
        note: null,
        targetNoteId: decision.targetNoteId,
        reason: decision.reason,
      };
    }
  }

  // 6. For ADD/UPDATE — run link + evolve
  if (note) {
    const linkResult = await link(note, store);
    await evolve(note, linkResult.linkedNoteIds, store, llm);
  }

  return {
    operation: decision.operation,
    note,
    targetNoteId: decision.targetNoteId,
    reason: decision.reason,
  };
}
