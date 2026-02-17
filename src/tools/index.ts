import type { Visibility } from "../types/note.js";
import type {
  OpenClawPluginApi,
  OpenClawPluginToolContext,
  AgentTool,
} from "../types/openclaw.js";
import { deriveUserId } from "../utils/index.js";
import { write } from "../pipeline/write.js";
import { search } from "../pipeline/read.js";
import { getStore, getWorkingMemory, getTransactiveIndex, getConfig, getEmbeddingProvider, getLLMProvider, getReverseIdentityMap } from "../plugin.js";
import { resolveAgentProfile, canAgentSeeNote } from "../access/index.js";
import { consolidate } from "../consolidation/consolidate.js";
import { distillMemoryMd, writeMemoryMdFile } from "../consolidation/distill.js";

const VALID_VISIBILITY = new Set<Visibility>(["open", "scoped", "private", "user-only"]);

/**
 * Tool names registered by the factory.
 * Used in registerTool opts to declare the tool names to OpenClaw.
 */
const TOOL_NAMES = [
  "memory_write",
  "memory_query",
  "memory_forget",
  "memory_pin",
  "memory_set_visibility",
  "memory_get_context",
  "memory_stats",
  "memory_link",
  "memory_search_agents",
  "memory_consolidate",
] as const;

/**
 * PLUG-06 + PLUG-07: Register 10 agent tools for memory operations via the
 * OpenClaw factory pattern.
 *
 * The factory function receives OpenClawPluginToolContext per-session and
 * captures userId/agentId in the closure. Tools use the SDK-required
 * execute(toolCallId, params) signature.
 *
 * Core tools (PLUG-06): memory_write, memory_query, memory_forget, memory_pin, memory_set_visibility
 * Extended tools (PLUG-07): memory_get_context, memory_stats, memory_link, memory_search_agents, memory_consolidate
 */
