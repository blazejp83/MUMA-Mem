import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Note, NoteUpdate } from "../types/note.js";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/**
 * Returns the file path for a note: `${baseDir}/${userId}/${noteId}.md`
 */
export function getNotePath(baseDir: string, userId: string, noteId: string): string {
  return path.join(baseDir, userId, `${noteId}.md`);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a Note to human-readable markdown with YAML frontmatter.
 *
 * Format:
 * ```
 * ---
 * id: "abc-123"
 * domain: "business/sales"
 * ...
 * ---
 *
 * Content body here.
 *
 * <!-- context: One-sentence semantic summary -->
 * ```
 *
 * Excludes: embedding (binary), access_log (too verbose), user_id (derived from path).
 */
export function serializeNoteToMarkdown(note: Note): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`id: "${note.id}"`);
  lines.push(`user_id: "${note.user_id}"`);
  lines.push(`domain: "${note.domain}"`);
  lines.push(`visibility: "${note.visibility}"`);
  lines.push(`created_by: "${note.created_by}"`);
  lines.push(`created_at: "${note.created_at}"`);
  lines.push(`updated_at: "${note.updated_at}"`);
  lines.push(`tags: ${serializeStringArray(note.tags)}`);
  lines.push(`keywords: ${serializeStringArray(note.keywords)}`);
  lines.push(`importance: ${note.importance}`);
  lines.push(`confidence: ${note.confidence}`);
  lines.push(`source: "${note.source}"`);
  lines.push(`pinned: ${note.pinned}`);
  lines.push(`links: ${serializeStringArray(note.links)}`);
  lines.push(`activation: ${note.activation}`);
  lines.push(`half_life: ${note.half_life}`);
  lines.push(`access_count: ${note.access_count}`);
  lines.push(`version: ${note.version}`);
  lines.push("---");
  lines.push("");
  lines.push(note.content);

  if (note.context) {
    lines.push("");
    lines.push(`<!-- context: ${note.context} -->`);
  }

  lines.push("");

  return lines.join("\n");
}

function serializeStringArray(arr: string[]): string {
  if (arr.length === 0) return "[]";
  return "[" + arr.map((s) => `"${s}"`).join(", ") + "]";
}

// ---------------------------------------------------------------------------
// Deserialization
// ---------------------------------------------------------------------------

/**
 * Deserialize a markdown file back to a note update payload.
 *
 * Returns null if parsing fails (malformed file, missing id).
 */
export function deserializeMarkdownToNoteUpdate(
  markdown: string,
): { id: string; userId: string; updates: NoteUpdate & { content?: string } } | null {
  try {
    // Split on "---" markers
    const parts = markdown.split("---");
    if (parts.length < 3) return null;

    // parts[0] is before first "---" (empty or whitespace)
    // parts[1] is the YAML frontmatter
    // parts[2..] is the body (rejoin in case body contains "---")
    const yamlBlock = parts[1];
    const bodyBlock = parts.slice(2).join("---").trim();

    // Parse YAML frontmatter
    const frontmatter = parseSimpleYaml(yamlBlock);

    const id = frontmatter.id as string | undefined;
    if (!id) return null;

    const userId = (frontmatter.user_id as string) || "";

    // Extract content and context from body
    let content = bodyBlock;
    let context: string | undefined;

    // Extract HTML comment context
    const contextMatch = bodyBlock.match(/<!--\s*context:\s*(.*?)\s*-->/);
    if (contextMatch) {
      context = contextMatch[1];
      // Remove the context comment from content
      content = bodyBlock.replace(/\n?<!--\s*context:.*?-->/, "").trim();
    }

    const updates: NoteUpdate & { content?: string } = {};

    if (content) updates.content = content;
    if (context !== undefined) updates.context = context;
    if (frontmatter.domain !== undefined) updates.domain = String(frontmatter.domain);
    if (frontmatter.visibility !== undefined)
      updates.visibility = String(frontmatter.visibility) as NoteUpdate["visibility"];
    if (frontmatter.importance !== undefined) updates.importance = Number(frontmatter.importance);
    if (frontmatter.confidence !== undefined) updates.confidence = Number(frontmatter.confidence);
    if (frontmatter.pinned !== undefined) updates.pinned = Boolean(frontmatter.pinned);
    if (frontmatter.activation !== undefined) updates.activation = Number(frontmatter.activation);
    if (frontmatter.half_life !== undefined) updates.half_life = Number(frontmatter.half_life);
    if (frontmatter.access_count !== undefined) updates.access_count = Number(frontmatter.access_count);
    if (frontmatter.tags !== undefined) updates.tags = frontmatter.tags as string[];
    if (frontmatter.keywords !== undefined) updates.keywords = frontmatter.keywords as string[];
    if (frontmatter.links !== undefined) updates.links = frontmatter.links as string[];

    return { id, userId, updates };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Simple YAML parser (no external dependency)
// ---------------------------------------------------------------------------

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.substring(0, colonIndex).trim();
    const rawValue = line.substring(colonIndex + 1).trim();

    result[key] = parseYamlValue(rawValue);
  }

  return result;
}

function parseYamlValue(raw: string): unknown {
  if (!raw || raw === "~" || raw === "null") return undefined;

  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  // Inline array: ["a", "b", "c"] or []
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    // Split by comma, parse each element
    return splitArrayElements(inner).map((el) => {
      const trimmed = el.trim();
      // Remove quotes
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return parseScalar(trimmed);
    });
  }

  return parseScalar(raw);
}

function splitArrayElements(inner: string): string[] {
  const elements: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inQuote) {
      current += ch;
      if (ch === quoteChar) inQuote = false;
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
      current += ch;
    } else if (ch === ",") {
      elements.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) elements.push(current);
  return elements;
}

function parseScalar(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  const num = Number(val);
  if (!Number.isNaN(num) && val !== "") return num;
  return val;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Write a note to its markdown file, creating directories as needed.
 */
export async function writeNoteToFile(note: Note, baseDir: string): Promise<void> {
  const filePath = getNotePath(baseDir, note.user_id, note.id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeNoteToMarkdown(note), "utf-8");
}

/**
 * Delete a note's markdown file if it exists.
 */
export async function deleteNoteFile(userId: string, noteId: string, baseDir: string): Promise<void> {
  const filePath = getNotePath(baseDir, userId, noteId);
  try {
    await fs.unlink(filePath);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
}
