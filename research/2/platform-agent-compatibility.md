# Agent Compatibility Analysis: Confidant vs NLP on a Shared Platform

> Can the Confidant and NLP Practitioner agents run on the same chatbot platform, or do they need separate solutions?

**Conclusion: Same platform, with a Bot Archetype layer.** The core memory system is universal. The differences live in an application layer above it — a "bot archetype" that defines session protocol, learning strategy, safety model, and retrieval behavior. The platform provides primitives; the archetype defines how they compose.

---

## Where They Converge

Both agents use the same foundational systems, just configured differently:

| System | Confidant | NLP Practitioner | Common Ground |
|--------|-----------|------------------|---------------|
| **Note storage** | L2 with relational notes | L2 with clinical + technique notes | Same `MemoryStore` interface, same Note model |
| **Working memory** | L1 per-session | L1 per-TOTE session | Same `WorkingMemory` class |
| **Write pipeline** | Extract → Decide → Link → Evolve | Same pipeline, different extraction prompts | Same pipeline, pluggable prompts |
| **Activation scoring** | ACT-R with semantic retrieval | Same ACT-R math | Identical |
| **Decay & consolidation** | Ebbinghaus with relational decay tuning | Ebbinghaus with clinical decay tuning | Same engine, different half-life configs |
| **Identity** | SOUL.md with CORE/MUTABLE | SOUL.md with CORE/MUTABLE | Same structure, different content |
| **Embedding & LLM** | Same providers | Same providers | Identical |
| **Session lifecycle** | start → messages → end | start → TOTE loop → end | Same hooks, different implementations |

The entire `@promem/core` package works identically for both. The differences are all in the layer above.

---

## Where They Diverge

### 1. Session Protocol

| Aspect | Confidant | NLP Practitioner |
|--------|-----------|------------------|
| **Structure** | Freeform conversation | Structured TOTE loop (Test-Operate-Test-Exit) |
| **Data capture** | Qualitative (themes, emotions, callbacks) | Quantitative (SUD scores, technique outcomes, step rewards) |
| **Success metric** | Relationship quality (soft) | SUD reaches 0 (hard) |
| **Session length** | Variable, no target | Technique-driven, has a completion condition |

**Platform implication:** The platform needs a pluggable session protocol. Freeform sessions just pass messages through with memory injection. Structured sessions have a state machine (TOTE) that tracks progress and captures structured data between messages.

### 2. Memory Domains and Note Schemas

**Confidant domains:**
- `user.world` — people, places, storylines
- `user.conversations` — key moments, inside jokes, shared references
- `user.preferences` — communication style, support preferences
- `agent.observations` — patterns noticed, hypotheses about the user

**NLP domains:**
- `user.calibration` — representational system, submodality sensitivity, SUD scale calibration
- `clinical.issues` — issue catalog with structured fields (category, SUD history, technique records)
- `clinical.techniques` — per-technique outcome records with numerical data
- `clinical.sessions` — full TOTE records with SUD trajectories

**Platform implication:** Domains are already string-typed in MUMA-Mem — no schema changes needed. But the NLP agent stores structured data (interfaces like `IssueCatalog`, `TechniqueRecord`) inside note content. The platform should support typed note schemas per archetype, or at minimum structured metadata fields on notes.

### 3. Retrieval Strategy

**Confidant retrieval priority:**
1. Active storylines (ongoing situations)
2. Recent session themes
3. Pending callbacks (things to follow up on)
4. Relationship context (key people)
5. Communication style guidelines

**NLP retrieval priority:**
1. User calibration data (rep system, SUD scale)
2. This issue's history (if previously worked on)
3. Technique efficacy data for this user + issue category
4. Recent session context + pending durability checks

**Platform implication:** Retrieval is already a search over activation-scored notes. The difference is in the query construction and domain filtering. Each archetype provides its own "context assembly" function that builds the pre-session prompt from retrieved notes.

### 4. Learning Architecture

| Aspect | Confidant | NLP Practitioner |
|--------|-----------|------------------|
| **Primary signal** | Engagement heuristics (qualitative) | SUD deltas (quantitative) |
| **Mode distribution** | 90% live, 8% retrospective, 2% practice | 40% live, 40% batch practice, 20% cross-user |
| **Reward function** | Relationship health metrics (soft) | Composite: outcome + completeness + efficiency + comfort + durability |
| **Extraction prompt** | Relational: "what resonated vs what fell flat" | Technical: "which technique worked, which didn't, why" |
| **Cross-user learning** | Disabled (everything is personal) | Enabled (technique efficacy generalizes) |
| **Practice type** | Monthly retrospective self-reflection | Cross-session statistical analysis every 10 sessions |

