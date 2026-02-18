# Training-Free GRPO Integration Research

> Active learning through structured practice for MUMA-Mem agents

**Paper:** Youtu-Agent Team, "Training-Free Group Relative Policy Optimization" (arXiv:2510.08191, Oct 2025)
**Reference implementations:**
- Batch pipeline (original): `~/repos/.obsolete/youtu-agent/utu/practice/`
- Live MCP server (alternative): `~/repos/.obsolete/tfgrpoMCP/`
**Target system:** MUMA-Mem v2.0

---

## Table of Contents

1. [Technique Summary](#1-technique-summary)
2. [Structural Mapping to MUMA-Mem](#2-structural-mapping-to-muma-mem)
3. [Integration Architecture](#3-integration-architecture)
4. [Open Questions & Hypotheses](#4-open-questions--hypotheses)
5. [Verification Function Design](#5-verification-function-design)
6. [Representative Task Selection](#6-representative-task-selection)
7. [Rollout Environment](#7-rollout-environment)
8. [Experience-to-Note Mapping](#8-experience-to-note-mapping)
9. [Continuous vs One-Shot Practice](#9-continuous-vs-one-shot-practice)
10. [Cost Modeling](#10-cost-modeling)
11. [Interaction with Identity Evolution](#11-interaction-with-identity-evolution)
12. [Research Directions](#12-research-directions)
13. [Reference Implementation Details](#13-reference-implementation-details)
14. [Alternative Implementation: tfgrpoMCP](#14-alternative-implementation-tfgrpomcp)

---

## 1. Technique Summary

Training-Free GRPO (TF-GRPO) shifts RL policy optimization from parameter space to context space. Instead of fine-tuning LLM weights, it maintains an **experience library** — a set of natural language guidelines — that is injected into the prompt as a "token prior" to steer agent behavior.

### Core Algorithm

```
Initialize experience library E = {}

FOR each epoch (default 3):
  FOR each batch of problems:
    1. ROLLOUT: Generate G outputs per problem using policy π(o|q, E)
       (G=3-5, temperature=0.7 for diversity)
    2. REWARD: Score each output with verification function R(q, o) → r ∈ [0,1]
    3. FILTER: Keep only groups with 0 < mean(r) < 1
       (need both winners and losers for contrast)
    4. SUMMARIZE: LLM summarizes each trajectory step-by-step
    5. SEMANTIC ADVANTAGE: LLM compares good vs bad summaries within group,
       extracts generalized experiences as natural language
    6. GROUP UPDATE: For each group's new experiences, LLM proposes
       ADD/UPDATE/DELETE/NONE operations against current E
    7. BATCH UPDATE: LLM reconciles all group operations into a
       consolidated revision plan, resolving conflicts
    8. APPLY: Execute operations on E
    9. REASSIGN: Re-index experiences as G0, G1, G2, ...

Output: Enhanced agent with E injected into system prompt
```

### Key Properties

- **No parameter updates** — works with any frozen LLM via API
- **Data-efficient** — 100 training samples, ~$18 total cost, ~3 steps
- **Cross-domain transfer** — swapping experience libraries preserves base model generality
- **Iterative refinement** — multi-epoch learning progressively improves experience quality
- **Semantic advantage** — replaces numerical RL advantage with natural language comparative insights
- **Self-filtering** — only groups with mixed success/failure produce learning signal (equivalent to GRPO's std(r)=0 skip)

### Measured Results (from paper)

| Setting | Baseline | + TF-GRPO | Cost |
|---|---|---|---|
| DeepSeek-V3.1 + ReAct on AIME24 | 80.0% | 82.7% (+2.7) | ~$18 |
| DeepSeek-V3.1 + ReAct on AIME25 | 67.9% | 73.3% (+5.4) | ~$18 |
| DeepSeek-V3.1 on WebWalkerQA | 63.2% | 67.8% (+4.6) | ~$8 |

For comparison, fine-tuning Qwen2.5-32B via traditional RL (ReTool) costs ~$10,000 and achieves lower scores.

---

## 2. Structural Mapping to MUMA-Mem

The parallel between TF-GRPO and MUMA-Mem is structural, not superficial. Both systems maintain evolving knowledge that is injected into agent prompts.

### Operation-Level Correspondence

| TF-GRPO | MUMA-Mem Write Pipeline | Notes |
|---|---|---|
| Experience library `E` (dict) | L2 persistent notes (store) | Both are the "learned knowledge" |
| Inject `E` into prompt | `before_agent_start` hook | Both prepend to agent context |
| Rollout summary (step 4) | `extract.ts` — LLM fact extraction | Both use LLM to structure raw input |
| Semantic advantage (step 5) | No equivalent | **The core gap** — MUMA-Mem has no comparative evaluation |
| Group update ADD/UPDATE/DELETE/NONE (step 6) | `decide.ts` — ADD/UPDATE/DELETE/NOOP | Near-identical operation set |
| Batch update reconciliation (step 7) | `consolidation/conflicts.ts` — conflict detection | Similar intent, different trigger |
| Experience format: "Name: Description." | Note format: content + context + keywords | TF-GRPO is flat text; MUMA-Mem is structured |

### What MUMA-Mem Has That TF-GRPO Lacks

- **Vector embeddings and semantic search** — TF-GRPO injects ALL experiences into every prompt; MUMA-Mem retrieves only relevant ones via activation scoring
- **Forgetting and decay** — TF-GRPO experiences persist forever; MUMA-Mem has Ebbinghaus curves
- **Multi-agent scoping** — TF-GRPO is single-agent; MUMA-Mem has visibility levels and domain routing
- **Structured metadata** — timestamps, access logs, confidence scores, provenance chains
- **Link topology** — Zettelkasten bidirectional links between related notes
- **Working memory (L1)** — session-scoped ephemeral buffer with promotion

### What TF-GRPO Has That MUMA-Mem Lacks

- **Active learning loop** — structured practice with rollouts and reward scoring
- **Comparative evaluation** — group rollouts expose what works vs what fails
- **Semantic advantage extraction** — LLM-distilled insights from success/failure contrast
- **Iterative refinement** — multi-epoch progressive improvement of knowledge quality
- **Verification functions** — pluggable reward scoring per domain
- **Controlled diversity** — high-temperature rollouts deliberately explore the policy space

### The Core Insight

MUMA-Mem is a **passive** memory system — it captures what happens and makes it retrievable. TF-GRPO adds **active** learning — it deliberately practices, evaluates outcomes, and distills what works. The combination would give agents memory that is not just stored but empirically validated.

---

## 3. Integration Architecture

### Proposed Position in MUMA-Mem's Layer Model

```
L4 Background Daemon (extended)
├── Decay sweeps (hourly)              — existing
├── Consolidation (daily)              — existing
├── Identity Reflection (daily)        — from EvoClaw integration
└── Practice Sessions (on-demand)      — from TF-GRPO
    ├── Task selection
    ├── Group rollout generation
    ├── Outcome verification
    ├── Semantic advantage extraction
    └── Experience note refinement
```

Practice sessions would be a new daemon job type. Unlike consolidation (which processes existing notes) or reflection (which evaluates experiences against identity), practice sessions generate new interactions to empirically test and refine knowledge.

### Data Flow

```
Practice trigger (manual, scheduled, or threshold-based)
  │
  ▼
Task Selection
  │ Select representative problems for target domain
  │ Source: curated dataset, past interactions, or generated
  │
  ▼
Group Rollout (G rollouts per task)
  │ For each task, run agent G times with current memory injected
  │ Temperature=0.7 for diversity
  │ Full ReAct-style execution with tool access
  │
  ▼
Verification
  │ Score each rollout with domain-specific verify function
  │ Filter to groups with mixed results (0 < mean(r) < 1)
  │
  ▼
Semantic Advantage Extraction
  │ LLM compares successful vs failed rollouts
  │ Produces natural language experiential insights
  │
  ▼
Experience Integration
  │ Map TF-GRPO operations to MUMA-Mem write pipeline:
  │   ADD    → pipeline.write() with source:"practice"
  │   UPDATE → pipeline.write() (dedup decides UPDATE)
  │   DELETE → store.delete() or reduce confidence
  │   NONE   → no-op
  │
  ▼
Store (L2 persistent notes)
  │ Practice-derived notes tagged with source:"practice"
  │ High initial activation (empirically validated knowledge)
  │
  ▼
Available for injection via before_agent_start
```

---

## 4. Open Questions & Hypotheses

### OQ-1: Where Do Practice Tasks Come From?

**The problem:** TF-GRPO's reference implementation uses curated datasets (DAPO-100, AFM-100). In MUMA-Mem's context, there is no pre-existing labeled dataset. The agent operates in open-ended domains where "representative tasks" are not predefined.

**Hypothesis A — Mine from interaction history:**
Past user queries stored as notes could serve as practice tasks. High-activation notes represent frequently encountered problems. The agent practices on the kinds of tasks it actually faces.

- **Ground truth problem:** Past interactions may not have verifiable answers. The user's satisfaction is the implicit reward, but it's not recorded as a scalar signal.
- **Mitigation:** Use the LLM-judge approach (like `webwalker.py`) where a separate LLM evaluates response quality against the original context. This is the "without ground truths" variant from the paper (Table 2), which still shows improvement (80.7% on AIME24 vs 80.0% baseline).

**Hypothesis B — Generate synthetic tasks:**
Use LLM to generate representative problems for a domain, drawing on the agent's current knowledge base. This is "self-play" — the agent creates its own curriculum.

- **Risk:** Generated tasks may not reflect real-world distribution, leading to experiences that don't transfer.
- **Mitigation:** Constrain generation to topics where the agent has existing notes, ensuring domain relevance.

**Hypothesis C — User-curated task sets:**
Allow users to provide a small evaluation set (10-100 examples) per domain. This mirrors the reference implementation most closely.

- **Tradeoff:** Highest quality but requires user effort. Realistic only for high-value domains.

**Hypothesis D — Hybrid:**
Combine all three. User-provided tasks when available, mined from history otherwise, synthetic as fallback. Priority: curated > mined > synthetic.

**Research directions:**
- **Curriculum learning in RL** — how to select training tasks that maximize transfer. Key papers: Bengio et al. "Curriculum Learning" (ICML 2009), Graves et al. "Automated Curriculum Learning" (2017).
- **Self-play in LLM agents** — agents generating their own training data. Key work: "Self-Play Fine-Tuning" (SPIN, Chen et al. 2024), "Self-Instruct" (Wang et al. 2023).
- **Active learning** — selecting the most informative samples to label/practice on. Key work: Settles "Active Learning" (2009 survey), "Learning How to Actively Learn" (Fang et al. 2017).
- **Test-time compute scaling** — OpenAI's work on using more inference compute to improve outputs, which relates to how much rollout budget to allocate.

---

### OQ-2: How to Define Verification Functions for Open-Domain Agents?

**The problem:** TF-GRPO requires a reward function `R(q, o) → r ∈ [0,1]` for every rollout. The reference implementation provides two: symbolic math verification (exact match) and LLM-based web search judging (CORRECT/INCORRECT). General-purpose agents operate across unbounded domains where no single verification function applies.

**Hypothesis A — Universal LLM judge:**
Use a single LLM-judge verification function for all domains. The judge receives the task, the agent's output, and any available reference (ground truth, prior successful completions, domain knowledge from memory), then scores quality on [0,1].

- **Advantage:** Works for any domain without custom code.
- **Risk:** LLM judges are noisy and biased. The paper's ablation (Table 2) shows that removing ground truths reduces but doesn't eliminate gains, suggesting LLM-only judging is viable but weaker.
- **Calibration concern:** LLM judges may rate everything high (reward collapse), eliminating the mixed-group signal that TF-GRPO depends on.

**Hypothesis B — Domain-specific verification registry:**
Maintain a registry of verification functions per domain (like TF-GRPO's `verify/` directory). Users can contribute verifiers for their high-value domains; the system provides a general-purpose LLM judge as fallback.

- **Advantage:** Highest quality where verifiers exist; graceful degradation elsewhere.
- **Implementation:** Config section mapping domain patterns to verify functions. Matches MUMA-Mem's existing domain-based routing.

**Hypothesis C — Comparative self-evaluation (no ground truth):**
Skip absolute verification entirely. Instead, use the LLM to compare rollouts within each group and determine relative quality through majority voting and self-discrimination. This is the paper's "w/o ground truths" variant.

- **Advantage:** Zero setup cost. Works in any domain.
- **Evidence:** Paper shows AIME24: 80.7% (vs 82.7% with ground truth, vs 80.0% baseline). Still meaningful improvement.
- **Risk:** Slower convergence, weaker signal. May not work for domains where the LLM can't distinguish quality.

**Hypothesis D — User feedback as delayed reward:**
If the user corrects the agent, rates a response, or provides follow-up that implies satisfaction/dissatisfaction, use this as a reward signal for practice on similar future tasks.

- **Advantage:** Real-world signal, no synthetic judgment needed.
- **Challenge:** Feedback is sparse, delayed, and noisy. Requires aggregation across many interactions.

**Research directions:**
- **LLM-as-judge reliability** — Zheng et al. "Judging LLM-as-a-Judge" (NeurIPS 2023). Position bias, length bias, self-enhancement bias documented. Mitigation: multi-judge panels, swapped position evaluation.
- **Reward modeling without human labels** — Constitutional AI (Bai et al. 2022), RLAIF (Lee et al. 2023). Methods for deriving reward signals from principles rather than labeled data.
- **Self-evaluation calibration** — Kadavath et al. "Language Models (Mostly) Know What They Know" (2022). When can LLMs reliably assess their own outputs?
- **Process reward models** — Lightman et al. "Let's Verify Step by Step" (2023). Step-level verification may be more reliable than outcome-level for complex tasks.

---

### OQ-3: How to Execute Rollouts Without an Agent Runtime?

**The problem:** TF-GRPO generates rollouts by running the actual agent on tasks with tool access. MUMA-Mem is a memory plugin, not an agent runtime. It hooks into OpenClaw's lifecycle but doesn't control agent execution.

**Hypothesis A — Use OpenClaw's agent execution API:**
If OpenClaw exposes a programmatic way to run agent sessions (not just through the gateway), MUMA-Mem could invoke it to generate practice rollouts. This would give full tool access and realistic execution.

- **Dependency:** Requires OpenClaw to support headless/programmatic agent runs. Need to verify this capability exists.
- **Advantage:** Rollouts are maximally realistic — same tools, same context, same execution environment.

**Hypothesis B — Simulated rollouts (LLM-only):**
Instead of running the full agent, simulate rollouts by having the LLM generate hypothetical trajectories given a task and the current memory context. No actual tool execution.

- **Advantage:** Zero dependency on agent runtime. Can run entirely within MUMA-Mem's daemon.
- **Risk:** Simulated trajectories may not reflect real execution. Tool call results are hallucinated rather than observed. The paper explicitly uses real rollouts with actual tool execution.
- **Partial mitigation:** For domains where the primary challenge is reasoning (not tool use), simulation may be sufficient.

**Hypothesis C — Deferred practice (batch mode):**
Don't run practice in real-time. Instead, accumulate tasks and verification data, then run practice as a batch job when the OpenClaw gateway is available. Practice sessions could be scheduled during low-activity periods.

- **Advantage:** No runtime dependency changes. Uses existing infrastructure.
- **Challenge:** Requires coordination with OpenClaw's session lifecycle.

**Hypothesis D — Lightweight agent stub:**
Implement a minimal agent runner within MUMA-Mem that can execute simple ReAct loops. It would have access to the same LLM provider already configured for consolidation/extraction, but with limited or no tool access.

- **Advantage:** Self-contained, no external dependencies.
- **Risk:** Limited to reasoning-only tasks. Cannot practice tool-using behaviors.

**Research directions:**
- **OpenClaw Plugin SDK** — investigate whether `api.runAgent()` or similar exists for programmatic agent execution. Check the OpenClaw docs and sandbox tools specification.
- **Synthetic trajectory generation** — can LLMs generate realistic tool-use trajectories? Key work: "ToolBench" (Qin et al. 2023), "API-Bank" (Li et al. 2023).
- **Offline RL for language agents** — learning from logged interactions without new rollouts. Key work: "Offline RL for Natural Language Generation" (Snell et al. 2023). This could let MUMA-Mem practice on historical trajectories rather than generating new ones.

---

### OQ-4: How Many Experiences Should Be Injected?

**The problem:** TF-GRPO injects ALL experiences into every prompt. The reference math agent accumulates ~27 experiences (G0-G26). This flat injection doesn't scale — with thousands of notes across domains, injecting everything would flood the context.

**Hypothesis A — Use MUMA-Mem's existing retrieval (status quo):**
Don't change the injection mechanism. Practice-derived notes are stored like any other note. The `before_agent_start` hook retrieves top-K by activation scoring, which automatically surfaces the most relevant practice-derived knowledge.

- **Advantage:** Zero changes to injection. Leverages ACT-R scoring naturally.
- **Concern:** Practice-derived experiential guidelines may need different retrieval semantics than factual memories. A guideline like "When comparing products, search for top models first" is relevant to a broad class of tasks, not just tasks semantically similar to the one where it was learned.

**Hypothesis B — Dual injection: guidelines + memories:**
Separate practice-derived experiences (domain-level guidelines) from episodic memories (specific facts). Inject guidelines for the active domain as a block, then inject episodic memories via activation scoring.

- **Advantage:** Guidelines are always present for their domain; memories are query-specific.
- **Implementation:** Filter by `source: "practice"` + domain match for guidelines. Use existing retrieval for episodic notes.

**Hypothesis C — Tiered injection budget:**
Allocate a token budget split between guideline notes (high-level, domain-wide) and episodic notes (specific, query-relevant). Guidelines get a fixed budget; episodic notes get the remainder.

- **Advantage:** Predictable context usage. Prevents guideline bloat.
- **Research needed:** What's the optimal ratio? The paper uses ~27 experiences consuming ~2K tokens. MUMA-Mem's `before_agent_start` must complete in ~200ms.

**Research directions:**
- **Prompt engineering for experience injection** — does position matter? Should experiences come before or after the task? Key work: "Lost in the Middle" (Liu et al. 2023) — information in the middle of long contexts is used less effectively.
- **Selective experience injection** — Agent KB (referenced in TF-GRPO paper, ref [36]) uses hierarchical retrieval to select relevant experiences. Their "reason-retrieve-refine" process is more targeted but more complex.
- **Context window management** — how to budget tokens across system prompt, memories, tools, and conversation history. No single canonical approach exists.

---

### OQ-5: When Should Practice Sessions Run?

**The problem:** TF-GRPO is designed as a one-shot batch process (3 epochs over 100 samples). In MUMA-Mem, the agent operates continuously. When and how often should practice occur?

**Hypothesis A — Scheduled practice (cron-style):**
Run practice sessions on a fixed schedule (weekly, after N interactions, etc.). Similar to how consolidation runs daily.

- **Advantage:** Predictable cost and timing.
- **Risk:** May practice on stale domains while ignoring active ones.

**Hypothesis B — Triggered practice (event-driven):**
Trigger practice when specific conditions are met:
- New domain encountered (no practice-derived notes exist)
- Failure rate exceeds threshold in a domain (agent performing poorly)
- Consolidation reveals contradictions (conflicting knowledge needs resolution)
- User explicitly requests practice on a topic
- Sufficient new uncategorized experiences accumulated

- **Advantage:** Practices where it matters most. Resource-efficient.
- **Challenge:** Detecting "failure" requires implicit or explicit reward signals from ongoing interactions.

**Hypothesis C — Continuous micro-practice:**
After every N interactions (e.g., every 10), run a single lightweight practice step (1 batch, 1 epoch) on recent tasks. Ongoing incremental improvement rather than periodic batch sessions.

- **Advantage:** Continuous improvement, lower per-session cost.
- **Risk:** Each step has minimal learning signal. The paper shows 3 steps is enough for meaningful improvement, but each step processes a full batch.

**Hypothesis D — Live learning from real sessions (from tfgrpoMCP, see Section 14):**
At the end of each agent session that contains both failures and successes, run a lightweight LLM extraction to distill what worked vs what didn't. This is always-on, zero-infrastructure learning from the agent's real work.

- **Advantage:** Zero rollout cost, learns from real interactions, produces immediate value.
- **Cost:** ~$0.002 per qualifying session (single LLM call).
- **Limitation:** Lower quality than batch practice — no controlled rollouts, no verification functions, no group comparison. Produces breadth, not depth.
- **Best combined with:** Periodic batch practice for depth (Hypothesis A or B).

**Research directions:**
- **Continual learning** — how to incrementally update knowledge without catastrophic forgetting. Key work: "Continual Learning for NLP" (Biesialska et al. 2020). In TF-GRPO's context, the experience library could drift or lose previously learned guidelines.
- **Meta-learning and learning-to-learn** — can the system learn when practice is beneficial? Key work: MAML (Finn et al. 2017), "Learning to Learn" (Andrychowicz et al. 2016).
- **Spaced repetition** — Ebbinghaus-inspired scheduling for review. MUMA-Mem already uses Ebbinghaus for decay; the same principle could schedule practice on domains with decaying expertise.

---

### OQ-6: How Does Practice Interact with Consolidation?

**The problem:** MUMA-Mem already has daily consolidation (cluster, summarize, prune, conflict detect). Practice sessions also refine and consolidate knowledge. Running both independently could create conflicts or redundant processing.

**Hypothesis A — Practice replaces consolidation for practiced domains:**
For domains where practice has been run, skip cluster-summarize consolidation. Practice produces empirically validated knowledge; consolidation produces statistically grouped summaries. Practice output is higher quality.

**Hypothesis B — Consolidation feeds practice:**
Consolidation identifies knowledge gaps and contradictions. These become inputs for practice task generation — the system practices on exactly the areas where its knowledge is weakest or most conflicted.

**Hypothesis C — Sequential pipeline:**
Run consolidation first (cluster, summarize, detect conflicts), then practice on unresolved conflicts. This combines passive organization with active resolution.

**Research directions:**
- **Knowledge distillation** — how to compress large knowledge bases into smaller, more effective representations. Key work: Hinton et al. "Distilling the Knowledge" (2015). The parallel: consolidation distills; practice validates the distillation.
- **Experience replay** — Prioritized Experience Replay (Schaul et al. 2016). Practice could prioritize tasks based on how much learning signal they're expected to provide.

---

## 5. Verification Function Design

### Reference Implementation Analysis

The two verification functions from `~/repos/.obsolete/youtu-agent/utu/practice/verify/` illustrate the two fundamental reward paradigms:

**Deterministic verification (`math.py`):**
```python
def verify_func(sample, timeout_score=0, **kwargs):
    # Uses math_verify library for symbolic comparison
    # Wraps ground truth in \boxed{} format
    # Returns {"reward": 0.0 or 1.0, "reasoning": None}
```
- Binary (correct/incorrect), no intermediate scores
- Requires ground truth
- Fully deterministic — same inputs always produce same reward
- Domain-specific dependency (`math_verify`)

**LLM-judge verification (`webwalker.py`):**
```python
async def verify_func(sample, timeout_score=0, **kwargs):
    # Loads WEBWALKER_JUDGE_TEMPLATE prompt
    # Sends to LLM: question + correct_answer + response
    # Parses GRADE: CORRECT/INCORRECT from response
    # Returns {"reward": 0.0 or 1.0, "reasoning": None}
```
- Binary via LLM classification
- Uses ground truth for comparison
- Non-deterministic — different runs may produce different grades
- General-purpose pattern (only the prompt template is domain-specific)

### Proposed Verification Architecture for MUMA-Mem

```typescript
interface VerifyFunction {
  domain: string;              // Domain pattern (e.g., "math.*", "web.*", "*")
  verify(input: VerifyInput): Promise<VerifyResult>;
}

interface VerifyInput {
  task: string;                // The original task/question
  response: string;            // Agent's response
  trajectory?: TrajectoryStep[]; // Full execution trajectory (if available)
  groundTruth?: string;        // Ground truth answer (if available)
  context?: Note[];            // Relevant memory notes
}

interface VerifyResult {
  reward: number;              // 0.0 to 1.0
  reasoning?: string;          // Explanation of scoring
  stepScores?: number[];       // Per-step scores (for process reward)
}
```

### Verification Tiers (from most to least reliable)

1. **Deterministic verifiers** — exact match, code execution, test suites. Highest signal, narrow domains.
2. **Structured LLM judges** — LLM with rubric, reference answer, and structured output format. Good signal, broad applicability.
3. **Comparative self-evaluation** — LLM compares rollouts within group, no ground truth. Weakest signal but zero setup.

### Default Fallback: Comparative Self-Evaluation

For domains without a custom verifier or ground truth, implement the paper's "w/o ground truths" variant:
- Group rollouts are compared against each other
- LLM determines relative quality through majority voting and self-discrimination
- Filter threshold relaxed (any group with variance in LLM quality judgments)

This is the zero-configuration baseline. The paper demonstrates it still produces meaningful improvement (80.7% vs 80.0% on AIME24 without ground truth).

---

## 6. Representative Task Selection

### Task Source Strategies

**A. Interaction Mining**

Mine tasks from the agent's interaction history. Each user message that triggered a substantive response is a potential practice task.

Selection criteria:
- **Recency** — recent interactions reflect current usage patterns
- **Diversity** — sample across different topics/domains, not just the most frequent
- **Difficulty signal** — interactions where the agent used many tool calls, produced long responses, or received follow-up corrections indicate challenging tasks
- **Activation-based** — high-activation notes correspond to frequently revisited topics; tasks in these areas have the highest practice value

Ground truth approximation:
- Use the agent's own final response as a reference (self-consistency baseline)
- Use user corrections/follow-ups as implicit negative signal
- Use multi-turn resolution as evidence of initial failure

**B. Synthetic Task Generation**

Prompt an LLM to generate representative tasks for a domain:

```
Given these domain keywords: {domain_keywords}
And these example interactions: {sampled_notes}
Generate {N} diverse practice tasks that an agent in this domain should handle well.
Each task should be self-contained and have a verifiable outcome.
```

Quality controls:
- Generated tasks should be answerable (not open-ended philosophy)
- Diversity constraint: no two tasks should be semantically similar (cosine > 0.8)
- Difficulty gradient: mix easy, medium, and hard tasks

**C. Knowledge Gap Detection**

Use consolidation's conflict detection output to generate targeted practice tasks:
- Contradictory notes → generate tasks that require resolving the contradiction
- Low-confidence notes → generate tasks that test those specific claims
- Isolated notes (no links) → generate tasks that might connect them to the broader knowledge graph

### Recommended Approach

Hybrid with priority ordering:
1. User-provided task sets (if available) — highest quality
2. Interaction-mined tasks with difficulty signal — real-world distribution
3. Knowledge-gap-targeted tasks — addresses specific weaknesses
4. Synthetic generation — fills coverage gaps

Start small: 10-50 tasks per practice session (paper shows 100 is sufficient for significant improvement).

---

## 7. Rollout Environment

### Options Analysis

| Option | Realism | Complexity | Tool Access | MUMA-Mem Dependency |
|---|---|---|---|---|
| OpenClaw programmatic agent runs | Full | High | Full | Requires OpenClaw API |
| Lightweight internal agent | Medium | Medium | Limited | Self-contained |
| Simulated trajectories (LLM-only) | Low | Low | None | Self-contained |
| Deferred batch via gateway | Full | Medium | Full | Requires scheduling |

### Recommended: Phased Approach

**Phase 1 — LLM-only simulation (MVP):**
Use MUMA-Mem's existing LLM provider to generate hypothetical trajectories. No actual tool execution. The LLM receives the task + current memory context and produces a ReAct-style trajectory. This is sufficient for testing the experience extraction pipeline and validating the integration architecture.

Limitations: Cannot practice tool-use behaviors. Trajectories may be unrealistic for tool-heavy domains.

**Phase 2 — OpenClaw agent execution (full):**
Once the pipeline is validated, integrate with OpenClaw's agent execution to run real rollouts. This requires:
- Programmatic session creation API
- Ability to inject specific memory context
- Ability to capture full trajectory
- Isolation from user-facing sessions (practice runs should not appear in user history)

**Phase 3 — Hybrid (optimal):**
Route tasks to the appropriate rollout method:
- Reasoning-only tasks → LLM simulation (cheaper, faster)
- Tool-using tasks → full agent execution (realistic)
- Verification determines which is appropriate based on domain

### Rollout Configuration

Drawing from reference implementation defaults and paper results:

| Parameter | Reference Value | Proposed Default | Rationale |
|---|---|---|---|
| `group_size` (G) | 3-5 | 3 | Minimum viable contrast; lower cost |
| `rollout_temperature` | 0.7 | 0.7 | Match reference; sufficient diversity |
| `batch_size` | 50 | 20 | Smaller batches for continuous learning |
| `epochs` | 1-3 | 1 | Continuous practice replaces multi-epoch |
| `task_timeout` | 3600s | 300s | Shorter for practice tasks |
| `num_experiences_per_query` | 1-2 | 1 | Prevents experience library bloat |

---

## 8. Experience-to-Note Mapping

### TF-GRPO Experience Format

In the reference implementation, an experience is a flat string:

```
"G0": "Combinatorial enumeration: Systematically enumerate small cases using
computational methods before attempting generalization..."
```

Format: `"Experience name: Brief description."` — concise, actionable, domain-specific.

### MUMA-Mem Note Format

Notes are rich structured objects with 20+ fields including content, context, keywords, tags, embedding, links, activation, half_life, visibility, etc.

### Proposed Mapping

When a practice session produces experiences, they enter MUMA-Mem's write pipeline:

```typescript
// Practice experience → NoteCreate
{
  content: experience.content,        // "Combinatorial enumeration: Systematically..."
  context: experience.reasoning,      // LLM's comparative analysis that produced this
  keywords: extractKeywords(content), // LLM-extracted from content
  tags: ["practice", domain],         // Always tagged with "practice"
  source: "practice",                 // New MemorySource value (add to "experience"|"told"|"inferred")
  visibility: "scoped",              // Scoped to the domain where it was learned
  domain: practiceDomain,            // Domain from the practice session
  importance: 0.8,                   // High default — empirically validated knowledge
  confidence: rewardScore,           // Average reward score of the group that produced it
  pinned: false,                     // Not pinned — subject to decay like other notes
  // embedding, links, activation computed by write pipeline
}
```

### Key Design Decision: Flat Injection vs Activation-Based Retrieval

TF-GRPO injects all experiences. MUMA-Mem retrieves by activation. Two options:

**Option A — Let activation scoring handle it (simpler):**
Practice-derived notes are just notes. They compete for retrieval slots alongside episodic and declarative notes. Their initial high importance score gives them a boost, but they decay naturally if not accessed.

- **Pro:** No special handling. Existing infrastructure works.
- **Con:** Practice insights may be outcompeted by recent episodic memories, even though they represent higher-quality generalized knowledge.

**Option B — Separate guideline injection (more faithful to TF-GRPO):**
Before running the standard memory retrieval, inject all practice-derived notes for the active domain as a "guidelines" section. Then run normal retrieval for episodic context.

- **Pro:** Mirrors TF-GRPO's injection pattern. Guidelines always present for their domain.
- **Con:** Additional context cost. Needs domain detection for the current task.

**Recommendation:** Start with Option A (simpler). Monitor whether practice-derived notes are actually retrieved in real usage. If they're consistently outcompeted, switch to Option B.

---

## 9. Continuous vs One-Shot Practice

### Reference Implementation: One-Shot Batch

TF-GRPO is designed as a one-shot training process:
1. Run 1-3 epochs over a fixed dataset
2. Produce a static experience library
3. Bake the library into the agent config
4. Done — no further updates

### MUMA-Mem Context: Continuous Operation

MUMA-Mem agents operate continuously. Knowledge evolves. New domains emerge. Old knowledge decays. This demands a different practice model.

### Proposed: Incremental Practice with Spaced Repetition

```
Practice Session Types:
├── Initial Practice (new domain detected)
│   Full session: 3 epochs, 50 tasks, G=3
│   Goal: Bootstrap domain expertise
│
├── Maintenance Practice (scheduled)
│   Light session: 1 epoch, 10 tasks, G=3
│   Goal: Refine and validate existing knowledge
│   Trigger: Spaced repetition schedule (increasing intervals)
│
├── Remedial Practice (failure detected)
│   Targeted session: 1 epoch, 20 tasks from failure area, G=5
│   Goal: Fix specific knowledge gaps
│   Trigger: Failure rate exceeds threshold
│
└── Exploratory Practice (user-initiated)
    Custom session: user-defined tasks and parameters
    Goal: Directed skill development
    Trigger: Manual command
```

### Experience Library Lifecycle

Unlike TF-GRPO's static library, MUMA-Mem practice notes follow the standard note lifecycle:

1. **Created** by practice session with high importance
2. **Accessed** when retrieved during normal agent interactions (reinforces activation)
3. **Decayed** by Ebbinghaus forgetting if not accessed
4. **Consolidated** with episodic notes during daily consolidation
5. **Refined** by subsequent practice sessions (UPDATE operations)
6. **Pruned** if activation drops below threshold (no longer useful)

This means practice-derived knowledge that isn't actually useful in real interactions will naturally fade — a self-correcting mechanism TF-GRPO lacks.

---

## 10. Cost Modeling

### Reference Costs (from paper)

| Scenario | Training Samples | Epochs | Cost |
|---|---|---|---|
| Math (DeepSeek-V3.1) | 100 | 1 | ~$8 |
| Math + ReAct (DeepSeek-V3.1) | 100 | 1 | ~$18 |
| Web search (DeepSeek-V3.1) | 100 | 3 | ~$8 |

Cost breakdown (math + ReAct, 100 samples, 3 steps):
- 38M input tokens + 6.6M output tokens = ~$18
- Per-sample rollout: ~380K input + 66K output tokens
- Per-sample with cache hits: ~60K input + 8K output

### Projected Costs for MUMA-Mem Practice

Assumptions: 20 tasks, G=3 rollouts, 1 epoch, using mid-tier LLM (DeepSeek-V3 pricing).

| Stage | Input Tokens | Output Tokens | Calls | Est. Cost |
|---|---|---|---|---|
| Rollouts (20 tasks x 3) | ~100K/rollout x 60 | ~15K/rollout x 60 | 60 | ~$3.60 |
| Rollout summaries | ~10K/summary x 60 | ~2K/summary x 60 | 60 | ~$0.50 |
| Group advantages | ~15K/group x 20 | ~2K/group x 20 | 20 | ~$0.20 |
| Group updates | ~5K/update x 20 | ~1K/update x 20 | 20 | ~$0.08 |
| Batch update | ~10K x 1 | ~2K x 1 | 1 | ~$0.01 |
| **Total** | | | **161** | **~$4.40** |

This is per practice session. At one session per week, annual cost: ~$230. At one session per month: ~$53.

### Cost Optimization Strategies

1. **Smaller group size** — G=3 instead of G=5 (40% fewer rollouts, paper shows G=3 works for web tasks)
2. **Simulated rollouts** — LLM-only trajectories cost ~10x less than ReAct with tool calls
3. **Cached contexts** — DeepSeek's cache hit pricing reduces input cost significantly for repeated contexts
4. **Selective practice** — only practice on domains with low performance or new encounters, not globally
5. **Experience library size cap** — limit to ~30 experiences per domain (paper's math agent has 27)

---

## 11. Interaction with Identity Evolution

### How Practice Connects to EvoClaw Integration

Practice (TF-GRPO) and identity evolution (EvoClaw) share a conceptual core: both involve the agent learning from experience and updating its knowledge/behavior. The key distinction:

| Aspect | Practice (TF-GRPO) | Identity (EvoClaw) |
|---|---|---|
| **What changes** | Domain-specific tactical knowledge | Agent's values, personality, boundaries |
| **How learned** | Empirical — rollout comparison | Reflective — experience examination |
| **Validation** | Quantitative — reward scores | Qualitative — trigger detection |
| **Governance** | None (automatic) | 3-tier human oversight |
| **Scope** | Per-domain skill improvement | Cross-domain identity evolution |

### Integration Points

1. **Practice informs reflection:**
Practice sessions generate high-quality experiential data. When practice reveals that certain approaches consistently succeed or fail, this is a strong signal for identity reflection. A pattern of "the agent succeeds when it's cautious with assumptions" could trigger a SOUL.md proposal for a new value.

2. **Identity constrains practice:**
CORE identity values should constrain what the practice session optimizes for. If SOUL.md says "Never sacrifice accuracy for speed," the verification function should penalize fast-but-wrong responses even if they score well on a simple correctness metric.

3. **Practice validates identity changes:**
Before applying a SOUL.md proposal, run a practice session with and without the proposed change. If the change improves practice outcomes, it's empirically justified. If it degrades outcomes, the proposal should be reconsidered. This gives EvoClaw's governance model a quantitative dimension.

### Possible Research: Identity-Aware Reward Shaping

Standard TF-GRPO rewards are task-specific (correct/incorrect). Identity-aware rewards could incorporate alignment with the agent's values:

```
reward = α * task_correctness + β * identity_alignment + γ * tool_efficiency
```

Where `identity_alignment` measures how well the agent's behavior matches its SOUL.md values. This connects RL reward shaping literature with identity evolution.

**Research directions:**
- **Constitutional AI** (Bai et al. 2022) — using principles (analogous to SOUL.md) to shape reward. Directly relevant: principles → reward signal.
- **Value alignment** (Gabriel 2020, "Artificial Intelligence, Values, and Alignment") — philosophical and technical frameworks for aligning AI behavior with stated values.
- **Reward shaping in RL** (Ng et al. 1999) — formal conditions under which reward shaping preserves optimal policies. Important for ensuring identity constraints don't degrade task performance.

---

## 12. Research Directions

### High Priority (directly applicable)

| Topic | Key Question | Relevant Work | Expected Outcome |
|---|---|---|---|
| **LLM-as-judge calibration** | How reliable is LLM self-evaluation for reward signals? | Zheng et al. "Judging LLM-as-a-Judge" (2023); Li et al. "Generative Judge for Evaluating Alignment" (2024) | Calibration techniques, bias mitigation strategies, confidence thresholds for when to trust LLM judges |
| **Curriculum learning for practice** | How to select the most informative tasks for practice? | Bengio "Curriculum Learning" (2009); Graves "Automated Curriculum" (2017); Hacohen & Weinshall (2019) | Task selection heuristics based on difficulty, diversity, and expected learning signal |
| **Offline RL from logged interactions** | Can we practice on past trajectories without new rollouts? | Levine et al. "Offline RL Tutorial" (2020); Snell et al. "Offline RL for NLG" (2023) | Methods for extracting practice signal from historical agent interactions, eliminating rollout cost |
| **Experience library compression** | How to maintain a compact, high-value experience set? | Hinton "Knowledge Distillation" (2015); West et al. "Symbolic Knowledge Distillation" (2022) | Compression strategies that preserve actionable knowledge while reducing token count |

### Medium Priority (architectural decisions)

| Topic | Key Question | Relevant Work | Expected Outcome |
|---|---|---|---|
| **Context window allocation** | How to budget tokens between guidelines, memories, and conversation? | Liu et al. "Lost in the Middle" (2023); Xu et al. "Retrieval Meets Generation" (2024) | Optimal placement and budget allocation for different knowledge types |
| **Multi-agent practice** | Can agents practice cooperatively? | TF-GRPO paper's cross-domain transfer (Table 6); multi-agent RL (Lowe et al. 2017) | Shared practice sessions where multiple agents learn from each other's rollouts |
| **Process reward models** | Per-step verification instead of outcome-only? | Lightman "Let's Verify Step by Step" (2023); Wang et al. "Math-Shepherd" (2024) | Step-level feedback for richer learning signal per rollout |
| **Continual learning stability** | How to prevent practice from degrading old knowledge? | Kirkpatrick "Overcoming Catastrophic Forgetting" (2017); Lopez-Paz "Continual Learning" (2017) | Stability techniques for the experience library across practice sessions |

### Low Priority (future enhancements)

| Topic | Key Question | Relevant Work | Expected Outcome |
|---|---|---|---|
| **Self-play task generation** | Can the agent generate its own practice curriculum? | Wang "Self-Instruct" (2023); Chen "Self-Play Fine-Tuning" (2024) | Autonomous curriculum generation from the agent's knowledge graph |
| **Meta-learning practice schedules** | Can the system learn when and how to practice? | Finn "MAML" (2017); Xu "Meta-Learning for RL" (2018) | Adaptive practice scheduling based on observed improvement rates |
| **Transfer learning across agents** | Can one agent's practice experiences transfer to another? | TF-GRPO's domain transfer results; Pan "Transfer Learning Survey" (2010) | Cross-agent experience sharing protocol using MUMA-Mem's L3 |

### Papers to Read Next

1. **Agent KB** (ref [36] in TF-GRPO paper) — closest prior work to TF-GRPO's experience concept. Constructs hierarchical knowledge bases from agent trajectories. The "reason-retrieve-refine" process may offer insights for MUMA-Mem's practice integration.

2. **Reflexion** (Shinn et al. 2023) — iterative self-improvement through verbal reflection. Similar concept to TF-GRPO but per-instance rather than cross-instance. May inform the identity reflection pipeline.

3. **ExpeL: LLM Agents Are Experiential Learners** (Zhao et al. 2024) — agents learn from past experiences and transfer knowledge. Directly related to practice-derived experience injection.

4. **Voyager** (Wang et al. 2023) — LLM-powered agent that builds a skill library through exploration. The skill library concept parallels TF-GRPO's experience library.

5. **Learning to Learn with Compound HD Models** (ICML 2024 workshop) — meta-learning approaches for when to allocate compute to learning vs execution.

---

## 13. Reference Implementation Details

### File Reference Map

| File | Lines | Key Functions | Integration Relevance |
|---|---|---|---|
| `training_free_grpo.py` | ~250 | `run()`, `practice()`, `build()` | Orchestration pattern to port |
| `experience_updater.py` | ~360 | `run()`, `_single_rollout_summary()`, `_group_advantage()`, `_group_update()`, `_batch_update()` | Core algorithm to adapt |
| `rollout_manager.py` | ~200 | `main()`, `preprocess_batch()`, `rollout_batch()`, `judge_batch()` | Rollout pipeline to adapt or replace |
| `data_manager.py` | ~100 | `load_epoch_data()`, `get_batch_samples()` | Task selection patterns |
| `utils.py` | ~80 | `TaskRecorder`, `parse_training_free_grpo_config()` | Config pattern reference |
| `verify/math.py` | ~27 | `verify_func()` | Deterministic verifier pattern |
| `verify/webwalker.py` | ~35 | `verify_func()` | LLM-judge verifier pattern |

### Prompt Template Reference

| Template | Purpose | Adaptation Notes |
|---|---|---|
| `SINGLE_ROLLOUT_SUMMARY_TEMPLATE` | Summarize one trajectory step-by-step | Adapt to MUMA-Mem's trajectory format |
| `SINGLE_QUERY_GROUP_ADVANTAGE` | Compare good/bad trajectories, extract experiences | Core semantic advantage prompt — mostly reusable |
| `GROUP_EXPERIENCE_UPDATE_TEMPLATE` | Per-group ADD/UPDATE/DELETE/NONE decisions | Maps directly to MUMA-Mem's Decide step |
| `BATCH_EXPERIENCE_UPDATE_TEMPLATE` | Reconcile batch operations | Maps to conflict resolution logic |
| `PROBLEM_WITH_EXPERIENCE_TEMPLATE` | Inject experiences into agent prompt | Replace with MUMA-Mem's `before_agent_start` injection |

### Key Implementation Patterns to Preserve

1. **Mixed-group filtering** — only groups with 0 < mean(r) < 1 produce learning signal. This is the core GRPO insight and must be preserved.

2. **Two-phase update** — group-level updates then batch reconciliation. This prevents individual group operations from conflicting.

3. **Experience re-indexing** — after each step, experiences are renumbered G0, G1, G2, ... This prevents ID fragmentation. In MUMA-Mem, this maps to stable UUIDs with display labels.

4. **LLM temperature for diversity** — rollouts at 0.7, evaluation at 0.3. The temperature gap is essential for exploring the policy space during practice while being precise during deployment.

5. **Retry logic** — JSON parsing from LLM output uses regex fallback and retries. LLMs frequently produce malformed JSON. Robust parsing is required.

---

## 14. Alternative Implementation: tfgrpoMCP

An alternative TF-GRPO implementation (`~/repos/.obsolete/tfgrpoMCP/`) takes a fundamentally different approach: instead of batch practice over datasets, it wraps TF-GRPO as a **live MCP server** that the agent calls during normal work.

### Architecture Comparison

| Dimension | Youtu-Agent (Batch) | tfgrpoMCP (Live) | MUMA-Mem Implication |
|---|---|---|---|
| **Execution model** | Batch pipeline over datasets | Real-time MCP tools during work | We likely want both modes |
| **Rollouts** | Automated: G parallel rollouts per query | Manual: agent logs own attempts as they happen | Live mode = zero rollout cost |
| **Experience update** | 4-stage LLM pipeline (summarize → compare → group update → batch reconcile) | Single minimal LLM call extracting {pattern, keywords, insight} | Tradeoff: quality vs latency |
| **Experience retrieval** | Inject ALL into prompt | Semantic search (embeddings + keyword boost), return top-N | Validates activation-based retrieval approach |
| **Storage** | Flat dict, injected wholesale | Structured JSON per experience with embeddings | Closer to MUMA-Mem's Note model |
| **Verification** | Automated verify functions (math/LLM-judge) | Manual success/failure boolean | Live mode relies on implicit signal |
| **Experience format** | Flat text: `"Name: Description."` | Structured: `{pattern, keywords, insight, embedding}` | Structured format maps better to Notes |
| **Scale** | 100+ tasks, multi-epoch | One episode at a time | Different cost profiles |
| **Codebase** | ~50K+ lines (full framework) | ~690 lines (4 files) | Minimal viable implementation |

### Novel Ideas Worth Incorporating

**1. Live Episode Tracking (the biggest insight)**

tfgrpoMCP introduces 4 MCP tools: `start_episode`, `log_attempt`, `end_episode`, `pull_experiences`. The agent calls these during normal work — creating a self-improving feedback loop without dedicated practice sessions.

This maps directly to MUMA-Mem's existing hook infrastructure:

```
tfgrpoMCP tool          →  MUMA-Mem equivalent
─────────────────────────────────────────────────
start_episode(task)     →  session_start hook (already exists)
log_attempt(desc, err)  →  after_tool_call hook (already captures)
end_episode(result)     →  session_end hook (already exists)
pull_experiences(query)  →  before_agent_start hook (already injects)
```

MUMA-Mem already captures the raw data that tfgrpoMCP's tools collect. The missing piece is the **episode-level semantic extraction** — analyzing a completed session to extract "what worked that was missing from failures" rather than just storing individual facts.

This suggests a new processing step at `session_end`: if the session contained both failures and successes (the mixed-signal filter from the paper), run a lightweight experience extraction LLM call to distill a pattern/insight from the contrast.

**2. Structured Experience Format**

tfgrpoMCP stores experiences as:
```json
{
  "pattern": "what worked that was missing from failures (5-10 words)",
  "keywords": ["relevant", "search", "terms"],
  "insight": "brief actionable insight (10-15 words)"
}
```

This is more structured than Youtu-Agent's flat text strings. For MUMA-Mem, this maps to enriching the Note type:

```typescript
// Practice-derived note enrichment
{
  content: insight,           // The actionable insight
  context: pattern,           // The pattern that triggered it
  keywords: keywords,         // Search keywords from extraction
  tags: ["practice", domain], // Always tagged
  source: "practice",         // Provenance
}
```

The separation of `pattern` (the problem pattern) from `insight` (what to do about it) is useful. MUMA-Mem's existing `content` + `context` fields already support this split.

**3. Selective Retrieval via Embeddings**

tfgrpoMCP embeds each experience and retrieves by cosine similarity + keyword boosting, returning only the top-N relevant ones. This is the exact approach MUMA-Mem already uses (vector search + ACT-R scoring), validating the design.

The keyword boost is interesting: tfgrpoMCP scores 0.5 per matching word when semantic search is available, 1.0 per word when only keyword search is available, with additional bonus for word-boundary matches. This is a simpler version of MUMA-Mem's spreading activation.

**4. Error Pre-Processing**

tfgrpoMCP extracts just the error type and file:line from full stderr traces using regex, reducing token cost dramatically:

```python
# Input: 500-line stack trace
# Output: "TimeoutError @ main.py:42"
```

This pattern is useful for MUMA-Mem's `after_tool_call` hook, which currently captures full tool output. For practice-derived experience extraction, distilling errors to their essence before LLM processing would reduce cost.

### The Two-Mode Model

The key takeaway is that MUMA-Mem should support **two complementary learning modes**:

```
┌─────────────────────────────────────────────────┐
│            Active Learning Modes                 │
│                                                  │
│  MODE 1: Live Learning (from tfgrpoMCP)          │
│  ─────────────────────────────────               │
│  When: During every agent session                │
│  How: session_end hook analyzes the session       │
│  Signal: Mixed success/failure within session     │
│  Cost: 1 LLM call per qualifying session          │
│  Output: Lightweight experience notes             │
│  Latency: Seconds (single extraction call)        │
│                                                  │
│  MODE 2: Batch Practice (from Youtu-Agent)        │
│  ─────────────────────────────────                │
│  When: Scheduled or triggered                     │
│  How: Deliberate rollouts on practice tasks       │
│  Signal: Verification functions score outcomes    │
│  Cost: ~$4 per 20-task session                    │
│  Output: Refined, high-quality experience notes   │
│  Latency: Minutes (full pipeline)                 │
│                                                  │
│  Both modes write to the same L2 store.           │
│  Both produce notes with source:"practice".       │
│  Live learning is always-on, low cost.            │
│  Batch practice is periodic, high quality.        │
└─────────────────────────────────────────────────┘
```

Live learning catches patterns from real work in real-time. Batch practice deliberately explores and refines knowledge in controlled conditions. Together they provide both breadth (live) and depth (batch).

### Implementation Priority

Live learning (Mode 1) should be implemented first because:
- It requires no rollout infrastructure (uses existing hooks)
- It has near-zero marginal cost (one LLM call per qualifying session)
- It produces immediate value from the agent's real work
- It validates the experience extraction pipeline before investing in batch practice

Batch practice (Mode 2) adds value later for:
- Domains where the agent has no interaction history
- Deliberate skill development on specific topics
- Empirical validation of identity evolution proposals
- Systematic refinement of experience quality

### What NOT to Adopt from tfgrpoMCP

1. **No deduplication/revision** — tfgrpoMCP just appends experiences forever, leading to unbounded growth. MUMA-Mem's existing write pipeline (with Decide step) handles deduplication naturally.

2. **Manual success/failure flagging** — tfgrpoMCP relies on the agent/user to mark success. MUMA-Mem should detect mixed signals automatically (tool errors, retries, user corrections as failure indicators; task completion as success).

3. **Flat file storage** — tfgrpoMCP uses one JSON file per experience. MUMA-Mem's store with vector indexing and activation scoring is superior.

4. **Hardcoded free-tier model** — tfgrpoMCP uses `google/gemma-3-4b-it:free` for extraction. MUMA-Mem should use its configured LLM provider.

5. **No experience evolution** — tfgrpoMCP experiences are write-once. MUMA-Mem's pipeline naturally updates and evolves notes through the Decide → Link → Evolve stages.

### Updated Cost Model with Live Learning

Adding live learning to the cost model from Section 10:

| Mode | Trigger | Tasks | LLM Calls | Est. Cost | Frequency |
|---|---|---|---|---|---|
| Live learning | Qualifying session ends | 1 | 1 extraction | ~$0.002 | Per session |
| Batch practice | Scheduled/triggered | 20 | ~161 | ~$4.40 | Weekly/monthly |

At 20 qualifying sessions/day (generous estimate), live learning costs ~$0.04/day or ~$15/year. Negligible compared to the agent's normal LLM usage.

---

*Research document created 2026-02-18. Updated with tfgrpoMCP analysis.*
*Based on arXiv:2510.08191, Youtu-Agent reference implementation, and tfgrpoMCP alternative implementation.*
