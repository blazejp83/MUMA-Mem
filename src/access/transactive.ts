/**
 * Transactive Memory Index (AGENT-04)
 *
 * Tracks which agents have expertise in which domains based on write activity.
 * Enables routing queries to the most knowledgeable agent for a given topic.
 */

export class TransactiveMemoryIndex {
  // agentId -> Map<domain, writeCount>
  private index: Map<string, Map<string, number>> = new Map();

  /**
   * Record a write by an agent to a domain.
   * Increments the write count for the agent+domain pair.
   */
  recordWrite(agentId: string, domain: string): void {
    let agentMap = this.index.get(agentId);
    if (!agentMap) {
      agentMap = new Map();
      this.index.set(agentId, agentMap);
    }
    const current = agentMap.get(domain) ?? 0;
    agentMap.set(domain, current + 1);
  }

  /**
   * Find agents with the most writes to a domain (or prefix-matching domains).
   * Sorts by writeCount descending, returns topK (default 5).
   */
  getExpertsForDomain(
    domain: string,
    topK: number = 5,
  ): Array<{ agentId: string; writeCount: number }> {
    const expertCounts: Map<string, number> = new Map();

    for (const [agentId, agentMap] of this.index) {
      let total = 0;
      for (const [d, count] of agentMap) {
        // Exact match or prefix match (domain is prefix of d)
        if (d === domain || d.startsWith(domain + "/") || domain.startsWith(d + "/")) {
          total += count;
        }
      }
      if (total > 0) {
        expertCounts.set(agentId, total);
      }
    }

    return Array.from(expertCounts.entries())
      .map(([agentId, writeCount]) => ({ agentId, writeCount }))
      .sort((a, b) => b.writeCount - a.writeCount)
      .slice(0, topK);
  }

  /**
   * List domains an agent has written to, sorted by writeCount descending.
   */
  getDomainsForAgent(
    agentId: string,
  ): Array<{ domain: string; writeCount: number }> {
    const agentMap = this.index.get(agentId);
    if (!agentMap) return [];

    return Array.from(agentMap.entries())
      .map(([domain, writeCount]) => ({ domain, writeCount }))
      .sort((a, b) => b.writeCount - a.writeCount);
  }

  /**
   * Clear all data from the index.
   */
  clear(): void {
    this.index.clear();
  }
}

/**
 * Factory function to create a new TransactiveMemoryIndex.
 */
export function createTransactiveIndex(): TransactiveMemoryIndex {
  return new TransactiveMemoryIndex();
}