**Platform implication:** The learning system needs to be fully pluggable:
- **Reward function**: archetype-defined
- **Extraction prompt**: archetype-defined
- **Learning trigger**: archetype-defined (engagement contrast vs every session)
- **Cross-user aggregation**: opt-in per archetype
- **Batch analysis schedule and logic**: archetype-defined

### 5. L3 Knowledge Commons Participation

| | Confidant | NLP Practitioner |
|--|-----------|------------------|
| **Writes to L3** | Never | Anonymized technique efficacy stats |
| **Reads from L3** | Never | Technique selection guidelines, stall recovery patterns |
| **Rationale** | Everything is personal and private | Technique efficacy generalizes across users |

**Platform implication:** L3 participation must be per-archetype configurable. The platform provides L3 infrastructure, but archetypes opt in or out. When opted in, the archetype defines what gets promoted and how it's anonymized.

### 6. Safety Model

**Confidant safety:**
- Relational boundaries (no manipulation, no unsolicited advice)
- Professional referral for clinical needs
- Maximum privacy (all notes `user-only`)
- No cross-user data sharing

**NLP safety:**
- Hard contraindications (complex trauma → no re-experiencing techniques)
- Abreaction detection and containment protocol
- Ecology enforcement (mandatory post-resolution check)
- SUD regression protocol (stop if SUD spikes)
- Scope boundaries (not a licensed therapist)

**Platform implication:** Safety is archetype-specific and non-negotiable. The platform provides safety hook points (pre-technique gates, post-response checks), but the rules themselves are defined by the archetype and marked as CORE (unmodifiable by learning or identity evolution).

### 7. Identity Evolution

| Aspect | Confidant | NLP Practitioner |
|--------|-----------|------------------|
| **Governance** | Autonomous with notification | Advisory (human review for key changes) |
| **What evolves** | Communication register, humor, challenge tolerance, emotional range | Technique preference defaults, pacing, induction style |
| **Evolution speed** | Gradual, continuous | Data-driven, after accumulating outcomes |
| **Trigger** | Relational signals | Technique efficacy statistics |

**Platform implication:** Identity governance level is an archetype setting. The platform provides the evolution machinery (significance classification, proposal generation, governance gating); the archetype configures how aggressively it runs.

---

## The Bot Archetype Abstraction

All divergences map to a single abstraction: **the Bot Archetype**. This is the contract between the platform and a specific type of bot.

```typescript
interface BotArchetype {
  // Identity
  id: string;                           // "confidant" | "nlp_practitioner" | ...
  name: string;
  defaultSoulTemplate: string;          // Starting SOUL.md content

  // Memory Configuration
  domains: DomainConfig[];              // Registered domains with visibility defaults
  noteSchemas?: NoteSchema[];           // Optional typed metadata schemas
  decayOverrides?: DecayConfig;         // Custom half-lives per domain
  pinnedDomains?: string[];             // Domains exempt from decay

  // Session Protocol
  sessionType: "freeform" | "structured";
  sessionProtocol?: SessionProtocol;    // State machine definition (for structured)

  // Context Assembly
  retrievalStrategy: RetrievalStrategy; // How to build pre-session context
  tokenBudget: TokenBudgetConfig;       // Max tokens per context category

  // Learning
  learningConfig: {
    rewardFunction: RewardFunction;     // How to score sessions
    extractionPrompt: string;           // LLM prompt for insight extraction
    triggerCondition: TriggerCondition;  // When to run extraction
    batchSchedule?: BatchSchedule;      // When to run batch analysis
    batchAnalysis?: BatchAnalysisFunc;  // Cross-session analysis logic
    crossUserLearning: boolean;         // L3 participation
    l3PromotionRules?: L3Rules;         // What/how to promote to L3
  };

  // Identity Evolution
  identityConfig: {
    governance: "autonomous" | "advisory" | "supervised";
    evolutionTriggers: EvolutionTrigger[];
    coreProtections: string[];          // CORE traits that never change
  };

  // Safety
  safetyConfig: {
    preActionGates: SafetyGate[];       // Checks before agent takes action
    postResponseChecks: SafetyCheck[];  // Checks after generating response
    hardConstraints: Constraint[];      // Non-overridable rules
    referralTriggers: ReferralRule[];   // When to suggest professional help
  };

  // Privacy
  privacyConfig: {
    defaultVisibility: Visibility;
    crossUserDataSharing: boolean;
    dataRetentionPolicy: RetentionPolicy;
  };
}
```

