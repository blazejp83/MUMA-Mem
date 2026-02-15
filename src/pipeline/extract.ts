import type { Visibility } from "../types/note.js";
import type { LLMProvider } from "../llm/provider.js";

export interface ExtractedFacts {
  facts: string[];           // Individual factual statements extracted
  keywords: string[];        // 3-7 keywords ordered by salience
  tags: string[];            // 3-5 categorical labels
  context: string;           // One-sentence semantic summary
  visibility: Visibility;    // LLM-classified access scope
  importance: number;        // 0-1 importance score
  domain: string;            // Topical classification (e.g., "business/sales")
}

const EXTRACT_SYSTEM_PROMPT = `You are a memory extraction system. Given raw text input from an AI agent interaction, extract structured facts for long-term memory storage.

Respond with a JSON object containing these fields:

1. "facts" (string[]): Individual factual statements extracted from the input. Each fact should be a self-contained statement. Extract all distinct facts.

2. "keywords" (string[]): 3-7 keywords ordered by salience (most important first). These are the key concepts, entities, or topics.

3. "tags" (string[]): 3-5 categorical labels that classify the content. Use lowercase, broad categories (e.g., "preference", "project", "relationship", "technical", "personal").

4. "context" (string): A single sentence that semantically summarizes the entire input. This is used for embedding similarity.

5. "visibility" (string): Classify the access scope:
   - "open": General facts, preferences, common knowledge — safe for any agent to see
   - "scoped": Domain-specific work information — visible to agents in the same domain
   - "private": Sensitive personal information — restricted access

6. "importance" (number): Score from 0 to 1:
   - 0.3: Routine, everyday observations
   - 0.5: Notable information worth remembering
   - 0.7: Significant facts that affect decisions
   - 0.9: Critical information that must not be forgotten

7. "domain" (string): Hierarchical topical classification using "/" separator (e.g., "business/sales", "personal/health", "coding/typescript", "general").

Respond ONLY with valid JSON. No markdown fences, no explanation.`;

/**
 * PIPE-01: Extract structured facts from raw input via LLM.
 *
 * Takes raw text (message, observation, or tool output) and uses the LLM
 * to extract individual facts, keywords, tags, context summary, visibility
 * classification, importance score, and domain.
 */
export async function extract(
  input: string,
  llm: LLMProvider,
): Promise<ExtractedFacts> {
  const raw = await llm.generateJSON<Partial<ExtractedFacts>>(input, {
    systemPrompt: EXTRACT_SYSTEM_PROMPT,
    temperature: 0.3,
  });

  // Provide sensible defaults for missing or invalid fields
  return {
    facts: Array.isArray(raw.facts) && raw.facts.length > 0
      ? raw.facts
      : [input],
    keywords: Array.isArray(raw.keywords) ? raw.keywords.slice(0, 7) : [],
    tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 5) : [],
    context: typeof raw.context === "string" && raw.context.length > 0
      ? raw.context
      : input.slice(0, 200),
    visibility: isValidVisibility(raw.visibility) ? raw.visibility : "scoped",
    importance: typeof raw.importance === "number" && raw.importance >= 0 && raw.importance <= 1
      ? raw.importance
      : 0.5,
    domain: typeof raw.domain === "string" && raw.domain.length > 0
      ? raw.domain
      : "general",
  };
}

function isValidVisibility(v: unknown): v is Visibility {
  return v === "open" || v === "scoped" || v === "private" || v === "user-only";
}