export function registerTools(api: OpenClawPluginApi): void {
  api.registerTool(
    (ctx: OpenClawPluginToolContext): AgentTool[] => {
      // Derive userId and agentId from factory context — captured in closure
      const userId = deriveUserId(ctx.sessionKey, getReverseIdentityMap());
      const agentId = ctx.agentId ?? "unknown";

      return [
        // 1. memory_write — Write a memory
        {
          label: "Memory Write",
          name: "memory_write",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { content: string; source?: string };
            const result = await write(p.content, {
              userId,
              agentId,
              source: (p.source as "experience" | "told" | "inferred") ?? "experience",
            });
            return {
              operation: result.operation,
              noteId: result.note?.id ?? result.targetNoteId ?? null,
              reason: result.reason,
            };
          },
        },

        // 2. memory_query — Search memories
        {
          label: "Memory Query",
          name: "memory_query",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { query: string; topK?: number; expandLinks?: boolean };
            const results = await search({
              query: p.query,
              userId,
              topK: p.topK,
              expandLinks: p.expandLinks,
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
        },

        // 3. memory_forget — Delete a memory
        {
          label: "Memory Forget",
          name: "memory_forget",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { noteId: string };
            const store = getStore();
            const success = await store.delete(p.noteId, userId);
            return { success };
          },
        },

        // 4. memory_pin — Pin/unpin a memory
        {
          label: "Memory Pin",
          name: "memory_pin",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { noteId: string; pinned?: boolean };
            const store = getStore();
            const pinned = p.pinned ?? true;
            const updated = await store.update(p.noteId, userId, { pinned });
            return {
              success: updated !== null,
              pinned,
            };
          },
        },

        // 5. memory_set_visibility — Change memory visibility
        {
          label: "Memory Set Visibility",
          name: "memory_set_visibility",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { noteId: string; visibility: string };
            if (!VALID_VISIBILITY.has(p.visibility as Visibility)) {
              return {
                success: false,
                visibility: p.visibility,
                error: `Invalid visibility level: ${p.visibility}. Must be one of: open, scoped, private, user-only`,
              };
            }
            const store = getStore();
            const updated = await store.update(p.noteId, userId, {
              visibility: p.visibility as Visibility,
            });
            return {
              success: updated !== null,
              visibility: p.visibility,
            };
          },
        },

        // --- Extended tools (PLUG-07) ---

        // 6. memory_get_context — Get current memory context for this agent
        {
          label: "Memory Get Context",
          name: "memory_get_context",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { topK?: number };
            const store = getStore();
            const config = getConfig();
            const topK = p.topK ?? 10;

            // L1: Get working memory items (if session exists)
            // Note: The factory ctx provides sessionKey but not sessionId.
            // The sessions Map in plugin.ts is keyed by sessionId (from hook context),
            // so sessionKey cannot be used to look up sessionId-keyed working memory.
            // L1 lookup is limited here; will be addressed in Phase 10 via session_start hook.
            const l1Items: Array<{ content: string; activation: number; source: string }> = [];

            // L2: Get long-term memories filtered by visibility
            const allNotes = await store.listByUser(userId, { limit: topK * 2 });
            const profile = resolveAgentProfile(agentId, config);
            const filtered = allNotes.filter((note) =>
              canAgentSeeNote(note, agentId, profile),
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
        },

        // 7. memory_stats — Memory statistics
        {
          label: "Memory Stats",
          name: "memory_stats",
          description: "Get memory statistics for the current user, including total count, backend type, and activation score distribution.",
          parameters: {
            type: "object",
            properties: {},
          },
          execute: async (_toolCallId: string, _params: unknown) => {
            const store = getStore();
            const totalMemories = await store.countByUser(userId);

            // Compute activation distribution
            const notes = await store.listByUser(userId, { limit: 1000 });
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
        },

        // 8. memory_link — Manually link two notes
        {
          label: "Memory Link",
          name: "memory_link",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { noteId: string; targetNoteId: string };
            const store = getStore();
            const noteA = await store.read(p.noteId, userId);
            const noteB = await store.read(p.targetNoteId, userId);

            if (!noteA || !noteB) {
              return {
                success: false,
                noteId: p.noteId,
                targetNoteId: p.targetNoteId,
                error: !noteA ? `Note ${p.noteId} not found` : `Note ${p.targetNoteId} not found`,
              };
            }

            // Add bidirectional links (avoid duplicates)
            const linksA = new Set(noteA.links);
            const linksB = new Set(noteB.links);
            linksA.add(p.targetNoteId);
            linksB.add(p.noteId);

            await store.update(p.noteId, userId, { links: Array.from(linksA) });
            await store.update(p.targetNoteId, userId, { links: Array.from(linksB) });

            return {
              success: true,
              noteId: p.noteId,
              targetNoteId: p.targetNoteId,
            };
          },
        },

        // 9. memory_search_agents — Find agents with expertise in a domain
        {
          label: "Memory Search Agents",
          name: "memory_search_agents",
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
          execute: async (_toolCallId: string, params: unknown) => {
            const p = params as { domain: string; topK?: number };
            const index = getTransactiveIndex();
            if (!index) {
              return { experts: [], message: "Transactive memory index not available." };
            }
            const experts = index.getExpertsForDomain(p.domain, p.topK ?? 5);
            return { experts };
          },
        },

        // 10. memory_consolidate — Trigger on-demand consolidation + MEMORY.md distillation
        {
          label: "Memory Consolidate",
          name: "memory_consolidate",
          description: "Trigger on-demand memory consolidation: clusters related memories, generates summaries, detects conflicts, and distills a MEMORY.md knowledge file.",
          parameters: {
            type: "object",
            properties: {},
          },
          execute: async (_toolCallId: string, _params: unknown) => {
            // Guard: consolidation requires LLM provider
            let llm;
            let embedding;
            try {
              llm = getLLMProvider();
              embedding = getEmbeddingProvider();
            } catch {
              return {
                status: "error",
                message: "Consolidation requires an LLM provider. Configure llm.apiKey and llm.model.",
              };
            }

            const store = getStore();

            // 1. Run consolidation pipeline
            const report = await consolidate(userId, store, embedding, llm);

            // 2. Distill and write MEMORY.md
            const content = await distillMemoryMd(userId, store, llm);
            const memoryMdPath = await writeMemoryMdFile(content, userId);

            return {
              status: "success",
              report,
              memoryMdPath,
            };
          },
        },
      ];
    },
    { names: [...TOOL_NAMES] },
  );
}
