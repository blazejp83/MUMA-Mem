import type { Note } from "../types/note.js";
import { getStore, getEmbeddingProvider, getConfig } from "../plugin.js";
import {
  baseLevelActivation,
  spreadingActivation,
  stochasticNoise,
  totalActivation,
} from "../activation/scoring.js";
import { trackAccess } from "../activation/tracking.js";

export interface SearchOptions {
  query: string;              // Natural language query
  userId: string;
  topK?: number;              // Default 10
  minScore?: number;          // Minimum similarity threshold (raw vector)
  expandLinks?: boolean;      // Default true — include 1-hop linked notes
}

export interface SearchResult {
  note: Note;
  score: number;              // Primary ranking score (ACT-R activation-based)
  similarity: number;         // Raw vector cosine similarity (0-1)
  linkedNotes?: Note[];       // 1-hop linked notes (if expandLinks=true)
}

/**
 * Semantic search over memory notes with ACT-R activation ranking.
 *
 * Flow:
 * 1. Embed query via the configured embedding provider
 * 2. Vector search with 2x overfetch for re-ranking candidate pool
 * 3. Compute ACT-R activation for each candidate:
 *    - base = baseLevelActivation(access_log, now, decayParameter)
 *    - spreading = spreadingActivation(similarity, contextWeight)
 *    - noise = stochasticNoise(noiseStddev)
 *    - total = base + spreading + noise
 * 4. Filter by retrieval threshold
 * 5. Sort by activation descending, take top-K
 * 6. Expand 1-hop linked notes
 * 7. Fire-and-forget access tracking
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const {
    query,
    userId,
    topK = 10,
    minScore,
    expandLinks = true,
  } = options;

  const store = getStore();
  const embeddingProvider = getEmbeddingProvider();
  const config = getConfig();

  // 1. Embed the natural language query
  const queryEmbedding = await embeddingProvider.embed(query);

  // 2. Vector search with 2x overfetch for activation re-ranking
  const overFetchK = topK * 2;
  const vectorResults = await store.search({
    query: queryEmbedding,
    userId,
    topK: overFetchK,
    minScore,
  });

  // 3. Compute ACT-R activation for each candidate
  const now = new Date();
  const { decayParameter, contextWeight, noiseStddev, retrievalThreshold } =
    config.activation;

  const scoredResults: Array<{
    note: Note;
    similarity: number;
    activationScore: number;
  }> = [];

  for (const vr of vectorResults) {
    const base = baseLevelActivation(vr.note.access_log, now, decayParameter);
    const spreading = spreadingActivation(vr.score, contextWeight);
    const noise = stochasticNoise(noiseStddev);
    const total = totalActivation(base, spreading, noise);

    scoredResults.push({
      note: vr.note,
      similarity: vr.score,
      activationScore: total,
    });
  }

  // 4. Filter by retrieval threshold
  const filtered = scoredResults.filter(
    (r) => r.activationScore >= retrievalThreshold,
  );

  // 5. Sort by activation descending and take top-K
  filtered.sort((a, b) => b.activationScore - a.activationScore);
  const topResults = filtered.slice(0, topK);

  // 6. Build SearchResult array
  const results: SearchResult[] = topResults.map((r) => ({
    note: r.note,
    score: r.activationScore,      // Primary ranking score (activation-based)
    similarity: r.similarity,       // Raw vector similarity for transparency
  }));

  // 7. Expand 1-hop linked notes if requested
  if (expandLinks && results.length > 0) {
    const resultIds = new Set(results.map((r) => r.note.id));

    for (const result of results) {
      if (result.note.links.length === 0) continue;

      // Collect linked IDs not already in result set
      const linkedIds = result.note.links.filter((id) => !resultIds.has(id));
      if (linkedIds.length === 0) continue;

      // Batch-fetch linked notes (filter by userId for isolation)
      const linkedNotes: Note[] = [];
      for (const linkedId of linkedIds) {
        const linked = await store.read(linkedId, userId);
        if (linked) {
          linkedNotes.push(linked);
        }
        // Silently skip null results (deleted or wrong user)
      }

      if (linkedNotes.length > 0) {
        result.linkedNotes = linkedNotes;
      }
    }
  }

  // 8. Fire-and-forget access tracking (non-blocking for SEARCH-02: 200ms target)
  for (const result of results) {
    void trackAccess(
      result.note.id,
      userId,
      result.note,
      store,
      config,
    ).catch(() => {
      // Silently swallow — access tracking is best-effort
    });
  }

  return results;
}
