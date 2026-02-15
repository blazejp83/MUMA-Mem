import type { NoteCreate, MemorySource } from "../types/note.js";
import type { EmbeddingProvider } from "../embedding/types.js";
import type { ExtractedFacts } from "./extract.js";
import { applyDomainRule } from "../access/index.js";
import { getConfig } from "../plugin.js";

export interface ConstructOptions {
  userId: string;
  agentId: string;
  source?: MemorySource;     // Default "experience"
}

/**
 * PIPE-02: Construct a NoteCreate object from extracted facts.
 *
 * Combines extracted facts into content, generates an embedding vector,
 * and maps all ExtractedFacts fields to the NoteCreate structure.
 */
export async function construct(
  facts: ExtractedFacts,
  embedding: EmbeddingProvider,
  options: ConstructOptions,
): Promise<NoteCreate> {
  // Combine facts into a single content string
  const content = facts.facts.length === 1
    ? facts.facts[0]
    : facts.facts.join(". ");

  // Generate embedding from the content
  const vector = await embedding.embed(content);

  const noteCreate: NoteCreate = {
    content,
    context: facts.context,
    keywords: facts.keywords,
    tags: facts.tags,
    embedding: vector,
    links: [],                              // Linking happens in a later pipeline step
    created_by: options.agentId,
    user_id: options.userId,
    domain: facts.domain,
    visibility: facts.visibility,
    importance: facts.importance,
    source: options.source ?? "experience",
    confidence: 0.8,                        // Default for LLM-extracted facts
  };

  // VIS-03: Domain rules override LLM-suggested visibility
  const config = getConfig();
  const ruleVisibility = applyDomainRule(
    facts.domain,
    config.visibility.domainRules,
    config.visibility.defaultVisibility,
  );
  // Domain rule takes precedence over LLM extraction
  noteCreate.visibility = ruleVisibility;

  return noteCreate;
}
