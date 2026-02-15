import type { Visibility } from "../types/note.js";
import { write } from "../pipeline/write.js";
import { search } from "../pipeline/read.js";
import { getStore, getWorkingMemory, getTransactiveIndex, getConfig } from "../plugin.js";
import { resolveAgentProfile, canAgentSeeNote } from "../access/index.js";

const VALID_VISIBILITY = new Set<Visibility>(["open", "scoped", "private", "user-only"]);

/**
 * PLUG-06 + PLUG-07: Register 10 agent tools for memory operations.
 *
 * Core tools (PLUG-06): memory.write, memory.query, memory.forget, memory.pin, memory.set_visibility
 * Extended tools (PLUG-07): memory.get_context, memory.stats, memory.link, memory.search_agents, memory.consolidate
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

  // --- Extended tools (PLUG-07) ---

  // 6. memory.get_context — Get current memory context for this agent
  api.registerTool({
    name: "memory.get_context",
    description: "Get current memory context for this agent, including session (L1) and long-term (L2) memories filtered by visibility.",
    parameters: {
      type: "object",
      properties: {
        topK: {
          type: "number",
          description: "Maximum number of L2 memories to return (default: 10)",
        },
      },
    },
    execute: async (params: { topK?: number }, context: any) => {
      const store = getStore();
      const config = getConfig();
      const topK = params.topK ?? 10;

      // L1: Get working memory items (if session exists)
      const l1Items: Array<{ content: string; activation: number; source: string }> = [];
      if (context.sessionId) {
        const wm = getWorkingMemory(context.sessionId);
        if (wm) {
          const items = wm.getContextItems(context.userId, context.agentId, topK);
          for (const item of items) {
            l1Items.push({
              content: item.content,
              activation: item.activation,
              source: item.source,
            });
          }
        }
      }

      // L2: Get long-term memories filtered by visibility
      const allNotes = await store.listByUser(context.userId, { limit: topK * 2 });
      const profile = resolveAgentProfile(context.agentId, config);
      const filtered = allNotes.filter((note) =>
        canAgentSeeNote(note, context.agentId, profile),
      );
      const l2Notes = filtered.slice(0, topK).map((note) => ({
        id: note.id,
        content: note.content,
        domain: note.domain,
        visibility: note.visibility,
        activation: note.activation,
      }));

      return { l1: l1Items, l2: l2Notes };
    },
  });

  // 7. memory.stats — Memory statistics
  api.registerTool({
    name: "memory.stats",
    description: "Get memory statistics for the current user, including total count, backend type, and activation score distribution.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_params: Record<string, never>, context: any) => {
      const store = getStore();
      const totalMemories = await store.countByUser(context.userId);

      // Compute activation distribution
      const notes = await store.listByUser(context.userId, { limit: 1000 });
      let high = 0;
      let medium = 0;
      let low = 0;
      for (const note of notes) {
        if (note.activation > 2.0) {
          high++;
        } else if (note.activation >= 0) {
          medium++;
        } else {
          low++;
        }
      }

      return {
        totalMemories,
        backend: store.backend,
        activationDistribution: { high, medium, low },
      };
    },
  });

  // 8. memory.link — Manually link two notes
  api.registerTool({
    name: "memory.link",
    description: "Manually create a bidirectional link between two memory notes.",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "The ID of the first note",
        },
        targetNoteId: {
          type: "string",
          description: "The ID of the second note to link to",
        },
      },
      required: ["noteId", "targetNoteId"],
    },
    execute: async (params: { noteId: string; targetNoteId: string }, context: any) => {
      const store = getStore();
      const noteA = await store.read(params.noteId, context.userId);
      const noteB = await store.read(params.targetNoteId, context.userId);

      if (!noteA || !noteB) {
        return {
          success: false,
          noteId: params.noteId,
          targetNoteId: params.targetNoteId,
          error: !noteA ? `Note ${params.noteId} not found` : `Note ${params.targetNoteId} not found`,
        };
      }

      // Add bidirectional links (avoid duplicates)
      const linksA = new Set(noteA.links);
      const linksB = new Set(noteB.links);
      linksA.add(params.targetNoteId);
      linksB.add(params.noteId);

      await store.update(params.noteId, context.userId, { links: Array.from(linksA) });
      await store.update(params.targetNoteId, context.userId, { links: Array.from(linksB) });

      return {
        success: true,
        noteId: params.noteId,
        targetNoteId: params.targetNoteId,
      };
    },
  });

  // 9. memory.search_agents — Find agents with expertise in a domain
  api.registerTool({
    name: "memory.search_agents",
    description: "Find agents with expertise in a specific domain based on their write activity. Uses the transactive memory index.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "The domain to search for expert agents (e.g., 'business/sales')",
        },
        topK: {
          type: "number",
          description: "Maximum number of expert agents to return (default: 5)",
        },
      },
      required: ["domain"],
    },
    execute: async (params: { domain: string; topK?: number }) => {
      const index = getTransactiveIndex();
      if (!index) {
        return { experts: [], message: "Transactive memory index not available." };
      }
      const experts = index.getExpertsForDomain(params.domain, params.topK ?? 5);
      return { experts };
    },
  });

  // 10. memory.consolidate — Trigger manual consolidation (Phase 5 placeholder)
  api.registerTool({
    name: "memory.consolidate",
    description: "Trigger manual memory consolidation. This feature is planned for a future version.",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      return {
        status: "not_available",
        message: "Consolidation will be available in a future version.",
      };
    },
  });
}
