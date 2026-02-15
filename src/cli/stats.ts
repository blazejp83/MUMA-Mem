import type { MemoryStore } from "../types/store.js";

/**
 * CLI-01: Memory counts, storage usage, activation distribution.
 *
 * Prints formatted stats table to stdout.
 */
export async function statsCommand(
  store: MemoryStore,
  userId: string,
): Promise<void> {
  const total = await store.countByUser(userId);
  const notes = await store.listByUser(userId, { limit: 1000 });

  // Activation distribution
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const note of notes) {
    if (note.activation > 2.0) {
      high++;
    } else if (note.activation >= 0) {
      medium++;
    } else {
      low++;
    }
  }

  // Domain distribution
  const domainCounts = new Map<string, number>();
  for (const note of notes) {
    const domain = note.domain || "(none)";
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
  }

  // Sort domains by count descending
  const sortedDomains = [...domainCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  );

  // Age stats
  let oldest: Date | null = null;
  let newest: Date | null = null;
  const ages: number[] = [];
  const now = Date.now();
  for (const note of notes) {
    const created = new Date(note.created_at);
    if (!oldest || created < oldest) oldest = created;
    if (!newest || created > newest) newest = created;
    ages.push(now - created.getTime());
  }
  ages.sort((a, b) => a - b);
  const medianAgeMs = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 0;
  const medianAgeDays = Math.round(medianAgeMs / (1000 * 60 * 60 * 24));

  // Pinned and pruning candidates
  const pinned = notes.filter((n) => n.pinned).length;
  const pruning = notes.filter((n) => n.activation < -2.0 && !n.pinned).length;

  const pct = (n: number) =>
    total > 0 ? ((n / total) * 100).toFixed(1) : "0.0";

  console.log(`Memory Stats for user: ${userId}`);
  console.log("\u2500".repeat(35));
  console.log(`Total memories:  ${total}`);
  console.log(`Backend:         ${store.backend}`);
  console.log();
  console.log("Activation Distribution:");
  console.log(`  High (>2.0):   ${high} (${pct(high)}%)`);
  console.log(`  Medium (0-2):  ${medium} (${pct(medium)}%)`);
  console.log(`  Low (<0):      ${low} (${pct(low)}%)`);
  console.log();

  if (sortedDomains.length > 0) {
    console.log("Top Domains:");
    for (const [domain, count] of sortedDomains.slice(0, 10)) {
      console.log(`  ${domain}: ${count} notes`);
    }
    console.log();
  }

  if (notes.length > 0) {
    console.log(
      `Oldest: ${oldest ? oldest.toISOString().slice(0, 10) : "N/A"}`,
    );
    console.log(
      `Newest: ${newest ? newest.toISOString().slice(0, 10) : "N/A"}`,
    );
    console.log(`Median age: ${medianAgeDays} days`);
    console.log();
  }

  console.log(`Pinned: ${pinned}`);
  console.log(`Pruning candidates: ${pruning}`);
}
