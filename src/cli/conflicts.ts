import type { MemoryStore } from "../types/store.js";

/**
 * CLI-04: List detected memory conflicts.
 *
 * Displays unresolved (or all) conflicts for a specific user.
 */
export async function conflictsCommand(
  store: MemoryStore,
  userId: string,
  showResolved?: boolean,
): Promise<void> {
  // Fetch conflicts, optionally including resolved
  const allConflicts = await store.getConflicts({
    resolved: showResolved ? undefined : false,
  });

  // Filter by userId: check that noteIdA or noteIdB belongs to user
  const userConflicts = [];
  for (const conflict of allConflicts) {
    const noteA = await store.read(conflict.noteIdA, userId);
    const noteB = await store.read(conflict.noteIdB, userId);
    if (noteA || noteB) {
      userConflicts.push({
        conflict,
        previewA: noteA
          ? noteA.content.slice(0, 60) + (noteA.content.length > 60 ? "..." : "")
          : "(note not found)",
        previewB: noteB
          ? noteB.content.slice(0, 60) + (noteB.content.length > 60 ? "..." : "")
          : "(note not found)",
      });
    }
  }

  if (userConflicts.length === 0) {
    console.log("No unresolved conflicts found.");
    return;
  }

  const label = showResolved ? "Memory Conflicts" : "Unresolved Memory Conflicts";
  console.log(`${label} for user: ${userId}`);
  console.log("\u2500".repeat(45));

  for (let i = 0; i < userConflicts.length; i++) {
    const { conflict, previewA, previewB } = userConflicts[i];
    const status = conflict.resolved ? "resolved" : "unresolved";
    console.log(
      `[${i + 1}] ${conflict.type.toUpperCase()} (${status})`,
    );
    console.log(`    Note A: "${previewA}" (${conflict.noteIdA})`);
    console.log(`    Note B: "${previewB}" (${conflict.noteIdB})`);
    console.log(`    Description: ${conflict.description}`);
    if (conflict.resolved && conflict.resolution) {
      console.log(`    Resolution: ${conflict.resolution}`);
    }
    console.log();
  }

  const unresolvedCount = userConflicts.filter(
    (c) => !c.conflict.resolved,
  ).length;
  console.log(
    `Total: ${userConflicts.length} conflicts (${unresolvedCount} unresolved)`,
  );
}
