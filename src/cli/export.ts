import { writeFile } from "node:fs/promises";
import type { MemoryStore } from "../types/store.js";

/**
 * CLI-02: JSON dump of all memories with metadata.
 *
 * Serializes all notes to JSON, replacing embedding with a placeholder.
 */
export async function exportCommand(
  store: MemoryStore,
  userId: string,
  outputPath?: string,
): Promise<void> {
  const notes = await store.listByUser(userId, { limit: 10000 });

  // Replace embedding binary with placeholder
  const serializable = notes.map((note) => {
    const { embedding, ...rest } = note;
    return {
      ...rest,
      embedding: {
        dimensions: embedding.length,
        omitted: true,
      },
    };
  });

  const date = new Date().toISOString().slice(0, 10);
  const filePath = outputPath ?? `muma-export-${userId}-${date}.json`;

  await writeFile(filePath, JSON.stringify(serializable, null, 2), "utf-8");
  console.log(`Exported ${notes.length} memories to ${filePath}`);
}
