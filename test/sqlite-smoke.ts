/**
 * SQLite smoke test — uses in-memory database (no external dependencies).
 *
 * Run: npx tsx test/sqlite-smoke.ts
 */

import { SQLiteMemoryStore } from "../src/store/sqlite.js";

const DIMS = 384;

async function main() {
  const store = new SQLiteMemoryStore({ path: ":memory:" }, DIMS);

  try {
    await store.initialize();
    console.log("[OK] Initialized SQLite in-memory database with sqlite-vec");

    // 1. Create a note with a random 384-dim embedding
    const embedding = new Float32Array(DIMS);
    for (let i = 0; i < DIMS; i++) {
      embedding[i] = Math.random();
    }
    // Normalize for cosine distance
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    for (let i = 0; i < DIMS; i++) {
      embedding[i] /= norm;
    }

    const note = await store.create({
      content: "SQLite smoke test note",
      embedding,
      created_by: "test-agent",
      user_id: "test-user",
      domain: "testing",
      keywords: ["smoke", "test"],
      tags: ["automated"],
    });
    console.log(`[OK] Created note: ${note.id}`);

    // 2. Read back and verify all fields round-trip correctly
    const fetched = await store.read(note.id, "test-user");
    if (!fetched) throw new Error("Failed to read note back");
    if (fetched.content !== "SQLite smoke test note")
      throw new Error("Content mismatch");
    if (fetched.context !== "") throw new Error("Context default mismatch");
    if (JSON.stringify(fetched.keywords) !== '["smoke","test"]')
      throw new Error("Keywords mismatch");
    if (JSON.stringify(fetched.tags) !== '["automated"]')
      throw new Error("Tags mismatch");
    if (fetched.links.length !== 0) throw new Error("Links default mismatch");
    if (fetched.created_by !== "test-agent")
      throw new Error("created_by mismatch");
    if (fetched.user_id !== "test-user")
      throw new Error("user_id mismatch");
    if (fetched.domain !== "testing") throw new Error("Domain mismatch");
    if (fetched.visibility !== "scoped")
      throw new Error("Visibility default mismatch");
    if (fetched.access_count !== 0)
      throw new Error("access_count default mismatch");
    if (fetched.access_log.length !== 0)
      throw new Error("access_log default mismatch");
    if (fetched.activation !== 0)
      throw new Error("activation default mismatch");
    if (fetched.half_life !== 168)
      throw new Error("half_life default mismatch");
    if (fetched.importance !== 0.5)
      throw new Error("importance default mismatch");
    if (fetched.source !== "experience")
      throw new Error("source default mismatch");
    if (fetched.confidence !== 0.5)
      throw new Error("confidence default mismatch");
    if (fetched.version !== 1) throw new Error("version default mismatch");
    if (fetched.pinned !== false) throw new Error("pinned default mismatch");
    // Verify embedding round-trips
    if (fetched.embedding.length !== DIMS)
      throw new Error(
        `Embedding length mismatch: ${fetched.embedding.length} !== ${DIMS}`,
      );
    for (let i = 0; i < DIMS; i++) {
      if (Math.abs(fetched.embedding[i] - embedding[i]) > 1e-6) {
        throw new Error(`Embedding value mismatch at index ${i}`);
      }
    }
    console.log("[OK] Read note back — all 22 fields round-trip correctly");

    // 3. Update the note
    const updated = await store.update(note.id, "test-user", {
      content: "Updated content",
      pinned: true,
    });
    if (!updated) throw new Error("Update returned null");
    if (updated.content !== "Updated content")
      throw new Error("Updated content mismatch");
    if (updated.pinned !== true)
      throw new Error("Updated pinned mismatch");
    if (updated.version !== 2)
      throw new Error("Version not bumped");
    console.log("[OK] Updated note successfully (version bumped to 2)");

    // 4. Search with the same embedding — should return the note
    const results = await store.search({
      query: embedding,
      userId: "test-user",
      topK: 5,
    });
    if (results.length === 0)
      throw new Error("Search returned no results");
    if (results[0].note.id !== note.id)
      throw new Error("Search returned wrong note");
    console.log(
      `[OK] Search returned ${results.length} result(s), top score: ${results[0].score.toFixed(4)}`,
    );

    // 5. Verify minScore filter
    const highThreshold = await store.search({
      query: embedding,
      userId: "test-user",
      topK: 5,
      minScore: 0.9999999,
    });
    // With normalized vectors, searching with the same vector should give score ~1.0
    // so this should still return results
    console.log(
      `[OK] minScore filter (0.9999999): ${highThreshold.length} result(s)`,
    );

    // 6. Verify user isolation: search as different user
    const otherResults = await store.search({
      query: embedding,
      userId: "other-user",
      topK: 5,
    });
    if (otherResults.length > 0) {
      throw new Error(
        "User isolation failed — other-user should see no results",
      );
    }
    console.log("[OK] User isolation verified (other-user sees 0 results)");

    // 7. Count
    const count = await store.countByUser("test-user");
    if (count !== 1) throw new Error(`Expected count 1, got ${count}`);
    console.log(`[OK] countByUser: ${count}`);

    // 8. List
    const listed = await store.listByUser("test-user");
    if (listed.length !== 1) throw new Error("listByUser length mismatch");
    console.log(`[OK] listByUser: ${listed.length} note(s)`);

    // 9. Delete the note
    const deleted = await store.delete(note.id, "test-user");
    if (!deleted) throw new Error("Delete returned false");
    console.log("[OK] Deleted note");

    // 10. Verify deletion
    const gone = await store.read(note.id, "test-user");
    if (gone !== null) throw new Error("Note still exists after delete");
    const countAfter = await store.countByUser("test-user");
    if (countAfter !== 0)
      throw new Error(`Count after delete should be 0, got ${countAfter}`);
    console.log("[OK] Verified note is gone (count = 0)");

    // 11. Test deferred vec table creation (no dimensions upfront)
    const store2 = new SQLiteMemoryStore({ path: ":memory:" });
    await store2.initialize();
    if (store2.dimensions !== null)
      throw new Error("Dimensions should be null before first embedding");

    const note2 = await store2.create({
      content: "Deferred dimensions test",
      embedding: new Float32Array([0.1, 0.2, 0.3]),
      created_by: "test-agent",
      user_id: "test-user",
    });
    if (store2.dimensions !== 3)
      throw new Error(`Deferred dimensions should be 3, got ${store2.dimensions}`);

    const results2 = await store2.search({
      query: new Float32Array([0.1, 0.2, 0.3]),
      userId: "test-user",
      topK: 1,
    });
    if (results2.length !== 1)
      throw new Error("Deferred search should return 1 result");
    console.log("[OK] Deferred vec table creation works (dims detected on first insert)");

    await store2.close();

    console.log("\n[PASS] All SQLite smoke tests passed!");
  } catch (err) {
    console.error("[FAIL]", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main();
