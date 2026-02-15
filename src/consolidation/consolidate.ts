import type { MemoryStore } from "../types/store.js";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { LLMProvider } from "../llm/provider.js";
import { clusterNotes } from "./cluster.js";
import { summarizeCluster } from "./summarize.js";
import { detectConflicts, resolveConflicts } from "./conflicts.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsolidationReport {
  userId: string;
  clustersFound: number;
  summariesCreated: number;
  conflictsDetected: number;
  conflictsAutoResolved: number;
  conflictsNeedingReview: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Consolidation Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the full consolidation pipeline for a single user:
 *
 * 1. Fetch all notes
 * 2. Cluster by embedding similarity
 * 3. For each multi-note cluster:
 *    a. Summarize: generate consolidated summary
 *    b. Detect conflicts: classify note pair relationships
 *    c. Resolve conflicts: auto-resolve compatible, flag contradictory
 * 4. Store summary notes with "consolidated" tag
 * 5. Save conflicts to store
 * 6. Return report
 *
 * CONSOL-05: Original notes are never deleted.
 * CONSOL-06: Compatible conflicts auto-resolved, contradictory flagged.
 *
 * @param userId - The user whose notes to consolidate
 * @param store - Memory store for reading/writing notes
 * @param embedding - Embedding provider for generating embeddings on summaries
 * @param llm - LLM provider for summarization and conflict detection
 * @returns ConsolidationReport with statistics
 */
export async function consolidate(
  userId: string,
  store: MemoryStore,
  embedding: EmbeddingProvider,
  llm: LLMProvider,
): Promise<ConsolidationReport> {
  const now = new Date().toISOString();

  // 1. Fetch all notes for user
  const notes = await store.listByUser(userId, { limit: 1000 });

  if (notes.length === 0) {
    return {
      userId,
      clustersFound: 0,
      summariesCreated: 0,
      conflictsDetected: 0,
      conflictsAutoResolved: 0,
      conflictsNeedingReview: 0,
      timestamp: now,
    };
  }

  // 2. Cluster notes by embedding similarity
  const clusters = clusterNotes(notes);

  let summariesCreated = 0;
  let totalConflictsDetected = 0;
  let totalAutoResolved = 0;
  let totalNeedingReview = 0;

  // 3. Process each multi-note cluster
  for (const cluster of clusters) {
    if (cluster.notes.length < 2) {
      continue; // Skip singletons
    }

    // 3a. Summarize the cluster
    const result = await summarizeCluster(cluster, llm);

    // 3b. Detect conflicts
    const rawConflicts = await detectConflicts(cluster, llm);

    // 3c. Resolve conflicts
    const resolvedConflicts = resolveConflicts(rawConflicts);

    // 4. Store summary note with "consolidated" tag
    const summaryEmbedding = await embedding.embed(result.summary);
    await store.create({
      content: result.summary,
      context: `Consolidated summary of ${result.sourceNoteIds.length} related memories`,
      keywords: [],
      tags: ["consolidated"],
      embedding: summaryEmbedding,
      links: result.sourceNoteIds, // Link to source notes
      created_by: "system:consolidation",
      user_id: userId,
      importance: 0.7, // Consolidated summaries are generally important
      source: "inferred",
      confidence: result.confidence,
    });

    summariesCreated++;

    // 5. Save conflicts to store
    if (resolvedConflicts.length > 0) {
      await store.saveConflicts(resolvedConflicts);
    }

    totalConflictsDetected += resolvedConflicts.length;
    totalAutoResolved += resolvedConflicts.filter((c) => c.resolved).length;
    totalNeedingReview += resolvedConflicts.filter((c) => !c.resolved).length;
  }

  return {
    userId,
    clustersFound: clusters.length,
    summariesCreated,
    conflictsDetected: totalConflictsDetected,
    conflictsAutoResolved: totalAutoResolved,
    conflictsNeedingReview: totalNeedingReview,
    timestamp: now,
  };
}
