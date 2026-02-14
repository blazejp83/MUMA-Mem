/**
 * Redis smoke test — requires Redis Stack (with RediSearch module) running locally.
 *
 * Run: npx tsx test/redis-smoke.ts
 *
 * If Redis is not available, the test will print an error and exit gracefully.
 */

import { RedisMemoryStore } from "../src/store/redis.js";

const DIMS = 384;

async function main() {
  const store = new RedisMemoryStore(
    { url: "redis://localhost:6379", prefix: "muma:test:" },
    DIMS,
  );

  try {
    await store.initialize();
    console.log("[OK] Connected to Redis");
  } catch (err) {
    console.error("[SKIP] Cannot connect to Redis:", (err as Error).message);
    process.exit(0);
  }

  try {
    // 1. Create a note with a random 384-dim embedding
    const embedding = new Float32Array(DIMS);
    for (let i = 0; i < DIMS; i++) {
      embedding[i] = Math.random();
    }

    const note = await store.create({
      content: "Redis smoke test note",
      embedding,
      created_by: "test-agent",
      user_id: "test-user",
      domain: "testing",
    });
    console.log(`[OK] Created note: ${note.id}`);

    // 2. Read back and verify
    const fetched = await store.read(note.id, "test-user");
    if (!fetched) throw new Error("Failed to read note back");
    if (fetched.content !== "Redis smoke test note") {
      throw new Error("Content mismatch");
    }
    console.log("[OK] Read note back successfully");

    // 3. Wait briefly for index to catch up (RediSearch indexes asynchronously)
    await new Promise((r) => setTimeout(r, 500));

    // 4. Search with the same embedding — should get the note back with high similarity
    const results = await store.search({
      query: embedding,
      userId: "test-user",
      topK: 5,
    });
    if (results.length === 0) {
      throw new Error("Search returned no results");
    }
    console.log(
      `[OK] Search returned ${results.length} result(s), top score: ${results[0].score.toFixed(4)}`,
    );

    // 5. Verify user isolation: search as different user
    const otherResults = await store.search({
      query: embedding,
      userId: "other-user",
      topK: 5,
    });
    if (otherResults.length > 0) {
      throw new Error("User isolation failed — other-user should see no results");
    }
    console.log("[OK] User isolation verified (other-user sees 0 results)");

    // 6. Count
    const count = await store.countByUser("test-user");
    console.log(`[OK] countByUser: ${count}`);

    // 7. Delete the note
    const deleted = await store.delete(note.id, "test-user");
    if (!deleted) throw new Error("Delete returned false");
    console.log("[OK] Deleted note");

    // 8. Verify deletion
    const gone = await store.read(note.id, "test-user");
    if (gone !== null) throw new Error("Note still exists after delete");
    console.log("[OK] Verified note is gone");

    console.log("\n[PASS] All smoke tests passed!");
  } catch (err) {
    console.error("[FAIL]", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main();
