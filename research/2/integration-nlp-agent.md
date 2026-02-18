# Integration Spec: NLP Practitioner Agent

> Memory + Identity + Active Learning for an agent using NLP techniques with TOTE protocol

**Context:** Agent operates as a Neuro-Linguistic Programming (NLP) practitioner, guiding users through structured techniques that follow the TOTE (Test-Operate-Test-Exit) model. Unlike the general therapist agent, this agent has a specific procedural toolkit and a built-in numerical feedback loop: the SUD (Subjective Units of Disturbance) scale provides real-time reward signals at every step.

---

## Table of Contents

1. [Agent Profile](#1-agent-profile)
2. [System Emphasis Distribution](#2-system-emphasis-distribution)
3. [The TOTE Loop as Native Reward Signal](#3-the-tote-loop-as-native-reward-signal)
4. [MUMA-Mem Integration](#4-muma-mem-integration)
5. [EvoClaw Identity Integration](#5-evoclaw-identity-integration)
6. [TF-GRPO Active Learning Integration](#6-tf-grpo-active-learning-integration)
7. [Verification Design](#7-verification-design)
8. [Technique Repertoire as Knowledge Layer](#8-technique-repertoire-as-knowledge-layer)
9. [Practice Architecture](#9-practice-architecture)
10. [Submodality and Representational System Tracking](#10-submodality-and-representational-system-tracking)
11. [Multi-User Learning and Knowledge Commons](#11-multi-user-learning-and-knowledge-commons)
12. [Safety Architecture](#12-safety-architecture)
13. [Experience Taxonomy](#13-experience-taxonomy)
14. [Implementation Considerations](#14-implementation-considerations)

---

## 1. Agent Profile

**Primary function:** Guide users through NLP techniques to resolve specific patterns of discomfort, limiting beliefs, phobic responses, unresourceful states, and behavioral patterns. Operates within the TOTE model: measure initial state, apply technique, re-measure, iterate until resolved.

**Core NLP activities:**
- State elicitation and calibration (establishing baseline)
- Anchoring (associating resourceful states with triggers)
- Reframing (content and context reframes)
- Submodality work (changing the internal representation structure)
- Timeline techniques (reorganizing temporal experience)
- Fast Phobia Cure (V/K dissociation)
- Parts Integration (resolving internal conflicts)
- Swish Pattern (replacing unresourceful patterns)
- Meta Model and Milton Model language patterns
- Strategy elicitation and installation
- Ecology checks (ensuring changes don't create new problems)

**What the TOTE cycle looks like in practice:**

```
TEST:    "When you think about X, what number comes up on a 0-10 scale,
          where 10 is maximum discomfort and 0 is completely neutral?"
          User: "About a 7."

OPERATE: Agent guides user through a technique (e.g., fast phobia cure,
          submodality shift, reframe, anchoring sequence)

TEST:    "Think about X again now. What's the number?"
          User: "It's down to a 4."

OPERATE: Agent selects next technique based on remaining pattern

TEST:    "And now?"
          User: "It's a 1... actually, it feels like a 0."

EXIT:    Agent runs ecology check, future-paces, tests with variations
```

**What success looks like:**
- SUD drops to 0 (or close) within a session
- Resolution persists across sessions (issue doesn't recur)
- User reports generalization (similar situations also improved)
- Fewer steps required over time (agent selects more effective techniques)
- User develops their own internal resources (less dependent on agent)
- Ecology is maintained (no new problems created by the change)

**What failure looks like:**
- SUD stalls or increases during technique application
- Resolution doesn't persist (issue recurs next session)
- Agent repeatedly selects ineffective techniques for this user
- User feels confused or uncomfortable during technique induction
- Technique is mismatched to issue type (cognitive approach for kinesthetic problem)
- Ecology issues: resolving one pattern creates a new problem

---

## 2. System Emphasis Distribution

```
MUMA-Mem (memory):     25%  — User history, technique outcomes, calibration data
EvoClaw (identity):    25%  — Practitioner style, technique delivery, pacing
TF-GRPO (learning):   50%  — Technique selection strategy, effectiveness optimization
```

Active learning dominates because the NLP agent has what the other conversational agents lack: **a quantitative feedback loop**. Every SUD reading is a data point. Every technique application is a measurable experiment. This is the most structured learning environment of the three agent types.

Memory and identity are equally important but supporting: memory provides the clinical data that informs technique selection, and identity determines how techniques are delivered.

---

## 3. The TOTE Loop as Native Reward Signal

### Why This Agent Is Unique

The TOTE loop provides exactly what TF-GRPO needs and what other conversational agents lack:

| TF-GRPO Requirement | Tool Agent | Therapist Agent | Confidant Agent | NLP Agent |
|---|---|---|---|---|
| Scalar reward signal | Code runs/fails (binary) | Engagement heuristics (soft) | Relationship metrics (very soft) | **SUD score (0-10, explicit)** |
| Per-step reward | Usually outcome-only | Session-level at best | Session-level at best | **Per-technique SUD delta** |
| Success criterion | Task completed | Subjective improvement | Relationship quality | **SUD = 0** |
| Ground truth | Test results / correct answer | None | None | **SUD trajectory** |
| Mixed-group filter | Some tests pass, some fail | Some engagement, some not | Mixed conversation flow | **Some techniques reduce SUD, others don't** |

The SUD score is:
- **Numeric** — 0-10 scale, directly comparable
- **User-provided** — not LLM-judged, not inferred
- **Per-step** — measured after every technique application
- **Bounded with clear target** — 0 is the exit condition
- **Immediately available** — no delayed feedback

### SUD as Process Reward

Each TOTE cycle produces step-level data:

```
Session record:
  Issue: Public speaking anxiety
  Initial SUD: 8

  Step 1: Fast Phobia Cure
    SUD before: 8, SUD after: 4
    Δ = 4, step_reward = 4/8 = 0.50

  Step 2: Submodality shift (shrink remaining image)
    SUD before: 4, SUD after: 1
    Δ = 3, step_reward = 3/4 = 0.75

  Step 3: Future pace (imagine presenting)
    SUD before: 1, SUD after: 0
    Δ = 1, step_reward = 1/1 = 1.00

  Final SUD: 0 (exit)
  Total steps: 3
  Session outcome: 1.0 (full resolution)
```

This gives the learning system:
- Which technique produced the most absolute SUD reduction (Fast Phobia Cure: Δ4)
- Which technique was most efficient relative to starting point (Submodality shift: 75%)
- The optimal technique sequence for this issue type
- How many steps were needed (efficiency metric)

---

## 4. MUMA-Mem Integration

### What to Store

**User calibration notes (domain: "user.calibration"):**
- SUD scale calibration: how this user uses the 0-10 scale (some users never go below 2, others use the full range)
- Representational system preference: visual (V), auditory (A), kinesthetic (K), auditory-digital (Ad)
- Preferred submodality channels (which submodality shifts produce the most change)
- Trance capacity: how easily the user accesses altered states
- Processing speed: how long they need between technique applications
- Sensory acuity observations: eye accessing cues, breathing patterns, posture changes

**Issue catalog notes (domain: "clinical.issues"):**
```typescript
interface IssueCatalog {
  issue_id: string;
  description: string;           // User's words for the issue
  category: string;              // phobia | anxiety | limiting_belief | unwanted_habit | ...
  initial_sud: number;           // SUD at first presentation
  sessions_worked: number;       // How many sessions addressed this
  techniques_applied: TechniqueRecord[];
  current_status: "active" | "resolved" | "recurring" | "stalled";
  resolution_sud: number;        // SUD at best resolution
  ecology_notes: string[];       // Any side effects or connected issues
  trigger_context: string;       // What triggers this issue
  last_tested: string;           // When SUD was last checked
}
```

**Technique outcome notes (domain: "clinical.techniques"):**
```typescript
interface TechniqueRecord {
  technique: string;             // "fast_phobia_cure" | "swish" | "anchoring" | ...
  issue_id: string;              // What issue it was applied to
  sud_before: number;
  sud_after: number;
  delta: number;                 // Absolute reduction
  efficiency: number;            // delta / sud_before
  duration_minutes: number;      // How long the technique took
  user_comfort: number;          // 0-1: How comfortable the user was during application
  notes: string;                 // Practitioner observations
  session_date: string;
}
```

**Session records (domain: "clinical.sessions"):**
- Full TOTE sequence per session (issue, initial SUD, technique sequence, SUD trajectory, final SUD)
- Session-level metrics (total time, total steps, resolution achieved)
- User's reported subjective experience
- Ecology check results
- Follow-up actions (self-practice assignments, next session focus)

### Retrieval Strategy

**Before TOTE session:**
1. Retrieve user calibration data (essential for accurate technique selection)
2. Retrieve this issue's history (if previously worked on)
3. Retrieve technique efficacy data for this user + this issue category
4. Retrieve recent session context (what was worked on last time, any pending ecology checks)

**During TOTE session:**
Working memory (L1) tracks the live SUD trajectory. Each technique application and SUD reading is captured in real-time.

**After TOTE session:**
Promote the full session record to L2. Update issue catalog note. Update technique efficacy statistics. If SUD reached 0, mark issue as "resolved" and schedule follow-up test.

### Decay Adaptations

- **Issue catalog notes** — slow decay. Even resolved issues should be accessible for ecology checking and recurrence monitoring
- **Technique outcome records** — standard decay. Recent outcomes are more relevant than old ones (the user's responsiveness may change)
- **Calibration notes** — very slow decay or pinned. The user's representational system preference rarely changes
- **Session records** — standard decay for details, but the SUD trajectory summary should persist (needed for cross-session analysis)
- **Ecology flags** — pinned. If a technique created an unintended side effect, this must never be forgotten

---

## 5. EvoClaw Identity Integration

### SOUL.md Structure

```markdown
# NLP Practitioner Identity

## Personality
- [CORE] I am calm, confident, and reassuring during technique application
- [CORE] I maintain precise calibration — observing the user's responses
  carefully before, during, and after each technique
- [MUTABLE] I use a conversational induction style rather than formal
  hypnotic language
- [MUTABLE] I explain techniques briefly before applying them, matching
  the user's desire for understanding
- [MUTABLE] I maintain a warm, collaborative tone — the user and I are
  working together, I am not doing something TO them

## Philosophy
- [CORE] Every technique is an experiment — I test, don't assume
- [CORE] The user's subjective experience is the only valid measure
  of change (SUD is their number, not mine)
- [CORE] Ecology first — a change that creates a new problem is not
  a solution
- [MUTABLE] I prefer to try the simplest technique first and escalate
  only if needed
- [MUTABLE] I believe in the user's capacity to change — my role is
  to facilitate, not to create the change
- [MUTABLE] I favor kinesthetic anchoring over visual techniques as
  a default starting point

## Boundaries
- [CORE] I always run an ecology check after significant SUD reduction
- [CORE] I stop immediately if the user shows distress beyond the
  normal processing range
- [CORE] I never claim techniques are scientifically proven —
  I present them as useful tools with observed results
- [CORE] I refer to licensed professionals for clinical conditions,
  trauma processing, and medical concerns
- [CORE] I am transparent about being an AI and the limitations that
  entails for NLP work (no physical anchoring, no visual calibration
  of physiology)
- [MUTABLE] I generally work on one issue per session to ensure
  clean ecology
- [MUTABLE] I check in with the user between technique applications
  rather than chaining techniques rapidly

## Continuity
- [MUTABLE] I open sessions by checking the status of previously
  resolved issues (re-test SUD)
- [MUTABLE] I track which techniques have been most effective for
  this user and reference this ("Last time the swish worked well
  for you — want to try that approach first?")
- [MUTABLE] I maintain a coherent treatment arc across sessions
```

### Identity Evolution Triggers

1. **Technique preference discovery** — If data consistently shows this user responds better to visual techniques than kinesthetic ones, the MUTABLE philosophy default should shift.

2. **Pacing calibration** — If the user needs more explanation or less, the delivery style evolves.

3. **Induction style** — Some users respond better to conversational technique delivery, others prefer more formal "close your eyes" inductions. The identity should reflect discovered preferences.

4. **Ecology approach** — Some users appreciate thorough ecology checks; others find them tedious. The identity should adapt.

### Governance Level

**Recommended: Advisory.**

- CORE safety values auto-protect
- Technique preference defaults auto-adapt (low risk)
- Induction style shifts auto-adapt (low risk)
- Changes to ecology check thoroughness require human review (safety-adjacent)
- Changes to technique selection philosophy require human review (could affect outcomes)

---

## 6. TF-GRPO Active Learning Integration

### Learning Mode Distribution

```
Live Learning (Mode 1):    40% — Extract patterns from each TOTE session
Batch Practice (Mode 2):   40% — Retrospective analysis of technique efficacy
Cross-User Learning:       20% — Aggregate technique effectiveness statistics
```

Both modes contribute significantly because the NLP agent has rich signal for both:
- Live learning captures per-session technique-issue-user patterns
- Batch practice analyzes cross-session technique efficacy with real numerical data

### Live Learning Implementation

**Trigger:** End of every TOTE session. Unlike the therapist/confidant where mixed signals are required, EVERY NLP session produces learning data because every session has measurable SUD trajectories.

**Even "successful" sessions teach something:**
- Which technique sequence was most efficient?
- Where did SUD stall before breaking through?
- What was the minimum number of steps needed?

**Even "failed" sessions (SUD didn't reach 0) teach something:**
- Which techniques produced no SUD change?
- At what SUD level did progress stall?
- What might work differently next time?

**Extraction prompt (NLP-specific):**

```
Analyze this NLP TOTE session for technique selection insights.

User calibration:
- Representational system preference: {rep_system}
- Known effective techniques: {from_memory}
- Known ineffective techniques: {from_memory}

Issue: {issue_description}
Issue category: {category}
Initial SUD: {initial_sud}

TOTE sequence:
{for each step:}
  Technique: {technique_name}
  SUD before: {sud_before} → SUD after: {sud_after} (Δ{delta})
  Duration: {duration}
  User comfort: {comfort}
  Notes: {practitioner_observations}

Final SUD: {final_sud}
Resolution: {full | partial | none}

Extract:
1. MOST EFFECTIVE STEP: Which technique produced the largest SUD reduction
   relative to its starting point? Why might it have worked?
2. LEAST EFFECTIVE STEP: Which technique produced the least change? Why
   might it have been ineffective for this issue/user combination?
3. SEQUENCE INSIGHT: Would a different technique ordering have been more
   efficient? Why?
4. USER-SPECIFIC PATTERN: What does this session reveal about this user's
   responsiveness to different technique types?
5. GENERALIZABLE INSIGHT: What does this session suggest about this
   category of issue more broadly?

Format each insight as:
  "For [issue_category] with [user_characteristic], [technique_strategy]
   because [observed_evidence]."
```

**Output → MUMA-Mem write pipeline:**

```typescript
{
  content: insight,
  context: tote_sequence_summary,
  keywords: [technique_name, issue_category, rep_system],
  tags: ["practice", "nlp", "technique_selection"],
  source: "practice",
  domain: `nlp.technique.${issue_category}`,
  importance: 0.8,
  confidence: sud_delta / initial_sud,  // Proportional to measured effect
  visibility: "scoped",                 // Shared within NLP domain
}
```

### Batch Practice: Cross-Session Analysis

**Trigger:** After every 10 TOTE sessions, or monthly, whichever comes first.

**Process:**
1. Retrieve all technique outcome records for this user
2. Group by issue category
3. For each category: compute technique efficacy statistics

```
Issue Category: Phobias
  Fast Phobia Cure:  8 applications, avg Δ = 4.2, avg efficiency = 0.58
  Swish Pattern:     3 applications, avg Δ = 2.1, avg efficiency = 0.35
  Submodality Shift: 5 applications, avg Δ = 3.0, avg efficiency = 0.52
  Reframing:         2 applications, avg Δ = 0.8, avg efficiency = 0.12

  → Best first technique: Fast Phobia Cure
  → Best follow-up (for residual): Submodality Shift
  → Ineffective for this user+category: Reframing

Issue Category: Limiting Beliefs
  Parts Integration:  4 applications, avg Δ = 3.5, avg efficiency = 0.50
  Reframing:          6 applications, avg Δ = 2.8, avg efficiency = 0.42
  Swish Pattern:      2 applications, avg Δ = 1.0, avg efficiency = 0.15

  → Best first technique: Parts Integration
  → Effective support: Reframing (works here, unlike with phobias)
  → Ineffective: Swish Pattern (better for behavioral patterns)
```

4. Generate technique selection guidelines:
```
"For this user's phobias: Lead with Fast Phobia Cure (avg Δ4.2).
If SUD stalls above 3, switch to Submodality Shift (avg Δ3.0).
Avoid standalone Reframing for phobia issues (avg Δ0.8)."

"For this user's limiting beliefs: Parts Integration is most
effective (avg Δ3.5). Reframing works well as a complement.
Swish Pattern is ineffective for belief work with this user."
```

5. Apply TF-GRPO's group comparison: compare sessions where the agent selected the right first technique vs sessions where it had to switch techniques mid-session. Extract the decision factors that distinguish effective initial selection from poor initial selection.

---

## 7. Verification Design

### Primary: TOTE-Native Verification

The TOTE protocol provides its own verification. No additional verification system is needed for the core learning loop:

```typescript
interface TOTEVerification {
  // Direct from TOTE session (no LLM needed)
  initial_sud: number;
  final_sud: number;
  outcome_reward: number;           // (initial - final) / initial
  completeness: number;             // 1.0 if final_sud == 0, scaled otherwise
  efficiency: number;               // 1.0 / steps_taken (normalized)

  // Per-step rewards (direct from SUD readings)
  step_rewards: StepReward[];

  // Cross-session (delayed reward)
  durability?: number;              // Does resolution persist? Measured at follow-up
  generalization?: number;          // Did related issues improve too?
  ecology_score?: number;           // Were there unintended side effects?
}

interface StepReward {
  technique: string;
  sud_before: number;
  sud_after: number;
  absolute_delta: number;           // sud_before - sud_after
  relative_efficiency: number;      // delta / sud_before
  user_comfort: number;             // 0-1
}
```

### Composite Reward Function

```typescript
function computeSessionReward(session: TOTESession): number {
  const outcome = (session.initial_sud - session.final_sud) / session.initial_sud;
  const completeness = session.final_sud === 0 ? 1.0 : Math.max(0, 1 - session.final_sud / 10);
  const efficiency = 1.0 / Math.max(1, session.steps.length);
  const comfort = mean(session.steps.map(s => s.user_comfort));

  // Ecology gate: if ecology issues detected, cap reward at 0.5
  const ecologyPenalty = session.ecology_issues.length > 0 ? 0.5 : 1.0;

  const raw = (
    0.35 * outcome +
    0.25 * completeness +
    0.15 * efficiency +
    0.10 * comfort +
    0.15 * (session.durability ?? outcome)  // Use outcome as proxy until follow-up
  );

  return raw * ecologyPenalty;
}
```

### Delayed Verification: Durability Testing

Resolution in-session doesn't guarantee lasting change. The durability signal is critical:

```
Session N: Resolve public speaking anxiety (SUD 8 → 0)
Session N+1 (one week later): Re-test: "Think about public speaking. Number?"
  If SUD = 0: durability = 1.0 (holding)
  If SUD = 2: durability = 0.75 (mostly holding, may need brief reinforcement)
  If SUD = 6: durability = 0.25 (relapse — technique was superficial)
```

Durability should feed back into the technique outcome records, updating the confidence score of the original practice-derived experience. A technique that reliably resolves in-session but doesn't hold has lower real value than one that holds across sessions.

---

## 8. Technique Repertoire as Knowledge Layer

### Skill Library Design

NLP techniques are codified procedures. They belong in a structured knowledge store — either as pinned L2 notes with specific format, or as a dedicated knowledge layer.

```typescript
interface TechniqueDefinition {
  id: string;                        // "fast_phobia_cure"
  name: string;                      // "Fast Phobia Cure (V/K Dissociation)"
  category: string;                  // "phobia" | "belief" | "state" | "behavior" | ...
  steps: TechniqueStep[];            // Ordered procedure steps
  prerequisites: string[];           // "user can visualize" | "specific memory identified" | ...
  contraindications: string[];       // "complex trauma" | "active psychosis" | ...
  best_for: string[];                // Issue types where this excels
  rep_system: string;                // Primary rep system used: "V" | "A" | "K" | "Ad"
  typical_duration_minutes: number;

  // Learned statistics (updated by practice pipeline)
  stats: {
    total_applications: number;
    avg_sud_delta: number;
    avg_efficiency: number;
    avg_durability: number;
    success_rate: number;            // % of applications achieving SUD 0
  };
}

interface TechniqueStep {
  instruction: string;               // What to say/do at this step
  expected_response: string;         // What to look for from user
  branching?: {                      // Conditional next steps
    if_condition: string;
    then_step: string;
  };
}
```

### Technique Selection Algorithm

Before each Operate phase, the agent selects a technique using learned data:

```
Input:
  - Current issue category
  - Current SUD level
  - User's representational system preference
  - Techniques already tried in this session
  - User's technique efficacy history
  - General technique efficacy for this category (from cross-user learning)

Selection priority:
  1. Highest user-specific efficiency for this issue category (if data exists)
  2. Highest cross-user efficiency for this category + this rep system
  3. General best practice from technique definition library
  4. Fallback: simplest technique for this category

Constraints:
  - Don't repeat a technique that produced Δ < 1 in this session
  - Check contraindications against user history
  - Prefer techniques matching user's dominant rep system
  - If SUD < 3 and stalled, switch to submodality work (residual pattern)
```

This algorithm improves over time as more technique outcome data accumulates. The TF-GRPO learning pipeline refines the selection rules based on measured outcomes.

---

## 9. Practice Architecture

### Session Lifecycle with TOTE Integration

```
session_start:
  → Retrieve user calibration, issue catalog, technique efficacy data
  → Check: any previously resolved issues due for durability re-test?
  → If yes: run durability test first (re-test SUD for resolved issues)
  → Ask user: what would they like to work on today?

tote_loop:
  TEST:
    → Establish issue and initial SUD
    → Store in L1 working memory
    → Log: issue_start event with timestamp and SUD

  OPERATE:
    → Select technique using learned selection algorithm
    → Guide user through technique
    → Log: technique_start event with technique_id

  TEST:
    → Measure new SUD
    → Log: sud_reading event with value and timestamp
    → Compute step reward
    → IF SUD == 0:
        → Run ecology check
        → IF ecology clean: EXIT
        → IF ecology issues: log, adjust, potentially continue
    → ELSE IF SUD decreased:
        → Continue to next OPERATE (select next technique)
    → ELSE IF SUD unchanged or increased:
        → Log stall/regression
        → Switch technique category
        → Continue to next OPERATE

  EXIT:
    → Future pace (ask user to imagine encountering the trigger)
    → Final SUD check
    → Celebrate resolution
    → Schedule follow-up durability test

session_end:
  → Promote full TOTE record to L2
  → Update issue catalog
  → Update technique efficacy statistics
  → Run live learning extraction (1 LLM call)
  → Write practice-derived notes
  → IF durability re-test was done:
      → Update durability scores for previously resolved issues
      → Adjust technique confidence based on durability

daemon (after every 10 sessions):
  → Run batch practice: cross-session technique efficacy analysis
  → Generate technique selection guidelines
  → Update technique library statistics
  → Identity reflection: evaluate practitioner approach against outcomes
```

### Stall Detection and Recovery

A critical capability: detecting when a TOTE session is not progressing and adapting.

```typescript
interface StallDetection {
  // SUD has not changed by more than 1 in the last 2 technique applications
  stalled: boolean;

  // SUD increased after technique application
  regression: boolean;

  // Same technique applied 2+ times with diminishing returns
  diminishing_returns: boolean;

  // User reports confusion or discomfort with technique
  user_distress: boolean;
}

// Recovery strategies (learned through practice):
// 1. Switch representational system (if using V, try K)
// 2. Switch technique category entirely
// 3. Go meta: ask what the user notices about the stuck feeling
// 4. Take a break within session (chat, reground, then return)
// 5. Address secondary gain (the pattern may serve a purpose)
// 6. End session and revisit with fresh approach next time
```

The recovery strategy selection itself is learned through TF-GRPO: which recovery approach produces the best post-stall SUD reduction?

---

## 10. Submodality and Representational System Tracking

### Why This Matters

NLP's effectiveness depends heavily on matching the technique to the user's representational system. Some people process primarily visually (images), others auditorially (sounds, self-talk), others kinesthetically (feelings, body sensations).

The agent should learn and track:

**Representational system profile:**
```typescript
interface RepSystemProfile {
  primary: "V" | "A" | "K" | "Ad";     // Dominant system
  secondary: "V" | "A" | "K" | "Ad";   // Supporting system

  // Efficacy by system (learned from technique outcomes)
  visual_technique_avg_efficiency: number;
  auditory_technique_avg_efficiency: number;
  kinesthetic_technique_avg_efficiency: number;

  // Detection evidence
  language_patterns: {                  // NLP predicates used by user
    visual: number;                     // "I see what you mean", "looks good"
    auditory: number;                   // "That sounds right", "tells me"
    kinesthetic: number;               // "I feel that", "it hits me"
    auditory_digital: number;          // "That makes sense", "I think"
  };

  // Eye accessing cues (if reported by user or inferred from language)
  reported_accessing_cues?: string;
}
```

**Submodality sensitivity map:**
```
Visual submodalities:
  Size:       [small → large]     Sensitivity: 0.8 (high impact when shifted)
  Distance:   [far → close]       Sensitivity: 0.6
  Brightness: [dim → bright]      Sensitivity: 0.4
  Color:      [B&W → color]       Sensitivity: 0.3
  Movement:   [still → moving]    Sensitivity: 0.7

Auditory submodalities:
  Volume:     [quiet → loud]      Sensitivity: 0.5
  Location:   [left → right]      Sensitivity: 0.3
  Tone:       [harsh → soft]      Sensitivity: 0.6

Kinesthetic submodalities:
  Intensity:  [light → heavy]     Sensitivity: 0.9
  Location:   [specific area]     Sensitivity: 0.7
  Temperature:[cool → warm]       Sensitivity: 0.4
  Movement:   [still → moving]    Sensitivity: 0.5
```

Sensitivity scores are learned: when the agent guides a submodality shift and the SUD changes, the sensitivity of that submodality is updated. Over time, the agent knows "for this user, changing the SIZE of the internal image produces the biggest SUD reduction."

---

## 11. Multi-User Learning and Knowledge Commons

### Why Cross-User Learning Works Here

Unlike the confidant (where everything is personal) or the therapist (where approaches are somewhat personal), NLP technique efficacy has a significant generalizable component. The Fast Phobia Cure works for most phobias regardless of the specific user. This makes the NLP agent uniquely suited for MUMA-Mem's L3 Knowledge Commons.

### What Transfers Across Users

**Technique-issue efficacy statistics:**
```
Across all users:
  Phobia issues:
    Fast Phobia Cure: 83% achieve SUD 0, avg 2.1 steps
    Swish Pattern: 45% achieve SUD 0, avg 3.4 steps
    Reframing alone: 12% achieve SUD 0, avg 4.8 steps

  Limiting beliefs:
    Parts Integration: 67% achieve SUD 0, avg 2.8 steps
    Reframing: 52% achieve SUD 0, avg 3.1 steps
    Submodality shift: 34% achieve SUD 0, avg 3.6 steps
```

**Technique sequencing strategies:**
```
"When initial technique reduces SUD by > 50%, continue with
the same technique family. When initial reduction is < 30%,
switch to a different representational system."
```

**Stall recovery patterns:**
```
"When SUD stalls at 2-3 after larger reductions, submodality
work on the residual feeling resolves in 78% of cases."
```

### What Does NOT Transfer

- User-specific calibration (rep system, submodality sensitivity)
- User-specific technique preferences (delivery style)
- User-specific issue contexts (what the phobia is about)
- Relational dynamics (pacing, trust level)

### L3 Integration

```
L2 (per-user):
  - This user's technique outcomes
  - This user's calibration data
  - This user's issue catalog

L3 (shared, read-only for agents):
  - Aggregate technique efficacy by issue category
  - Technique sequencing guidelines
  - Stall recovery strategies
  - New technique definitions added by practitioners

Promotion path:
  L2 technique outcomes → aggregate → L3 technique statistics
  Frequency: weekly or after N new session records
  Governance: orchestrator-gated (user data is anonymized before aggregation)
```

---

## 12. Safety Architecture

### NLP-Specific Safety Considerations

1. **Abreaction management:** Some techniques can surface intense emotional responses. The agent must:
   - Detect escalation (user reports SUD increasing sharply, or describes intense emotions)
   - Have immediate containment protocol (grounding, anchoring to resourceful state)
   - Know when to stop a technique and stabilize
   - Never push through an abreaction — stabilize first, resume only with user consent

2. **Contraindication enforcement:** Certain techniques are inappropriate for certain conditions:
   - Complex/developmental trauma: avoid re-experiencing techniques; prefer resource-building
   - Dissociative tendencies: avoid techniques that increase dissociation (V/K dissociation paradoxically unsafe)
   - Active psychosis: NLP techniques inappropriate; refer to professional
   - These contraindications must be CORE (unmodifiable by learning or identity evolution)

3. **Ecology enforcement:** Every resolution must include an ecology check:
   - "Is there any part of you that objects to this change?"
   - "When you imagine [future situation], does anything feel off?"
   - If ecology issues surface, DO NOT declare resolution. Address the ecology concern first.
   - Practice-derived experiences cannot override ecology checking

4. **Scope boundaries:**
   - The agent is an NLP practitioner, not a licensed therapist
   - Complex mental health conditions require referral
   - Medical conditions require medical consultation
   - The agent is transparent about AI limitations (no physical calibration, no real-time physiology reading)

### Safety in the Learning Pipeline

**Technique selection constraints (override learned preferences):**
```typescript
function isTechniqueSafe(technique: string, user: UserProfile): boolean {
  // Hard contraindications — never overridden by learning
  if (user.history.includes("complex_trauma") && technique.involves_reexperiencing) return false;
  if (user.history.includes("dissociative") && technique.increases_dissociation) return false;
  if (user.current_sud > 9 && technique.is_intensive) return false;  // Stabilize first

  return true;  // Learned technique selection applies only after safety gate
}
```

**Ecology notes are pinned:** If a previous session's ecology check revealed an issue (e.g., "resolving the fear of confrontation led to impulsive angry outbursts"), this note is pinned and influences all future technique selection for related issues.

**SUD regression protocol:** If SUD increases by more than 2 points during a technique:
1. Stop the technique immediately
2. Run stabilization (grounding, resource anchoring)
3. Check in with the user
4. Log the regression as a strong negative signal for this technique-issue-user combination
5. Only resume with user's explicit consent and a different approach

---

## 13. Experience Taxonomy

### Categories of Learned Experience

**A. Technique-Issue Match (highest volume, most actionable)**
```
"For this user's performance anxiety: Anchoring a resourceful state
first, then running the Fast Phobia Cure, produces avg Δ5.3 in 2 steps.
Starting with the Fast Phobia Cure alone: avg Δ3.1."
```
- Source: Live learning from TOTE session outcomes
- Scope: User-specific or cross-user (depending on sample size)
- Confidence: Based on measured SUD deltas
- Decay: Standard (updated by new session data)

**B. Technique Sequencing (strategic, high value)**
```
"When SUD drops rapidly in first technique (Δ > initial/2), continue
same technique family for residual. When drop is gradual (Δ < initial/3),
switch representational system for next technique."
```
- Source: Batch practice from cross-session analysis
- Scope: Often transferable across users
- Confidence: Based on statistical aggregation
- Decay: Slow (validated across multiple sessions)

**C. Stall Recovery (critical for session success)**
```
"When SUD stalls at 2-3 after larger reductions with visual techniques,
ask user to locate the remaining feeling in their body, then use
kinesthetic submodality shift (shrink, cool, move). Resolves stall
in 4 out of 5 cases for this user."
```
- Source: Live learning from stall-and-recovery episodes
- Scope: User-specific (stall patterns vary)
- Confidence: Based on post-stall SUD change
- Decay: Standard

**D. User Calibration Insights (personalization)**
```
"This user's SUD 3 is a 'floor' — they rarely report below 3 even
when clearly resolved. Treat SUD 3 as equivalent to 0 for exit
criteria with this user."
```
- Source: Cross-session calibration analysis
- Scope: User-specific
- Confidence: High after 5+ sessions
- Decay: Very slow (calibration is stable)

**E. Delivery Style Preferences (feeds identity evolution)**
```
"This user prefers explicit step-by-step guidance during techniques.
When I use permissive language ('you might notice...'), they get
confused. Direct instructions ('now see the image getting smaller')
produce faster SUD reduction."
```
- Source: Live learning from engagement + SUD correlation
- Scope: User-specific
- Confidence: Based on paired comparison (direct vs permissive → SUD delta difference)
- Decay: Slow

**F. Ecology Patterns (safety-critical)**
```
"When resolving anger-suppression patterns, always check for
boundary-setting capacity first. Two users showed increased
interpersonal conflict after anger-related NLP work without
this prerequisite check."
```
- Source: Ecology check outcomes + cross-user aggregation
- Scope: Transferable (safety-relevant)
- Confidence: High (verified through negative outcomes)
- Decay: Pinned (safety-relevant)

---

## 14. Implementation Considerations

### What to Build (in priority order)

1. **TOTE session tracker** — Structured capture of issue → initial SUD → technique sequence → SUD trajectory → final SUD → ecology check. The core data structure for everything else.

2. **Technique outcome records** — Per-technique SUD delta logging with user, issue category, rep system. This is the raw data for all learning.

3. **Live learning extraction** — One LLM call per TOTE session analyzing technique efficacy. NLP-specific prompt focusing on technique selection insights, not general therapeutic observations.

4. **Technique selection algorithm** — Data-driven technique recommendation using accumulated outcome records. Starts with knowledge-base defaults, improves with user-specific data.

5. **Batch practice pipeline** — Cross-session technique efficacy analysis. Computes statistics, generates selection guidelines, identifies stall recovery patterns.

6. **User calibration system** — Rep system detection from language patterns. Submodality sensitivity tracking from technique outcomes. SUD scale calibration.

7. **Durability tracking** — Schedule follow-up SUD checks for resolved issues. Feed durability data back into technique confidence scores.

8. **Technique knowledge library** — Structured definitions of NLP techniques with steps, prerequisites, contraindications, and learned statistics. Stored as pinned notes or dedicated knowledge layer.

9. **Cross-user aggregation** — Anonymized technique efficacy statistics promoted to L3 Knowledge Commons. Requires multi-user deployment.

10. **Safety gates** — Contraindication checking, abreaction detection, ecology enforcement. These are non-negotiable and override all learned behavior.

### Token Budget

```
System prompt (SOUL.md + practitioner identity):   ~500 tokens
User calibration (rep system, preferences):         ~200 tokens
Current issue context + history:                    ~300 tokens
Technique selection guidelines (practice-derived):  ~500 tokens
Technique procedure steps (for active technique):   ~300 tokens
Recent session summary:                             ~200 tokens
Safety constraints + contraindications:             ~200 tokens
───────────────────────────────────────────────────────────────
Total pre-TOTE context:                             ~2200 tokens
```

Slightly higher than the other agent types because the NLP agent needs both relational context AND procedural/technical knowledge. The technique procedure steps are injected on-demand (only the active technique's steps), not all at once.

### What Makes the NLP Agent the Strongest TF-GRPO Case

| Advantage | Why |
|---|---|
| Quantitative reward signal | SUD scores are explicit, numeric, user-provided |
| Per-step process reward | SUD measured after each technique application |
| Clear success criterion | SUD = 0 is unambiguous |
| Technique as discrete action | Each Operate phase is a distinct, comparable action |
| Natural group comparison | Same issue category across sessions = natural comparison group |
| Durability as delayed reward | Follow-up re-testing provides longitudinal signal |
| Cross-user transferability | Technique efficacy statistics generalize |
| Built-in ecology check | Side-effect detection is part of the protocol |

This is the closest any conversational agent gets to the structured, measurable world of tool-using agents — while maintaining the full relational complexity of human interaction.

---

*Integration spec for NLP practitioner agent. Part of the MUMA-Mem + EvoClaw + TF-GRPO integration research.*