### Platform vs Archetype Responsibility Split

| Platform Provides | Archetype Defines |
|---|---|
| User accounts, auth, billing | Bot personality and SOUL.md content |
| Note storage (MemoryStore) | Domain structure and note schemas |
| Write pipeline (Extract → Decide → Link) | Extraction and decide prompts |
| ACT-R activation + Ebbinghaus decay | Decay parameters per domain |
| Vector search + retrieval | Query construction and context assembly |
| Session lifecycle hooks | What happens at each hook |
| Learning infrastructure (extraction, batch jobs) | Reward function, prompts, schedules |
| Identity evolution machinery | Governance level, evolution triggers |
| Safety hook points | Safety rules and constraints |
| L3 Knowledge Commons infrastructure | Whether to participate and what to share |
| Background job scheduler | Job definitions and schedules |
| API + web UI | UI customizations (chat-only vs TOTE tracker) |

---

## What This Means for Platform Design

### Archetype Registry

The platform ships with built-in archetypes (confidant, NLP practitioner, etc.) and allows custom archetypes. Users select an archetype when creating a bot, which pre-configures everything.

```
User creates bot →
  Select archetype: [Confidant] [NLP Practitioner] [Custom...]
  → Archetype pre-fills: SOUL.md template, domain config, learning config, safety rules
  → User customizes: personality details, name, specific preferences
  → Bot created with archetype + customizations
```

### UI Implications

Different archetypes may need different conversation UIs:

- **Confidant**: Simple chat interface. No special widgets.
- **NLP Practitioner**: Chat + SUD tracker sidebar (current SUD, session trajectory graph, technique history). Maybe a "technique in progress" indicator.

The platform should support archetype-defined UI extensions — either through a widget system or archetype-specific conversation views.

### Database Schema Impact

The platform's core schema stays the same (users, bots, conversations, messages). The archetype adds:

- **Bot metadata**: archetype ID, archetype-specific config overrides
- **Structured session data**: for archetypes with structured protocols (TOTE records for NLP), stored alongside or within conversation records
- **Archetype-specific indexes**: NLP needs fast lookups by issue category + technique; confidant doesn't need this

This could be handled with a JSONB metadata column on conversations/messages, or archetype-specific tables.

---

## What Would NOT Work as a Single Platform

If the divergences were at the infrastructure level rather than the application level, separate solutions would be needed. Specifically:

- If they needed **different storage engines** → they don't (both use MemoryStore)
- If they needed **different embedding models** → they don't (same vectors work for both)
- If they needed **fundamentally different data models** → they don't (both use Notes)
- If they needed **different scaling characteristics** → possibly (NLP batch analysis is heavier, but manageable with job queues)
- If they needed **different deployment models** → they don't (both are web-based conversational agents)

The divergences are all in the behavioral/application layer, which is exactly what an archetype system abstracts.

---

## Verdict

**One platform, with a Bot Archetype layer.**

The extraction strategy from the [platform analysis](./platform-extraction-analysis.md) becomes:

```
@promem/core          — Memory engine (unchanged)
@promem/archetypes    — Bot archetype definitions (new)
@promem/platform      — Platform (API, auth, UI, jobs, archetype registry)
```

The archetype layer is the key addition. It turns the platform from "a chatbot with memory" into "a platform where different kinds of memory-augmented bots can coexist" — which is what you need if one user might want a confidant AND an NLP practitioner, each with their own personality, memory, learning approach, and safety model, but all running on the same infrastructure.

### MVP Adjustment

The [original MVP](./platform-extraction-analysis.md#mvp-scope-suggestion) suggested skipping complex features. With the archetype model, the MVP becomes:

1. **Extract `@promem/core`** — unchanged
2. **Define `BotArchetype` interface** — the contract (simplified for MVP)
3. **Ship two archetypes**: "conversational" (simplified confidant) and "structured" (simplified NLP practitioner)
4. **Build platform with archetype awareness** — bot creation selects archetype, session lifecycle delegates to archetype hooks
5. **Defer**: cross-user learning (L3), identity evolution, batch practice pipelines

This way the architecture supports both agent types from day one, even if the learning and evolution features come later.
