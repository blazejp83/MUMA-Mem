import type { Note } from "../types/note.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteCluster {
  id: string;
  notes: Note[];
  centroid?: Float32Array;
}

// ---------------------------------------------------------------------------
// Cosine Similarity
// ---------------------------------------------------------------------------

/**
 * Compute cosine similarity between two Float32Array vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dot / denominator;
}

// ---------------------------------------------------------------------------
// Union-Find (Disjoint Set) for transitive grouping
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    // Union by rank
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
  }
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * Cluster notes using greedy single-linkage clustering based on cosine
 * similarity of their embeddings.
 *
 * Algorithm:
 * 1. For each pair of notes, compute cosine similarity
 * 2. If similarity >= threshold, union them into the same cluster
 * 3. Use union-find for transitive grouping (A~B, B~C => {A,B,C})
 * 4. Notes with no similar peers become singleton clusters
 *
 * @param notes - Notes to cluster (must have embeddings)
 * @param similarityThreshold - Minimum cosine similarity for grouping (default 0.75)
 * @returns Array of NoteCluster objects with optional centroid embeddings
 */
export function clusterNotes(
  notes: Note[],
  similarityThreshold = 0.75,
): NoteCluster[] {
  if (notes.length === 0) {
    return [];
  }

  // Filter to notes that have embeddings
  const withEmbeddings = notes.filter((n) => n.embedding.length > 0);
  const noEmbeddings = notes.filter((n) => n.embedding.length === 0);

  const uf = new UnionFind(withEmbeddings.length);

  // Compare all pairs and union similar notes
  for (let i = 0; i < withEmbeddings.length; i++) {
    for (let j = i + 1; j < withEmbeddings.length; j++) {
      const sim = cosineSimilarity(
        withEmbeddings[i].embedding,
        withEmbeddings[j].embedding,
      );
      if (sim >= similarityThreshold) {
        uf.union(i, j);
      }
    }
  }

  // Group notes by their root representative
  const groups = new Map<number, Note[]>();
  for (let i = 0; i < withEmbeddings.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(withEmbeddings[i]);
  }

  // Build clusters with centroids
  const clusters: NoteCluster[] = [];

  for (const groupNotes of groups.values()) {
    const centroid = computeCentroid(groupNotes);
    clusters.push({
      id: crypto.randomUUID(),
      notes: groupNotes,
      centroid,
    });
  }

  // Add singleton clusters for notes without embeddings
  for (const note of noEmbeddings) {
    clusters.push({
      id: crypto.randomUUID(),
      notes: [note],
    });
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute centroid as the average of all note embeddings in a cluster.
 */
function computeCentroid(notes: Note[]): Float32Array | undefined {
  const validEmbeddings = notes.filter((n) => n.embedding.length > 0);
  if (validEmbeddings.length === 0) {
    return undefined;
  }

  const dims = validEmbeddings[0].embedding.length;
  const centroid = new Float32Array(dims);

  for (const note of validEmbeddings) {
    for (let d = 0; d < dims; d++) {
      centroid[d] += note.embedding[d];
    }
  }

  // Normalize by count
  const count = validEmbeddings.length;
  for (let d = 0; d < dims; d++) {
    centroid[d] /= count;
  }

  return centroid;
}
