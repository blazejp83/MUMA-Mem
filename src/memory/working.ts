/**
 * In-process Working Memory (L1) — ephemeral per-session memory store.
 *
 * Uses ACT-R activation scoring for ranking and retrieval.
 * Pure in-process, no external dependencies.
 */

import type { MemorySource } from "../types/note.js";
import {
  baseLevelActivation,
  spreadingActivation,
  stochasticNoise,
  totalActivation,
} from "../activation/index.js";

export interface WorkingMemoryItem {
  id: string;
  content: string;
  embedding: Float32Array;
  activation: number;
  accessLog: string[];
  agentId: string;
  userId: string;
  source: MemorySource;
  createdAt: string;
}

/**
 * Cosine similarity between two Float32Arrays.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

export class WorkingMemory {
  private items: Map<string, WorkingMemoryItem> = new Map();
  private decayParameter: number;
  private contextWeight: number;
  private noiseStddev: number;

  constructor(config: {
    decayParameter: number;
    contextWeight: number;
    noiseStddev: number;
  }) {
    this.decayParameter = config.decayParameter;
    this.contextWeight = config.contextWeight;
    this.noiseStddev = config.noiseStddev;
  }

  /**
   * Add a new item to working memory.
   *
   * @returns The generated item ID.
   */
  add(
    content: string,
    embedding: Float32Array,
    meta: { agentId: string; userId: string; source: MemorySource },
  ): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.items.set(id, {
      id,
      content,
      embedding,
      activation: 0,
      accessLog: [now],
      agentId: meta.agentId,
      userId: meta.userId,
      source: meta.source,
      createdAt: now,
    });

    return id;
  }

  /**
   * Query working memory by embedding similarity with ACT-R activation ranking.
   *
   * For each item: compute cosine similarity, compute total ACT-R activation
   * (base from accessLog + spreading from similarity + noise), record access,
   * sort by activation descending.
   */
  query(queryEmbedding: Float32Array, topK: number = 5): WorkingMemoryItem[] {
    if (this.items.size === 0) return [];

    const now = new Date();
    const nowIso = now.toISOString();

    const scored: { item: WorkingMemoryItem; act: number }[] = [];

    for (const item of this.items.values()) {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);

      const base = baseLevelActivation(item.accessLog, now, this.decayParameter);
      const spreading = spreadingActivation(similarity, this.contextWeight);
      const noise = stochasticNoise(this.noiseStddev);
      const act = totalActivation(base, spreading, noise);

      // Record access
      item.accessLog.push(nowIso);
      item.activation = act;

      scored.push({ item, act });
    }

    scored.sort((a, b) => b.act - a.act);

    return scored.slice(0, topK).map((s) => s.item);
  }

  /**
   * Returns all items with activation >= threshold, sorted by activation descending.
   * Used by session_end to determine which items to promote.
   */
  getTopActivated(threshold: number): WorkingMemoryItem[] {
    if (this.items.size === 0) return [];

    const now = new Date();

    const results: { item: WorkingMemoryItem; act: number }[] = [];

    for (const item of this.items.values()) {
      // Recompute activation using base-level only (no query context for promotion)
      const base = baseLevelActivation(item.accessLog, now, this.decayParameter);
      item.activation = base;

      if (base >= threshold) {
        results.push({ item, act: base });
      }
    }

    results.sort((a, b) => b.act - a.act);

    return results.map((r) => r.item);
  }

  /**
   * Get context items for a specific user/agent combination.
   * Filters by userId and agentId, recomputes activation, returns top-K.
   * Used by before_agent_start for context injection.
   */
  getContextItems(
    userId: string,
    agentId: string,
    topK: number = 10,
  ): WorkingMemoryItem[] {
    if (this.items.size === 0) return [];

    const now = new Date();

    const filtered: { item: WorkingMemoryItem; act: number }[] = [];

    for (const item of this.items.values()) {
      if (item.userId !== userId || item.agentId !== agentId) continue;

      const base = baseLevelActivation(item.accessLog, now, this.decayParameter);
      item.activation = base;

      filtered.push({ item, act: base });
    }

    filtered.sort((a, b) => b.act - a.act);

    return filtered.slice(0, topK).map((f) => f.item);
  }

  /**
   * Clear all items. Called after session_end promotion.
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Number of items in working memory.
   */
  get size(): number {
    return this.items.size;
  }
}
