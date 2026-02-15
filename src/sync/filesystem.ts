import * as fs from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import * as path from "node:path";
import type { Note, NoteUpdate } from "../types/note.js";
import type { MemoryStore } from "../types/store.js";
import type { EventBus, MemoryEvent } from "./events.js";

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

// ---------------------------------------------------------------------------
// FilesystemSync — Bidirectional sync between MemoryStore and filesystem
// ---------------------------------------------------------------------------

/**
 * Bidirectional sync between the memory store and ~/clawd/memory/ as
 * human-readable markdown files. Changes in either direction propagate
 * automatically:
 *
 * - Store -> File: Event bus events trigger writeNoteToFile / deleteNoteFile
 * - File -> Store: fs.watch detects edits, deserializes, and store.update()
 *
 * Debounce prevents sync loops:
 * - recentWrites: Set of noteIds recently written BY the sync (store->file).
 *   Cleared after 2000ms. Prevents re-importing our own writes.
 * - debounceTimers: Map of filePath->setTimeout. On fs.watch event, clear
 *   previous timer, set new 500ms timer. Prevents multiple events per save.
 */
export class FilesystemSync {
  private baseDir: string;
  private watchers: FSWatcher[] = [];
  private unsubscribeEventBus: (() => void) | null = null;
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private recentWrites: Set<string> = new Set();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  /**
   * Start bidirectional sync:
   * 1. Subscribe to event bus for store->file sync
   * 2. Start fs.watch for file->store sync
   */
  async start(store: MemoryStore, eventBus: EventBus | null): Promise<void> {
    // Ensure base directory exists
    await fs.mkdir(this.baseDir, { recursive: true });

    // --- Store -> File: subscribe to event bus ---
    if (eventBus) {
      this.unsubscribeEventBus = eventBus.subscribe((event: MemoryEvent) => {
        void this.handleStoreEvent(event, store);
      });
    }

    // --- File -> Store: start filesystem watcher ---
    await this.startWatching(store);
  }

  /**
   * Stop all watchers, unsubscribe from event bus, clear timers.
   */
  async stop(): Promise<void> {
    // Unsubscribe from event bus
    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus();
      this.unsubscribeEventBus = null;
    }

    // Close all file watchers
    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.recentWrites.clear();
  }

  /**
   * One-time sync: export all existing notes from store to filesystem.
   * Used on startup to populate file tree from existing store data.
   */
  async initialSync(store: MemoryStore): Promise<void> {
    try {
      // We need to iterate users — there's no listAllUsers API, so we
      // scan existing user directories and also sync from store for any
      // notes. Since we can't enumerate all users from the store directly,
      // we do a best-effort sync by checking existing user directories.
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true }).catch(() => []);
      const userIds = new Set<string>();
      for (const entry of entries) {
        if (entry.isDirectory()) {
          userIds.add(entry.name);
        }
      }

      // For each known user, list their notes and write to files
      for (const userId of userIds) {
        try {
          const notes = await store.listByUser(userId);
          for (const note of notes) {
            this.markRecentWrite(note.id);
            await writeNoteToFile(note, this.baseDir);
          }
        } catch {
          // Skip users that fail
        }
      }
    } catch {
      // Best-effort — don't fail startup if initial sync fails
    }
  }

  // -------------------------------------------------------------------------
  // Store -> File: Handle event bus events
  // -------------------------------------------------------------------------

  private async handleStoreEvent(event: MemoryEvent, store: MemoryStore): Promise<void> {
    try {
      if (event.type === "memory:delete") {
        this.markRecentWrite(event.noteId);
        await deleteNoteFile(event.userId, event.noteId, this.baseDir);
        return;
      }

      // memory:write or memory:update — read note from store and write file
      const note = await store.read(event.noteId, event.userId);
      if (!note) return;

      this.markRecentWrite(note.id);
      await writeNoteToFile(note, this.baseDir);
    } catch {
      // Non-fatal — store event handling should not crash
    }
  }

  // -------------------------------------------------------------------------
  // File -> Store: Watch filesystem for changes
  // -------------------------------------------------------------------------

  private async startWatching(store: MemoryStore): Promise<void> {
    // Try recursive watching first (works on macOS and Windows,
    // may not work on all Linux filesystems)
    try {
      const watcher = watch(this.baseDir, { recursive: true }, (eventType, filename) => {
        if (filename) this.handleFileEvent(eventType, filename, store);
      });
      this.watchers.push(watcher);
      return;
    } catch {
      // Recursive watch not supported — fall back to per-directory watching
    }

    // Fallback: watch each userId directory individually
    await this.watchUserDirectories(store);
  }

  private async watchUserDirectories(store: MemoryStore): Promise<void> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.watchSingleDirectory(path.join(this.baseDir, entry.name), entry.name, store);
        }
      }
    } catch {
      // No directories to watch yet
    }
  }

  private watchSingleDirectory(dirPath: string, userId: string, store: MemoryStore): void {
    try {
      const watcher = watch(dirPath, (eventType, filename) => {
        if (filename) {
          const relPath = path.join(userId, filename);
          this.handleFileEvent(eventType, relPath, store);
        }
      });
      this.watchers.push(watcher);
    } catch {
      // Can't watch this directory — skip
    }
  }

  private handleFileEvent(eventType: string, filename: string, store: MemoryStore): void {
    // Only watch .md files
    if (!filename.endsWith(".md")) return;

    // Extract noteId from filename: userId/noteId.md
    const parts = filename.split(path.sep);
    if (parts.length < 2) return;

    const noteId = path.basename(parts[parts.length - 1], ".md");

    // Skip if this is our own recent write
    if (this.recentWrites.has(noteId)) return;

    const filePath = path.join(this.baseDir, filename);

    // Debounce: clear previous timer, set new one
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath);
        void this.processFileChange(filePath, eventType, store);
      }, 500),
    );
  }

  private async processFileChange(filePath: string, eventType: string, store: MemoryStore): Promise<void> {
    try {
      // Check if file exists
      const exists = await fs.access(filePath).then(
        () => true,
        () => false,
      );

      if (!exists) {
        // File was deleted — extract userId and noteId from path
        const rel = path.relative(this.baseDir, filePath);
        const parts = rel.split(path.sep);
        if (parts.length >= 2) {
          const userId = parts[0];
          const noteId = path.basename(parts[parts.length - 1], ".md");
          await store.delete(noteId, userId);
        }
        return;
      }

      // File was changed — read and parse
      const markdown = await fs.readFile(filePath, "utf-8");
      const parsed = deserializeMarkdownToNoteUpdate(markdown);
      if (!parsed) return;

      const { id, userId, updates } = parsed;
      if (!id || !userId) return;

      await store.update(id, userId, updates);
    } catch {
      // Non-fatal — file change handling should not crash
    }
  }

  // -------------------------------------------------------------------------
  // Debounce helpers
  // -------------------------------------------------------------------------

  private markRecentWrite(noteId: string): void {
    this.recentWrites.add(noteId);
    setTimeout(() => {
      this.recentWrites.delete(noteId);
    }, 2000);
  }
}
