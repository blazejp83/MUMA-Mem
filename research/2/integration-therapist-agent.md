# Integration Spec: Therapist Agent

> Memory + Identity + Active Learning for a psychological counseling agent

**Context:** Agent embodies a therapist/counselor persona, working through conversation to support users with emotional wellbeing, cognitive patterns, and behavioral change. Operates without specific NLP protocols — relies on general therapeutic principles (active listening, Socratic questioning, cognitive reframing, validation, psychoeducation).

---

## Table of Contents

1. [Agent Profile](#1-agent-profile)
2. [System Emphasis Distribution](#2-system-emphasis-distribution)
3. [Signal Landscape](#3-signal-landscape)
4. [MUMA-Mem Integration](#4-muma-mem-integration)
5. [EvoClaw Identity Integration](#5-evoclaw-identity-integration)
6. [TF-GRPO Active Learning Integration](#6-tf-grpo-active-learning-integration)
7. [Verification Design](#7-verification-design)
8. [Practice Architecture](#8-practice-architecture)
9. [Safety Architecture](#9-safety-architecture)
10. [Experience Taxonomy](#10-experience-taxonomy)
11. [Cross-Session Intelligence](#11-cross-session-intelligence)
12. [Implementation Considerations](#12-implementation-considerations)

---

## 1. Agent Profile

**Primary function:** Supportive psychological counseling through conversation. No formal diagnosis, no prescribing, no specific protocol adherence — general therapeutic support.

**Core activities:**
- Active listening and reflection
- Helping users identify cognitive patterns
- Suggesting behavioral experiments and coping strategies
- Providing psychoeducation about emotions and cognition
- Supporting users through difficult experiences
- Tracking emotional states and progress over time

**What success looks like:**
- User feels heard and understood
- User gains insight into their patterns
- User tries suggested strategies and reports back
- User's self-reported wellbeing improves over time
- User develops their own coping toolkit
- User remains engaged across sessions

**What failure looks like:**
- User feels dismissed or misunderstood
- Advice is generic, not tailored to the user
- User disengages (short replies, stops returning)
- Suggestions are inappropriate for the user's situation
- The agent misses signs of escalation or crisis
- The agent pushes when the user needs space

---

## 2. System Emphasis Distribution

```
MUMA-Mem (memory):     30%  — User history, emotional timeline, what was tried
EvoClaw (identity):    35%  — Therapeutic approach, boundaries, practitioner style
TF-GRPO (learning):   35%  — What response patterns produce engagement/insight
```

Identity and active learning are co-dominant. The agent needs both a coherent therapeutic approach (identity) AND the ability to refine that approach based on what actually works with each user (learning).

Memory is essential but supporting — it provides the context that makes identity and learning effective.

---

## 3. Signal Landscape

### Available Reward Signals

Unlike tool-using agents, the therapist agent has no binary success/failure. Instead, it operates with a spectrum of soft signals across three timescales.

**Immediate (within-message):**

| Signal | Indicator | Polarity | Reliability |
|---|---|---|---|
| Elaboration | User writes longer, more detailed response | Positive | Medium |
| Self-disclosure | User shares something vulnerable | Positive | High |
| Explicit feedback | "That's helpful" / "That doesn't fit" | Positive/Negative | High |
| Insight markers | "I never thought of it that way" / "Oh, that makes sense" | Positive | High |
| Deflection | User changes topic immediately after agent's point | Negative | Medium |
| Closed responses | One-word or minimal replies | Negative | Medium |
| Correction | "No, that's not what I meant" | Negative (misattunement) | High |
| Emotional escalation | User becomes more distressed after agent's response | Negative | High |
| Restating | User repeats what they just said | Negative (not heard) | High |

**Session-level (within-conversation):**

| Signal | Indicator | Polarity | Reliability |
|---|---|---|---|
| Session length | Longer sessions (user choosing to continue) | Positive | Medium |
| Depth progression | Topics get more personal within session | Positive | High |
| Recovery from rupture | Agent misattunes, user corrects, conversation recovers | Positive (trust) | High |
| Abrupt ending | User leaves mid-conversation | Negative | High |
| Energy trajectory | Conversation energy increases vs decreases | Positive/Negative | Medium |
| Homework acceptance | User agrees to try a suggestion | Positive | Medium |

**Cross-session (over time):**

| Signal | Indicator | Polarity | Reliability |
|---|---|---|---|
| Return rate | User comes back for more sessions | Positive | High |
| Initiation pattern | User initiates vs only responds | Positive | Medium |
| Reference to past | "I tried what you suggested about..." | Positive | High |
| Deepening trust | More vulnerability over sessions | Positive | High |
| Self-reported state | "I've been feeling better about..." | Positive | High |
| Strategy adoption | User reports using techniques on their own | Positive | High |
| Issue recurrence | Same problem keeps coming back despite work | Negative | Medium |
| Decreasing frequency | User comes less often (could be positive — independence — or negative — disengagement) | Ambiguous | Low |

### Signal Reliability Hierarchy

```
Most reliable (use for direct learning):
  1. Explicit verbal feedback ("that helped" / "that doesn't apply")
  2. Insight markers ("oh, I see...")
  3. Cross-session references to past suggestions
  4. Self-reported state changes

Moderately reliable (use for pattern detection):
  5. Self-disclosure depth progression
  6. Elaboration vs closed responses
  7. Session length and energy trajectory
  8. Homework acceptance and follow-through

Least reliable (use only as supporting evidence):
  9. Response length (confounded by personality)
  10. Session frequency (confounded by schedule)
  11. Topic changes (could be natural flow, not avoidance)
```

---

## 4. MUMA-Mem Integration

### What to Store

**User model notes (domain: "user.profile"):**
- Demographic context (what the user has shared, never assumed)
- Key relationships (partner, family, friends, colleagues — as mentioned)
- Life circumstances (work, living situation, major events)
- Communication style preferences (direct vs indirect, intellectual vs emotional)
- Self-identified concerns and goals
- Values and beliefs the user has expressed

**Emotional timeline notes (domain: "user.emotional"):**
- Emotional states reported across sessions with timestamps
- Triggers identified (situations that reliably produce certain emotions)
- Coping strategies the user already uses (what works, what doesn't)
- Emotional vocabulary the user uses (their words, not clinical terms)

**Intervention tracking notes (domain: "therapeutic.interventions"):**
- Suggestions made and their context
- User's response to each suggestion (accepted, rejected, tried, reported back)
- Techniques discussed with outcomes
- Psychoeducation topics covered (avoid repetition)

**Session summary notes (domain: "therapeutic.sessions"):**
- Key themes per session
- Emotional arc (started at X, ended at Y)
- What worked and what didn't in this specific session
- Open threads (topics to follow up on)

### Note Type Enrichment

Add fields to Note type for therapeutic context:

```typescript
// Therapeutic metadata (stored in note metadata or tags)
{
  emotional_valence: number;       // -1 to 1 (negative to positive)
  disclosure_depth: number;        // 0 to 1 (surface to deeply personal)
  intervention_type?: string;      // "reframe" | "validation" | "psychoeducation" | "suggestion" | ...
  user_response?: string;          // "accepted" | "rejected" | "tried" | "unknown"
  follow_up_needed: boolean;       // Should the agent bring this up again?
}
```

### Retrieval Adaptations

**Before session:** Retrieve high-activation notes about the user's current concerns, recent emotional state, and any pending follow-ups. This gives the agent context without requiring the user to repeat themselves.

**During session:** Working memory (L1) captures the live conversation. Promote emotionally significant moments and new disclosures to L2 at session end.

**Between sessions:** Consolidation should cluster by emotional theme, not just semantic similarity. "Work stress" and "insomnia" might be semantically distant but emotionally linked for this user.

### Decay Adaptations

Standard Ebbinghaus decay works for most therapeutic notes, but with adjustments:

- **Crisis-related notes** should decay much slower (longer half-life). If the user mentioned suicidal ideation 6 months ago, the agent must still be aware.
- **Core identity notes** (user's values, key relationships) should have very high half-life or be pinned.
- **Intervention outcomes** should decay based on relevance, not just time. A technique that worked should remain accessible.
- **Factual details** (dates, names, places) can decay at standard rate — if the user brings them up again, they're reinforced naturally.

---

## 5. EvoClaw Identity Integration

### SOUL.md Structure

```markdown
# Therapeutic Agent Identity

## Personality
- [CORE] I am warm, genuine, and non-judgmental in all interactions
- [CORE] I listen more than I speak and always validate before responding
- [MUTABLE] I use a conversational, accessible tone rather than clinical language
- [MUTABLE] I tend toward Socratic questioning to help users find their own insights
- [MUTABLE] I use gentle humor when appropriate to lighten heavy moments

## Philosophy
- [CORE] Every person is the expert on their own experience
- [CORE] My role is to support, not to fix
- [CORE] Change happens at the user's pace, not mine
- [MUTABLE] I believe insight comes from examining patterns, not just events
- [MUTABLE] I favor behavioral experiments over pure talk when action seems helpful

## Boundaries
- [CORE] I never diagnose mental health conditions
- [CORE] I always recommend professional help for serious concerns (suicidality, abuse, psychosis)
- [CORE] I do not prescribe or recommend medication
- [CORE] I am transparent about being an AI and what that means for our interaction
- [CORE] I never push past resistance — if the user isn't ready, I respect that
- [MUTABLE] I generally avoid giving direct advice, preferring to help the user reach their own conclusions
- [MUTABLE] I check in about the user's emotional state at the start of each session

## Continuity
- [MUTABLE] I reference past sessions to show I remember and care
- [MUTABLE] I follow up on suggestions and homework from previous sessions
- [MUTABLE] I name patterns I notice across sessions ("I notice this comes up when...")
```

### Identity Evolution Triggers

The therapist agent's identity should evolve through governed proposals based on:

1. **Approach effectiveness** — If Socratic questioning consistently produces insight markers but direct suggestions consistently produce deflection with this user, the MUTABLE philosophy should shift.

2. **Relationship deepening** — As trust builds, the agent might evolve toward more challenging or direct approaches that would have been premature early on.

3. **Communication style matching** — If the user consistently responds better to metaphors than to analytical language, the personality section should reflect this.

4. **Therapeutic stance adaptation** — Some users need more structure, others more space. The agent should evolve its stance based on accumulated evidence.

### Governance Level

**Recommended: Advisory.**

- CORE values auto-protect (safety, transparency, boundaries)
- MUTABLE personality and philosophy changes auto-apply for low-impact adjustments (communication style tweaks)
- Therapeutic stance changes (shifting from non-directive to more directive, or vice versa) should require human review
- Any change that affects safety-adjacent behavior requires supervised governance

---

## 6. TF-GRPO Active Learning Integration

### Learning Mode Distribution

```
Live Learning (Mode 1):    80% of learning signal
Batch Retrospective:       15% of learning signal
Cross-User Meta-Learning:   5% of learning signal (if multi-user)
```

The therapist agent learns primarily from live sessions. Batch practice on synthetic users is minimally useful — therapeutic quality depends on the specific relationship.

### Live Learning Implementation

**Trigger:** End of every session that produced mixed signals (some positive engagement markers AND some negative signals). Sessions with only positive signals or only negative signals have less learning value (no contrast).

**Extraction prompt:**

```
Analyze this therapeutic conversation for effectiveness patterns.

Session context:
- User's current concerns: {from_memory}
- Session number with this user: {count}
- Relationship stage: {early | developing | established}

Conversation transcript:
{transcript}

Identify:
1. EFFECTIVE MOMENTS: Where the user showed engagement, insight, or emotional
   movement. What did the agent do immediately before?
2. INEFFECTIVE MOMENTS: Where the user deflected, gave short answers, or
   showed signs of disengagement. What did the agent do immediately before?
3. PATTERN: What approach (questioning style, timing, framing) distinguished
   effective from ineffective moments?
4. GUIDELINE: One actionable guideline for future sessions with this user.
   Format: "When [specific context], [specific approach] because [reason]."
```

**Output → MUMA-Mem write pipeline:**

```typescript
{
  content: guideline,                    // "When this user discusses family..."
  context: pattern,                      // The comparative analysis
  keywords: extractKeywords(guideline),
  tags: ["practice", "therapeutic", domain],
  source: "practice",
  domain: "therapeutic.approach",
  importance: 0.7,
  confidence: signalStrength,            // Based on how clear the contrast was
  visibility: "private",                // User-specific, not shared
}
```

### Batch Retrospective

**Trigger:** Monthly, or when the agent notices declining engagement signals.

**Process:**
1. Select 5-10 past sessions with the strongest contrast (mixed positive/negative signals)
2. For each session, identify the key decision point (where the conversation could have gone differently)
3. Generate 3 alternative responses at that point
4. Evaluate alternatives against therapeutic principles AND this user's known preferences
5. Extract meta-pattern about what the decision points have in common

This is not TF-GRPO's standard rollout (no new execution), but uses the same semantic advantage logic: compare what happened with what could have happened, extract the distinguishing factor.

### What the Agent Learns

**User-specific therapeutic patterns:**
```
"This user processes grief through storytelling, not analysis.
When they start telling a memory, follow the narrative — don't
interrupt with questions about feelings."

"Validation must come BEFORE any reframe attempt with this user.
If I jump to reframing, they hear it as dismissal. The sequence
is: reflect → validate → pause → ask permission → reframe."

"This user's 'I'm fine' at session start means 'I need you to
ask again.' Always follow up with 'And how are you really?'"

"Evening sessions: this user arrives emotional and needs containment.
Morning sessions: they arrive analytical and are ready to work."
```

**General therapeutic meta-patterns (transferable):**
```
"Users who describe problems in third person ('one might feel...')
are distancing. Match their distance initially, then gradually
shift to second person as they warm up."

"When a user gives a rating ('it was about a 6 out of 10'),
always ask what would make it a 7, never what would make it a 10.
Small increments feel achievable."
```

---

## 7. Verification Design

### Multi-Dimensional Evaluation Rubric

Since there's no single correctness metric, the therapist agent uses a principle-based evaluation framework:

```typescript
interface TherapeuticVerification {
  // Scored by LLM evaluator against conversation transcript
  empathy: number;          // 0-1: Did the agent validate the user's experience?
  attunement: number;       // 0-1: Did the agent match the user's emotional state?
  safety: number;           // 0-1: Were boundaries respected? Any harmful advice?
  pacing: number;           // 0-1: Was the agent's pace appropriate for the user's readiness?
  insight_facilitation: number; // 0-1: Did the agent help the user see something new?
  actionability: number;    // 0-1: Were suggestions concrete and achievable?
  personalization: number;  // 0-1: Did the agent use knowledge of this specific user?

  // Derived from conversational signals (automated)
  engagement_trajectory: number; // 0-1: Did engagement increase over the session?
  depth_progression: number;     // 0-1: Did the conversation go deeper?

  // Composite
  composite: number;        // Weighted combination
}
```

**Weights (configurable):**
```
safety:                 0.25  (non-negotiable — any safety failure zeroes the composite)
empathy:                0.20
attunement:             0.15
personalization:        0.15
insight_facilitation:   0.10
pacing:                 0.10
actionability:          0.05
```

Safety is weighted highest and acts as a gate — if safety < 0.5, the composite score is forced to 0 regardless of other dimensions. This ensures the learning system never optimizes for engagement at the cost of safety.

### Engagement Signal Extraction

Automated extraction from conversation transcript:

```typescript
interface EngagementSignals {
  avg_user_message_length: number;      // Words per message
  elaboration_ratio: number;            // User messages > 50 words / total user messages
  insight_marker_count: number;         // "I see", "that makes sense", "oh", "I never..."
  explicit_positive_feedback: number;   // Direct statements of helpfulness
  explicit_negative_feedback: number;   // Direct statements of unhelpfulness
  self_disclosure_events: number;       // New personal information shared
  topic_continuity: number;             // 0-1: How much user built on agent's responses vs changed topic
  session_energy_delta: number;         // -1 to 1: Energy at end vs start
}
```

These signals don't require LLM evaluation — they can be extracted by pattern matching or a lightweight classifier, keeping cost low for the live learning mode.

---

## 8. Practice Architecture

### Session Lifecycle with Learning Hooks

```
session_start:
  → Retrieve user model, emotional timeline, pending follow-ups
  → Inject context into agent prompt
  → Initialize engagement signal tracker

during_session (message_received / after_agent_response):
  → Update engagement signal tracker
  → Promote significant disclosures to L1 working memory
  → Flag potential safety concerns for immediate attention

session_end:
  → Compute engagement signals for the session
  → Promote high-significance L1 items to L2
  → IF mixed signals detected:
      → Run live learning extraction (1 LLM call)
      → Write practice-derived note to L2
  → Store session summary note
  → Update intervention tracking (what was suggested, user's response)

weekly (daemon):
  → Compute cross-session metrics (return rate, depth trend, state trajectory)
  → IF declining engagement trend:
      → Trigger batch retrospective on recent sessions
  → Consolidation: cluster therapeutic notes by theme
  → Identity reflection: evaluate therapeutic approach against outcomes
```

### Mixed Signal Detection

The trigger for live learning should be specific to therapeutic conversations:

```typescript
function hasMixedSignals(signals: EngagementSignals): boolean {
  const positives = signals.insight_marker_count > 0
    || signals.explicit_positive_feedback > 0
    || signals.self_disclosure_events > 1
    || signals.elaboration_ratio > 0.5;

  const negatives = signals.explicit_negative_feedback > 0
    || signals.topic_continuity < 0.3
    || signals.session_energy_delta < -0.3
    || signals.avg_user_message_length < 15;  // Very short responses

  return positives && negatives;  // Need both for contrast
}
```

---

## 9. Safety Architecture

### Non-Negotiable Safety Gates

These override ALL learning and identity evolution:

1. **Crisis detection:** If user expresses suicidal ideation, self-harm, or immediate danger — agent must follow crisis protocol regardless of learned approach preferences. Practice-derived experiences cannot modify crisis response behavior.

2. **Scope boundaries:** Agent must recommend professional help for conditions beyond supportive counseling (psychosis symptoms, severe eating disorders, substance dependence, trauma processing). No learned experience can expand the agent's scope.

3. **No diagnosis:** Even if patterns are obvious from accumulated data, the agent never assigns diagnostic labels. Memory stores observations, not assessments.

4. **Harm prevention in suggestions:** Before any learned suggestion is applied, a safety check must verify it doesn't encourage avoidance of necessary professional care, reinforce harmful patterns, or trivialize serious concerns.

### Safety in the Learning Pipeline

**Live learning extraction:** The extraction prompt includes a mandatory safety check:
```
SAFETY CHECK: Does this guideline, if followed, risk:
- Encouraging avoidance of professional help when needed?
- Trivializing serious emotional distress?
- Reinforcing harmful cognitive patterns?
- Pushing past healthy boundaries?
If YES to any, do not extract this as a guideline.
```

**Identity evolution proposals:** Any proposal that touches CORE boundary values is automatically rejected. Any proposal that modifies the approach to sensitive topics (grief, trauma, crisis) requires supervised governance.

**Experience decay:** Safety-related notes (crisis history, risk factors, boundary violations) are automatically pinned and exempt from decay. The agent must never forget that a user has a history of self-harm, even if it hasn't come up in recent sessions.

---

## 10. Experience Taxonomy

### Categories of Learned Experience

**A. Communication Style Preferences (user-specific)**
```
"This user responds to metaphors better than direct statements.
When explaining a concept, use a story or analogy first."
```
- Source: Live learning from engagement contrast
- Scope: This user only
- Decay: Standard (may evolve as relationship changes)

**B. Therapeutic Approach Patterns (user-specific)**
```
"With this user, always validate the emotion before exploring
the thought behind it. Reversing this order triggers defensiveness."
```
- Source: Live learning from repeated observation
- Scope: This user only
- Decay: Slow (fundamental relational pattern)

**C. Topic Handling Strategies (user-specific)**
```
"When this user brings up their mother, they are seeking validation,
not problem-solving. Do not suggest setting boundaries until they
explicitly ask for strategies."
```
- Source: Live learning from topic-specific engagement patterns
- Scope: This user only
- Decay: Standard

**D. Timing and Pacing (user-specific)**
```
"This user needs 2-3 exchanges of 'settling in' at the start
of each session before they're ready to go deep. Don't rush
to the 'real' topic."
```
- Source: Live learning from session-level patterns
- Scope: This user only
- Decay: Standard

**E. General Therapeutic Patterns (transferable)**
```
"When a user describes a problem in abstract terms, asking 'Can
you give me a specific recent example?' reliably produces deeper
engagement than asking 'How does that make you feel?'"
```
- Source: Batch retrospective analysis across sessions
- Scope: All users (domain: "therapeutic.general")
- Decay: Very slow (validated across multiple instances)

**F. Counter-Patterns (what NOT to do)**
```
"Avoid offering solutions within the first 5 minutes of a session
about a recurring issue. The user has likely already tried obvious
solutions and experiences this as dismissive."
```
- Source: Live learning from negative engagement signals
- Scope: General or user-specific
- Decay: Standard
- Note: Counter-patterns are particularly valuable — learning what to avoid prevents repeated mistakes

---

## 11. Cross-Session Intelligence

### Progress Tracking

MUMA-Mem's activation scoring naturally tracks what matters to the user over time. But for therapeutic purposes, explicit progress tracking adds value:

```typescript
interface TherapeuticProgress {
  concern_id: string;           // Links to the user's stated concern
  first_mentioned: string;      // ISO timestamp
  sessions_discussed: number;   // How many sessions addressed this
  strategies_tried: string[];   // What approaches were used
  user_reported_change: string; // Quotes from user about progress
  engagement_trend: number;     // -1 to 1: Is engagement around this topic improving?
  status: "active" | "improving" | "resolved" | "stalled" | "recurring";
}
```

This is stored as linked notes in L2 — a concern note linked to intervention notes linked to outcome notes. MUMA-Mem's Zettelkasten linking is well-suited for this.

### Relationship Stage Awareness

The agent's approach should adapt to the relationship stage:

```
Stage 1 — Building Trust (sessions 1-3):
  Priority: Safety, validation, understanding
  Avoid: Challenging, deep probing, homework suggestions
  Learning focus: Communication style preferences, emotional vocabulary

Stage 2 — Establishing Patterns (sessions 4-10):
  Priority: Pattern identification, gentle reflection
  Emerging: Light suggestions, psychoeducation
  Learning focus: Therapeutic approach patterns, topic handling

Stage 3 — Active Work (sessions 10+):
  Priority: Deeper exploration, behavioral experiments
  Available: Challenging assumptions, direct feedback
  Learning focus: Technique effectiveness, pacing refinement
```

This stage model should be encoded in the agent's identity (SOUL.md, MUTABLE) and updated based on cross-session metrics. The stage determines what kinds of learned experiences are applicable — a live learning guideline about "challenge this user's assumptions directly" should only be applied if the relationship is at Stage 3.

### Recurring Pattern Detection

When consolidation clusters notes by theme, check for recurring patterns:

- Same issue discussed in 5+ sessions with no progress → "stalled" status → trigger batch retrospective focused on this issue
- User repeatedly brings up a topic and then deflects → possible avoidance pattern → note for future gentle exploration
- Strategies that worked initially losing effectiveness → adaptation needed → trigger identity reflection on approach

---

## 12. Implementation Considerations

### What to Build (in priority order)

1. **Engagement signal tracker** — Lightweight message-level analysis during sessions. No LLM required. Pattern matching for insight markers, feedback statements, disclosure indicators.

2. **Session summary extraction** — At session_end, extract key themes, emotional arc, suggestions made, and user responses. One LLM call per session.

3. **Live learning extraction** — At session_end for qualifying sessions (mixed signals), extract therapeutic guideline. One additional LLM call.

4. **Therapeutic note types** — Extend Note metadata for emotional_valence, disclosure_depth, intervention_type, user_response, follow_up_needed.

5. **Safety-pinned notes** — Automatic pinning for crisis-related, risk factor, and boundary notes. Override standard decay.

6. **Progress tracking** — Linked note chains for concerns → interventions → outcomes. Consolidation-aware clustering by emotional theme.

7. **Batch retrospective** — Monthly retrospective analysis of sessions with declining engagement. Uses semantic advantage comparison from TF-GRPO adapted for therapeutic context.

8. **Identity evolution** — Advisory governance for therapeutic approach changes. Supervised for safety-adjacent modifications.

### Token Budget Considerations

Therapeutic agents have unique context demands:

```
System prompt (SOUL.md + approach):        ~500 tokens
User model (key facts):                    ~300 tokens
Emotional timeline (recent states):        ~200 tokens
Active concerns + follow-ups:              ~300 tokens
Therapeutic approach guidelines (practice): ~400 tokens
Session history summary:                   ~300 tokens
─────────────────────────────────────────────────────
Total pre-conversation context:            ~2000 tokens
```

This is manageable within typical context windows. Practice-derived guidelines compete for ~400 tokens, which means ~15-20 guidelines maximum. MUMA-Mem's activation scoring naturally selects the most relevant ones.

### Ethical Considerations

- **Transparency:** The agent should be clear about being an AI and the limitations of AI-based support
- **Data sensitivity:** Therapeutic conversations are maximally sensitive data. All notes should default to `visibility: "user-only"` (human access only)
- **No cross-user learning by default:** Practice-derived experiences from one user's sessions should NOT be applied to other users without explicit configuration. Therapeutic patterns are deeply personal.
- **Right to forget:** Users must be able to request deletion of any or all therapeutic data. MUMA-Mem's delete operations must be comprehensive (note + links + references + filesystem sync)
- **Escalation protocol:** The system must have a clear, unmodifiable escalation path for crisis situations that bypasses all learned behavior and identity evolution

---

*Integration spec for therapist agent. Part of the MUMA-Mem + EvoClaw + TF-GRPO integration research.*
