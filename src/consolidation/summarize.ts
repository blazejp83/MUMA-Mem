import type { LLMProvider } from "../llm/provider.js";
import type { NoteCluster } from "./cluster.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationResult {
  clusterId: string;
  summary: string;           // LLM-generated consolidated text
  sourceNoteIds: string[];   // Original note IDs (preserved, not deleted)
  confidence: number;        // LLM confidence in summary quality
  redundantNoteIds: string[]; // Notes fully captured by summary (pruning candidates)
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SUMMARIZE_SYSTEM_PROMPT = `You are a memory consolidation system. Given a cluster of related memories, create a single consolidated summary that preserves all unique information.

Respond with a JSON object containing:

1. "summary" (string): A single consolidated statement that captures ALL unique information from the memories. Be concise but comprehensive. Do not lose any distinct facts.

2. "confidence" (number): Your confidence that the summary fully captures the cluster's information, from 0.0 to 1.0:
   - 0.9-1.0: All information perfectly captured
   - 0.7-0.8: Most information captured, minor nuance may be lost
   - 0.5-0.6: Significant information may be lost in consolidation
   - Below 0.5: Too much information lost, summary inadequate

3. "redundantNoteIds" (string[]): IDs of notes whose information is FULLY captured by the summary. Only mark a note as redundant if the summary completely subsumes it. If a note contains any unique information not in the summary, do NOT include its ID here.

Respond ONLY with valid JSON. No markdown fences, no explanation.`;

// ---------------------------------------------------------------------------
// Summarize Cluster
// ---------------------------------------------------------------------------

/**
 * CONSOL-01: Generate a consolidated summary for a cluster of related notes.
 *
 * - Singleton clusters (1 note): returned as-is without LLM call
 * - Multi-note clusters: LLM generates a summary preserving all unique info
 * - CONSOL-05: Original notes are NEVER deleted, only flagged as redundant
 *
 * @param cluster - The note cluster to summarize
 * @param llm - LLM provider for generating summaries
 * @returns Consolidation result with summary and redundancy info
 */
export async function summarizeCluster(
  cluster: NoteCluster,
  llm: LLMProvider,
): Promise<ConsolidationResult> {
  const sourceNoteIds = cluster.notes.map((n) => n.id);

  // Singleton clusters: no summarization needed
  if (cluster.notes.length <= 1) {
    return {
      clusterId: cluster.id,
      summary: cluster.notes[0]?.content ?? "",
      sourceNoteIds,
      confidence: 1.0,
      redundantNoteIds: [],
    };
  }

  // Build user prompt listing all note contents
  const noteDescriptions = cluster.notes
    .map((note, i) => {
      return [
        `--- Memory ${i + 1} ---`,
        `ID: ${note.id}`,
        `Content: ${note.content}`,
        `Context: ${note.context}`,
        `Keywords: ${note.keywords.join(", ")}`,
        `Tags: ${note.tags.join(", ")}`,
        `Created: ${note.created_at}`,
      ].join("\n");
    })
    .join("\n\n");

  const userPrompt = [
    `You have ${cluster.notes.length} related memories to consolidate:`,
    "",
    noteDescriptions,
    "",
    "Create a consolidated summary that preserves all unique information.",
    `The note IDs are: ${sourceNoteIds.join(", ")}`,
  ].join("\n");

  const raw = await llm.generateJSON<{
    summary?: string;
    confidence?: number;
    redundantNoteIds?: string[];
  }>(userPrompt, {
    systemPrompt: SUMMARIZE_SYSTEM_PROMPT,
    temperature: 0.3,
  });

  // Validate and sanitize response
  const summary =
    typeof raw.summary === "string" && raw.summary.length > 0
      ? raw.summary
      : cluster.notes.map((n) => n.content).join("; ");

  const confidence =
    typeof raw.confidence === "number" &&
    raw.confidence >= 0 &&
    raw.confidence <= 1
      ? raw.confidence
      : 0.5;

  // Only accept redundant IDs that are actually in this cluster
  const validIds = new Set(sourceNoteIds);
  const redundantNoteIds = Array.isArray(raw.redundantNoteIds)
    ? raw.redundantNoteIds.filter(
        (id) => typeof id === "string" && validIds.has(id),
      )
    : [];

  return {
    clusterId: cluster.id,
    summary,
    sourceNoteIds,
    confidence,
    redundantNoteIds,
  };
}
