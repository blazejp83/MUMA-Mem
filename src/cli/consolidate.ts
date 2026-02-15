import type { MemoryStore } from "../types/store.js";
import type { MumaConfig } from "../config.js";
import { createEmbeddingProvider } from "../embedding/factory.js";
import { createLLMProvider } from "../llm/factory.js";
import { consolidate } from "../consolidation/consolidate.js";
import { distillMemoryMd, writeMemoryMdFile } from "../consolidation/distill.js";

/**
 * CLI-03: Trigger manual consolidation.
 *
 * Runs the full consolidation pipeline (cluster, summarize, detect conflicts,
 * resolve) and then distills + writes MEMORY.md.
 */
export async function consolidateCommand(
  store: MemoryStore,
  config: MumaConfig,
  userId: string,
): Promise<void> {
  // Require LLM configuration
  const llm = createLLMProvider(config);
  if (!llm) {
    console.error(
      "Consolidation requires LLM configuration. Set llm.apiKey and llm.model in config.",
    );
    process.exit(1);
  }

  const embedding = await createEmbeddingProvider(config);

  try {
    // Run consolidation pipeline
    const report = await consolidate(userId, store, embedding, llm);

    // Distill and write MEMORY.md
    const content = await distillMemoryMd(userId, store, llm);
    const mdPath = await writeMemoryMdFile(content, userId);

    console.log(`Consolidation Complete for user: ${userId}`);
    console.log("\u2500".repeat(45));
    console.log(`Clusters found:           ${report.clustersFound}`);
    console.log(`Summaries created:        ${report.summariesCreated}`);
    console.log(`Conflicts detected:       ${report.conflictsDetected}`);
    console.log(`  Auto-resolved:          ${report.conflictsAutoResolved}`);
    console.log(`  Needs review:           ${report.conflictsNeedingReview}`);
    console.log(`MEMORY.md updated:        ${mdPath}`);
  } finally {
    await embedding.close();
  }
}
