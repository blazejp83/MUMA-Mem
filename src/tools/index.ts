import type { Visibility } from "../types/note.js";
import { write } from "../pipeline/write.js";
import { search } from "../pipeline/read.js";
import { getStore } from "../plugin.js";

const VALID_VISIBILITY = new Set<Visibility>(["open", "scoped", "private", "user-only"]);

/**
 * PLUG-06: Register 5 agent tools for memory operations.
 *
 * Tools: memory.write, memory.query, memory.forget, memory.pin, memory.set_visibility
 *
 * Uses the OpenClaw plugin SDK tool registration pattern. Each tool receives
 * a context object with userId and agentId from the request context.
 */
export function registerTools(api: any): void {
  // 1. memory.write — Write a memory
  api.registerTool({
    name: "memory.write",
    description: "Write a memory to long-term storage. The system automatically extracts facts, deduplicates against existing memories, and links related notes.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The memory content to store",
        },
        source: {
          type: "string",
          enum: ["experience", "told", "inferred"],
          description: "Origin type: 'experience' (agent observed), 'told' (user stated), 'inferred' (agent deduced). Default: 'experience'",
        },
      },
      required: ["content"],
    },
    execute: async (params: { content: string; source?: string }, context: any) => {
      const result = await write(params.content, {
        userId: context.userId,
        agentId: context.agentId,
        source: (params.source as "experience" | "told" | "inferred") ?? "experience",
      });
      return {
        operation: result.operation,
        noteId: result.note?.id ?? result.targetNoteId ?? null,
        reason: result.reason,
      };
    },
  });

  // 2. memory.query — Search memories
  api.registerTool({
    name: "memory.query",
    description: "Search long-term memories using natural language. Returns relevant memories ranked by semantic similarity, optionally including linked notes for richer context.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
        topK: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
        },
        expandLinks: {
          type: "boolean",
          description: "Include 1-hop linked notes in results (default: true)",
        },
      },
      required: ["query"],
    },
    execute: async (params: { query: string; topK?: number; expandLinks?: boolean }, context: any) => {
      const results = await search({
        query: params.query,
        userId: context.userId,
        topK: params.topK,
        expandLinks: params.expandLinks,
      });
      return results.map((r) => ({
        content: r.note.content,
        context: r.note.context,
        keywords: r.note.keywords,
        score: r.score,
        linkedNotes: r.linkedNotes?.map((ln) => ({
          content: ln.content,
          context: ln.context,
          keywords: ln.keywords,
        })),
      }));
    },
  });

  // 3. memory.forget — Delete a memory
  api.registerTool({
    name: "memory.forget",
    description: "Delete a specific memory by its note ID. This performs a soft delete.",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "The ID of the note to delete",
        },
      },
      required: ["noteId"],
    },
    execute: async (params: { noteId: string }, context: any) => {
      const store = getStore();
      const success = await store.delete(params.noteId, context.userId);
      return { success };
    },
  });

  // 4. memory.pin — Pin/unpin a memory
  api.registerTool({
    name: "memory.pin",
    description: "Pin or unpin a memory. Pinned memories are exempt from decay and forgetting.",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "The ID of the note to pin/unpin",
        },
        pinned: {
          type: "boolean",
          description: "Whether to pin (true) or unpin (false). Default: true",
        },
      },
      required: ["noteId"],
    },
    execute: async (params: { noteId: string; pinned?: boolean }, context: any) => {
      const store = getStore();
      const pinned = params.pinned ?? true;
      const updated = await store.update(params.noteId, context.userId, { pinned });
      return {
        success: updated !== null,
        pinned,
      };
    },
  });

  // 5. memory.set_visibility — Change memory visibility
  api.registerTool({
    name: "memory.set_visibility",
    description: "Change the visibility level of a memory. Controls which agents can access it.",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "The ID of the note to update",
        },
        visibility: {
          type: "string",
          enum: ["open", "scoped", "private", "user-only"],
          description: "Visibility level: 'open' (any agent), 'scoped' (same domain), 'private' (restricted), 'user-only' (owner only)",
        },
      },
      required: ["noteId", "visibility"],
    },
    execute: async (params: { noteId: string; visibility: string }, context: any) => {
      if (!VALID_VISIBILITY.has(params.visibility as Visibility)) {
        return {
          success: false,
          visibility: params.visibility,
          error: `Invalid visibility level: ${params.visibility}. Must be one of: open, scoped, private, user-only`,
        };
      }
      const store = getStore();
      const updated = await store.update(params.noteId, context.userId, {
        visibility: params.visibility as Visibility,
      });
      return {
        success: updated !== null,
        visibility: params.visibility,
      };
    },
  });
}
