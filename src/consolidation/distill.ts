import type { MemoryStore } from "../types/store.js";
import type { LLMProvider } from "../llm/provider.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// MEMORY.md Distillation
// ---------------------------------------------------------------------------

/**
 * Distill a MEMORY.md summary from a user's consolidated knowledge.
 *
 * Algorithm:
 * 1. Fetch up to 200 notes sorted by activation descending
 * 2. Categorize into Active Knowledge (>2.0), Background (0-2.0),
 *    and Consolidated Insights (tagged "consolidated")
 * 3. Send high-activation + consolidated notes to LLM for distillation
 * 4. Return generated markdown
 *
 * @param userId - The user whose memories to distill
 * @param store - Memory store for reading notes
 * @param llm - LLM provider for generating the summary
 * @returns Generated MEMORY.md content as markdown string
 */
export async function distillMemoryMd(
  userId: string,
  store: MemoryStore,
  llm: LLMProvider,
): Promise<string> {
  // 1. Fetch notes sorted by activation descending
  const notes = await store.listByUser(userId, { limit: 200 });

  if (notes.length === 0) {
    return `# Memory Summary\n\nNo memories recorded yet.\n`;
  }

  // Sort by activation descending
  notes.sort((a, b) => b.activation - a.activation);

  // 2. Categorize
  const highActivation: Array<{ content: string; context: string; keywords: string[] }> = [];
  const backgroundKnowledge: Array<{ content: string; context: string }> = [];
  const consolidated: Array<{ content: string; context: string }> = [];

  for (const note of notes) {
    if (note.tags.includes("consolidated")) {
      consolidated.push({ content: note.content, context: note.context });
    } else if (note.activation > 2.0) {
      highActivation.push({
        content: note.content,
        context: note.context,
        keywords: note.keywords,
      });
    } else if (note.activation >= 0) {
      backgroundKnowledge.push({ content: note.content, context: note.context });
    }
    // Notes with activation < 0 are decayed and omitted
  }

  // 3. Build prompt for LLM
  const sections: string[] = [];

  if (highActivation.length > 0) {
    sections.push("## Active Knowledge (frequently accessed)\n");
    for (const note of highActivation) {
      sections.push(`- ${note.content}`);
      if (note.keywords.length > 0) {
        sections.push(`  Keywords: ${note.keywords.join(", ")}`);
      }
    }
  }

  if (consolidated.length > 0) {
    sections.push("\n## Consolidated Insights\n");
    for (const note of consolidated) {
      sections.push(`- ${note.content}`);
    }
  }

  const notesContext = sections.join("\n");

  const prompt = `Given these memories about a user, produce a concise MEMORY.md that captures the most important knowledge about this user. Organize by topic. Use markdown headers and bullet points. Keep it under 200 lines. Focus on durable facts, preferences, and decisions — omit transient or session-specific details.

${notesContext}

Generate the MEMORY.md content now. Start with a top-level "# Memory Summary" header.`;

  const markdown = await llm.generate(prompt, {
    temperature: 0.3,
    maxTokens: 2048,
  });

  return markdown;
}

/**
 * Write MEMORY.md content to a user-specific directory on the filesystem.
 *
 * @param content - The markdown content to write
 * @param userId - The user's ID (used as directory name)
 * @param baseDir - Base directory (default: ~/clawd/memory/)
 * @returns The absolute file path of the written MEMORY.md
 */
export async function writeMemoryMdFile(
  content: string,
  userId: string,
  baseDir?: string,
): Promise<string> {
  const base = baseDir ?? path.join(os.homedir(), "clawd", "memory");
  const userDir = path.join(base, userId);

  // Create directory if it doesn't exist
  await fs.mkdir(userDir, { recursive: true });

  const filePath = path.join(userDir, "MEMORY.md");
  await fs.writeFile(filePath, content, "utf-8");

  return filePath;
}
