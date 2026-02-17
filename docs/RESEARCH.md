# Research Foundations

MUMA-Mem's design is grounded in six research sources spanning cognitive science, multi-agent systems, and production memory architectures. This document explains each technique used, why it matters, and what problem it solves.

## The Core Problem

LLM agents face a fundamental memory paradox: perfect recall degrades performance. An agent that remembers everything is an agent drowning in noise. The real challenge isn't storage — it's knowing what to surface, when to forget, and how to consolidate raw experience into durable knowledge.

OpenClaw's filesystem-as-memory approach (`~/clawd/memory/MEMORY.md`) works for a single agent. It breaks down with multiple agents, long-running sessions, and cross-session continuity. As noted in community discussion, the hard problems are routing (which memory to read), salience (reasoning about what the agent can't see), and scoping (not flooding context with irrelevant history).

## Techniques Used

### 1. ACT-R Activation Scoring

**Source:** Honda et al., "Human-Like Remembering and Forgetting in LLM Agents: An ACT-R-Inspired Memory Architecture" (HAI '25, 2025)

**What it is:** ACT-R (Adaptive Control of Thought — Rational) is a cognitive architecture from psychology that models how humans retrieve memories. The activation formula combines three signals:

- **Base-level activation** — frequently and recently accessed memories score higher (power-law decay over access timestamps)
- **Spreading activation** — memories semantically similar to the current query get boosted (cosine similarity weighted by a context factor)
- **Stochastic noise** — Gaussian randomness so the same query doesn't always return identical results

**Why it matters:** Traditional vector search ranks by cosine similarity alone. This misses temporal dynamics — a memory from yesterday about the same topic should usually rank higher than one from six months ago. ACT-R naturally handles this: the base-level component captures recency/frequency, spreading activation captures relevance, and noise models the natural variation in human recall.

**What it solves:** The "stale context" problem. Without activation scoring, an agent retrieves whatever is closest in embedding space, regardless of whether that information is current, frequently used, or contextually appropriate. ACT-R makes retrieval behave more like human memory — recent, relevant, frequently-accessed knowledge surfaces first.

**Key parameter:** The context weight `w = 11.0` was empirically determined by Honda et al. to balance temporal stability (not forgetting useful memories too fast) against context sensitivity (retrieving what's relevant now).

### 2. Ebbinghaus Forgetting Curves

**Source:** Wei et al., "FadeMem: Biologically-Inspired Forgetting for Efficient Agent Memory" (arXiv, 2026), building on Ebbinghaus (1885)

**What it is:** Each memory has an adaptive half-life governing its decay over time. Retention follows an exponential curve: `retention(t) = e^(-ln(2) / half_life * t)`. The half-life adapts based on events — successful retrieval increases it (reinforcement), conflicting information decreases it, and user pinning sets it to infinity.

**Why it matters:** Without forgetting, agent memory grows without bound. This causes three problems: retrieval slows down as the search space grows, accuracy degrades as similar but outdated memories compete, and errors propagate when the agent retrieves incorrect past experiences as guidance. FadeMem demonstrated 45% storage reduction with superior retention quality by implementing biologically-inspired decay.

**What it solves:** Self-degradation. Agents using "add-all" memory strategies show performance decline over time. Old errors and outdated information compete with current knowledge. Forgetting is not data loss — it's optimization. Memories that prove useful get reinforced and persist. Unused or contradicted memories naturally fade.

**How MUMA-Mem uses it:** Hourly decay sweeps recalculate activation scores system-wide. Memories below a soft threshold become consolidation candidates. Memories below a hard threshold (and old enough) are pruned. Pinned memories are exempt. The result is a memory store that improves over time rather than accumulating noise.

### 3. Zettelkasten Note Linking (A-Mem)

**Source:** Xu et al., "A-Mem: Agentic Memory for LLM Agents" (arXiv, 2025), inspired by Luhmann's Zettelkasten method

**What it is:** Each memory is stored as a structured note with content, context (LLM-generated semantic summary), keywords, tags, embedding, and bidirectional links to related notes. When a new memory arrives, the system identifies related existing memories and creates links. Linked notes can evolve — their context and tags update when new related information arrives.

**Why it matters:** Flat vector stores treat each memory as an isolated point in embedding space. Real knowledge is relational — understanding that a customer closed a deal is more useful when linked to the pricing strategy that enabled it and the initial contact that started the relationship. A-Mem demonstrated 85-93% token reduction versus full-context baselines while maintaining superior answer quality, because the link structure surfaces relevant context that pure vector search would miss.

**What it solves:** Two problems. First, "context gaps" — when relevant information exists but isn't close enough in embedding space to surface via similarity search alone. Link expansion (following 1-hop connections from retrieved notes) catches related context. Second, "knowledge fragmentation" — without linking, an agent accumulates many small facts that never connect into coherent understanding.

**How MUMA-Mem uses it:** The write pipeline's LINK step creates connections between new and existing notes based on shared attributes. The EVOLVE step updates linked notes' context when new information arrives. The read pipeline follows 1-hop links from retrieved results, expanding the context window with related knowledge.

### 4. Extract-Then-Update Write Pipeline (Mem0)

**Source:** Chhikara et al., "Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory" (arXiv, 2025)

**What it is:** A six-stage pipeline for processing new memories: Extract (raw input), Construct (LLM generates structured metadata), Retrieve (find similar existing notes), Decide (LLM chooses ADD/UPDATE/DELETE/NOOP), Link (connect to related notes), Evolve (update linked notes' context).

**Why it matters:** Naive memory systems store everything and rely on retrieval to sort it out later. Mem0 showed that processing memories at write time — deduplicating, updating existing entries, and removing superseded information — dramatically reduces storage and improves retrieval quality. Their system achieved 91% lower p95 latency versus full-context approaches and reduced per-query token usage from ~26,000 to ~1,764.

**What it solves:** Memory bloat and contradiction. Without a write pipeline, telling an agent "I moved to Berlin" and later "I moved to London" creates two competing memories. The DECIDE step catches this: the LLM recognizes the new information supersedes the old and issues an UPDATE rather than an ADD. The memory store stays clean and consistent.

**How MUMA-Mem uses it:** Every memory write passes through the full pipeline. The LLM at the DECIDE step has access to the top-10 most similar existing notes, giving it enough context to make intelligent deduplication decisions. The pipeline runs asynchronously — the agent continues while memories are processed in the background.

### 5. Consolidation ("Sleep Cycles")

**Source:** Tao An, "The Agent's Memory Dilemma" (Medium, 2025); Wei et al., "FadeMem" (2026)

**What it is:** A daily background process that transforms episodic memories (raw interaction logs) into semantic knowledge (distilled summaries). Inspired by how human memory consolidation works during sleep — the hippocampus replays experiences and transfers patterns to long-term storage.

The process: cluster related episodic memories by temporal-semantic similarity, generate summary notes from each cluster, prune individual episodes that are fully captured by summaries, detect and resolve memory conflicts (compatible: merge; contradictory: keep higher-confidence; subsumes: absorb; ambiguous: flag for user review), and regenerate the distilled MEMORY.md.

**Why it matters:** Without consolidation, memory accumulates as raw episodes forever. An agent that had 50 conversations about a customer's pricing preferences doesn't need 50 separate memories — it needs one consolidated understanding. FadeMem's temporal-semantic clustering approach showed this compression is not just more efficient but produces better retrieval quality, because consolidated knowledge is more general and less context-dependent than individual episodes.

**What it solves:** The "episodic trap" — agents that remember every interaction verbatim but can't extract the general lesson. Consolidation is the mechanism that turns experience into wisdom. It also addresses memory conflicts by actively detecting when two memories contradict each other and applying resolution strategies rather than letting both persist indefinitely.

### 6. Multi-Agent Memory Topology

**Source:** Wu & Shu, "Memory in LLM-based Multi-agent Systems" (Emory University, preprint)

**What it is:** A taxonomy of how multiple agents should share memory. Key concepts:

- **Transactive memory index** — a meta-memory tracking "who knows what," so agents can route queries to the right expert rather than every agent storing everything
- **Visibility-scoped access** — not every agent should see every memory (a sales agent doesn't need coding memories, and nobody's health data should leak to business agents)
- **Pub/sub synchronization** — when one agent writes a memory, others are notified and can refresh on their next query
- **Coordinated forgetting** — decay sweeps operate across all agents for a user, not per-agent

**Why it matters:** Single-agent memory systems break in multi-agent environments. Without access control, agents flood each other with irrelevant context. Without a transactive index, every agent redundantly stores the same knowledge. Without coordinated sync, agents develop inconsistent views of the world.

**What it solves:** Three problems specific to multi-agent setups. Routing: the transactive index answers "which agent/memory store has information about X?" without searching everything. Context flooding: visibility gates and domain scoping ensure agents only see what's relevant to their role. Consistency: pub/sub notifications and version tracking prevent agents from operating on stale information.

**How MUMA-Mem uses it:** Four visibility levels (open, scoped, private, user-only) gate access before scoring — unauthorized memories never appear in search results. Per-agent memory profiles define which domains each agent can access. The event bus notifies agents of memory changes via Redis pub/sub (or polling for SQLite). The transactive index tracks which agents have expertise on which topics.

## Research Sources

| # | Source | Year | Key Contribution |
|---|--------|------|-----------------|
| 1 | Tao An, "The Agent's Memory Dilemma" | 2025 | Forgetting as optimization; consolidation from episodic to semantic |
| 2 | Wei et al., "FadeMem" (arXiv 2601.18642) | 2026 | Ebbinghaus decay with adaptive half-lives; memory conflict resolution |
| 3 | Honda et al., "ACT-R-Inspired Memory" (HAI '25) | 2025 | Activation function with base-level + spreading + noise; optimal context weight |
| 4 | Xu et al., "A-Mem" (arXiv 2502.12110) | 2025 | Zettelkasten note structure; autonomous linking; memory evolution |
| 5 | Wu & Shu, "Memory in LLM-based MAS" (Emory) | preprint | Multi-agent memory taxonomy; transactive memory; coordinated forgetting |
| 6 | Chhikara et al., "Mem0" (arXiv 2504.19413) | 2025 | Extract-then-update pipeline; production-grade ADD/UPDATE/DELETE/NOOP |

### Foundational References

- Anderson, J. R. et al., "An Integrated Theory of the Mind" (Psychological Review, 2004) — ACT-R cognitive architecture
- Ebbinghaus, H., "Memory: A Contribution to Experimental Psychology" (1885) — Forgetting curves
- Ahrens, S., "How to Take Smart Notes" (2017) — Zettelkasten method
