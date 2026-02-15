import type { MemoryConflict, ConflictType } from "../types/note.js";
import type { LLMProvider } from "../llm/provider.js";
import type { NoteCluster } from "./cluster.js";

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const CONFLICT_DETECTION_SYSTEM_PROMPT = `You are a memory conflict detection system. Given pairs of related memories, classify the relationship between each pair.

For each pair, determine the relationship type:

1. "compatible" - Both memories can be true simultaneously. They complement each other.
   Example: "Likes coffee" + "Prefers dark roast" -> compatible

2. "contradictory" - The memories are mutually exclusive. One negates the other.
   Example: "Lives in NYC" + "Lives in SF" -> contradictory

3. "subsumes" - One memory fully contains the information in the other.
   Example: "Has a dog" + "Has a golden retriever named Max" -> subsumes (second subsumes first)

4. "ambiguous" - The relationship is unclear and needs human review.
   Example: "Prefers working alone" + "Enjoys team brainstorming" -> ambiguous

Respond with a JSON object containing:
{
  "pairs": [
    {
      "noteIdA": "id-of-first-note",
      "noteIdB": "id-of-second-note",
      "type": "compatible|contradictory|subsumes|ambiguous",
      "description": "Brief explanation of the relationship"
    }
  ]
}

Respond ONLY with valid JSON. No markdown fences, no explanation.`;

const VALID_CONFLICT_TYPES = new Set<ConflictType>([
  "compatible",
  "contradictory",
  "subsumes",
  "ambiguous",
]);

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/**
 * CONSOL-03: Detect conflicts within a cluster of related notes.
 *
 * For clusters with 2+ notes, sends pairs to LLM for conflict classification.
 * Uses batch LLM calls (all pairs in one prompt) for efficiency.
 * Only checks pairs within the same cluster (already semantically related).
 *
 * @param cluster - The note cluster to analyze for conflicts
 * @param llm - LLM provider for conflict classification
 * @returns Array of MemoryConflict objects
 */
export async function detectConflicts(
  cluster: NoteCluster,
  llm: LLMProvider,
): Promise<MemoryConflict[]> {
  // Singleton or empty clusters have no conflicts
  if (cluster.notes.length < 2) {
    return [];
  }

  // Build pairs for analysis
  const pairs: Array<{ noteIdA: string; noteIdB: string }> = [];
  for (let i = 0; i < cluster.notes.length; i++) {
    for (let j = i + 1; j < cluster.notes.length; j++) {
      pairs.push({
        noteIdA: cluster.notes[i].id,
        noteIdB: cluster.notes[j].id,
      });
    }
  }

  // Build note descriptions for the prompt
  const noteDescriptions = cluster.notes
    .map((note) => {
      return [
        `ID: ${note.id}`,
        `Content: ${note.content}`,
        `Context: ${note.context}`,
        `Keywords: ${note.keywords.join(", ")}`,
      ].join("\n");
    })
    .join("\n\n");

  const pairDescriptions = pairs
    .map((p, i) => {
      const noteA = cluster.notes.find((n) => n.id === p.noteIdA)!;
      const noteB = cluster.notes.find((n) => n.id === p.noteIdB)!;
      return [
        `--- Pair ${i + 1} ---`,
        `Note A (${p.noteIdA}): ${noteA.content}`,
        `Note B (${p.noteIdB}): ${noteB.content}`,
      ].join("\n");
    })
    .join("\n\n");

  const userPrompt = [
    "Analyze the following memory pairs for conflicts:",
    "",
    "=== ALL MEMORIES IN CLUSTER ===",
    noteDescriptions,
    "",
    "=== PAIRS TO CLASSIFY ===",
    pairDescriptions,
    "",
    `Classify all ${pairs.length} pair(s) above.`,
  ].join("\n");

  const raw = await llm.generateJSON<{
    pairs?: Array<{
      noteIdA?: string;
      noteIdB?: string;
      type?: string;
      description?: string;
    }>;
  }>(userPrompt, {
    systemPrompt: CONFLICT_DETECTION_SYSTEM_PROMPT,
    temperature: 0.2,
  });

  const now = new Date().toISOString();
  const validNoteIds = new Set(cluster.notes.map((n) => n.id));
  const conflicts: MemoryConflict[] = [];

  if (Array.isArray(raw.pairs)) {
    for (const pair of raw.pairs) {
      // Validate note IDs
      if (
        typeof pair.noteIdA !== "string" ||
        typeof pair.noteIdB !== "string" ||
        !validNoteIds.has(pair.noteIdA) ||
        !validNoteIds.has(pair.noteIdB)
      ) {
        continue;
      }

      // Validate conflict type
      const conflictType = VALID_CONFLICT_TYPES.has(pair.type as ConflictType)
        ? (pair.type as ConflictType)
        : "ambiguous";

      conflicts.push({
        id: crypto.randomUUID(),
        noteIdA: pair.noteIdA,
        noteIdB: pair.noteIdB,
        type: conflictType,
        description:
          typeof pair.description === "string"
            ? pair.description
            : "No description provided",
        resolved: false,
        detectedAt: now,
      });
    }
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Conflict Resolution
// ---------------------------------------------------------------------------

/**
 * CONSOL-06: Auto-resolve compatible conflicts, flag others for user review.
 *
 * - compatible: auto-resolve (both retained)
 * - subsumes: auto-resolve (subsumed by one note)
 * - contradictory: flag for user resolution (CONSOL-06)
 * - ambiguous: flag for user resolution
 *
 * @param conflicts - Conflicts to resolve
 * @returns Conflicts with resolution status updated
 */
export function resolveConflicts(conflicts: MemoryConflict[]): MemoryConflict[] {
  return conflicts.map((conflict) => {
    switch (conflict.type) {
      case "compatible":
        return {
          ...conflict,
          resolved: true,
          resolution: "compatible - both retained",
        };

      case "subsumes":
        return {
          ...conflict,
          resolved: true,
          resolution: `subsumed - one note fully contains the other`,
        };

      case "contradictory":
        // CONSOL-06: contradictory conflicts require user resolution
        return {
          ...conflict,
          resolved: false,
        };

      case "ambiguous":
        // Ambiguous conflicts require user review
        return {
          ...conflict,
          resolved: false,
        };

      default:
        return conflict;
    }
  });
}
