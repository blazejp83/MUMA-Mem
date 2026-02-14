/**
 * End-to-end integration test — exercises the full MUMA-Mem stack
 * WITHOUT OpenClaw (standalone usage).
 *
 * Validates: STORE-01, STORE-02, STORE-03, STORE-04, STORE-05, PLUG-08
 *
 * Run: npx tsx test/integration.ts
 */

import { MumaConfigSchema } from "../src/config.js";
import { createStore } from "../src/store/factory.js";
import { createEmbeddingProvider } from "../src/embedding/factory.js";
import { validateEmbeddingDimensions } from "../src/embedding/validation.js";
import type { MemoryStore } from "../src/types/store.js";
import type { EmbeddingProvider } from "../src/embedding/types.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

async function main() {
  let store: MemoryStore | null = null;
  let provider: EmbeddingProvider | null = null;

  try {
    // 1. Parse config with MumaConfigSchema (empty -> defaults)
    console.log("[1] Parsing config from empty input...");
    const config = MumaConfigSchema.parse({
      // Override to use in-memory SQLite (no Redis needed for test)
      sqlite: { path: ":memory:" },
      // Force local embedding provider
      embedding: { provider: "local" },
    });
    assert(config.embedding.provider === "local", "Expected local embedding provider");
    assert(config.redis.url === "redis://localhost:6379", "Expected default Redis URL");
    console.log("[OK] Config parsed with defaults");

    // 2. Create SQLite store (in-memory, no Redis needed for test)
    console.log("\n[2] Creating SQLite store (in-memory)...");
    // Pass a config that will skip Redis (no Redis available) and fall back to SQLite
    const storeConfig = {
      ...config,
      redis: { url: "", prefix: "muma:" }, // empty URL -> skip Redis
    };
    store = await createStore(storeConfig);
    assert(store.backend === "sqlite", `Expected sqlite backend, got ${store.backend}`);
    console.log("[OK] SQLite store created via factory");

    // 3. Create local embedding provider
    console.log("\n[3] Creating local embedding provider...");
    provider = await createEmbeddingProvider(config);
    assert(provider.dimensions === 384, `Expected 384 dimensions, got ${provider.dimensions}`);
    console.log(`[OK] Local embedding provider: ${provider.modelName} (${provider.dimensions}d)`);

    // 4. Validate dimensions (should pass — both use 384 or store is empty)
    console.log("\n[4] Validating embedding dimensions...");
    const validation = await validateEmbeddingDimensions(provider, store);
    assert(validation.ok, `Dimension validation failed: ${validation.error}`);
    console.log("[OK] Dimension validation passed (store has no vectors yet)");

    // 5. Embed "User prefers TypeScript over JavaScript"
    console.log("\n[5] Generating embedding for test content...");
    const contentEmbedding = await provider.embed("User prefers TypeScript over JavaScript");
    assert(contentEmbedding.length === 384, `Expected 384-dim embedding, got ${contentEmbedding.length}`);
    assert(contentEmbedding instanceof Float32Array, "Expected Float32Array");
    console.log("[OK] Content embedded (384-dim Float32Array)");

    // 6. Create a note with that embedding
    console.log("\n[6] Creating note...");
    const note = await store.create({
      content: "User prefers TypeScript over JavaScript",
      context: "Programming language preference expressed during code review",
      keywords: ["typescript", "javascript", "preference"],
      tags: ["programming", "preferences"],
      embedding: contentEmbedding,
      created_by: "test-agent",
      user_id: "test-user",
      domain: "development",
      visibility: "scoped",
      importance: 0.7,
      source: "experience",
      confidence: 0.9,
    });
    assert(typeof note.id === "string" && note.id.length > 0, "Note should have an ID");
    console.log(`[OK] Note created: ${note.id}`);

    // 7. Verify all 22 Note fields are populated
    console.log("\n[7] Verifying all 22 Note fields...");
    assert(note.id.length > 0, "id missing");
    assert(note.content === "User prefers TypeScript over JavaScript", "content mismatch");
    assert(note.context === "Programming language preference expressed during code review", "context mismatch");
    assert(JSON.stringify(note.keywords) === '["typescript","javascript","preference"]', "keywords mismatch");
    assert(JSON.stringify(note.tags) === '["programming","preferences"]', "tags mismatch");
    assert(note.embedding.length === 384, "embedding length mismatch");
    assert(note.links.length === 0, "links should be empty");
    assert(note.created_at.length > 0, "created_at missing");
    assert(note.updated_at.length > 0, "updated_at missing");
    assert(note.created_by === "test-agent", "created_by mismatch");
    assert(note.user_id === "test-user", "user_id mismatch");
    assert(note.domain === "development", "domain mismatch");
    assert(note.visibility === "scoped", "visibility mismatch");
    assert(note.access_count === 0, "access_count should be 0");
    assert(Array.isArray(note.access_log), "access_log should be array");
    assert(note.activation === 0, "activation should be 0");
    assert(note.half_life === 168, "half_life should be 168");
    assert(note.importance === 0.7, "importance mismatch");
    assert(note.source === "experience", "source mismatch");
    assert(note.confidence === 0.9, "confidence mismatch");
    assert(note.version === 1, "version should be 1");
    assert(note.pinned === false, "pinned should be false");
    console.log("[OK] All 22 Note fields verified (PLUG-08)");

    // 8. Read the note back by ID, verify content matches
    console.log("\n[8] Reading note back by ID...");
    const fetched = await store.read(note.id, "test-user");
    assert(fetched !== null, "Read returned null");
    assert(fetched.content === note.content, "Content mismatch on read-back");
    assert(fetched.context === note.context, "Context mismatch on read-back");
    assert(fetched.embedding.length === 384, "Embedding length mismatch on read-back");
    // Verify embedding values round-trip
    for (let i = 0; i < 384; i++) {
      assert(
        Math.abs(fetched.embedding[i] - contentEmbedding[i]) < 1e-6,
        `Embedding value mismatch at index ${i}`,
      );
    }
    console.log("[OK] Note read back — content and embedding match (STORE-01)");

    // 9. Embed query and search
    console.log("\n[9] Searching with semantic query...");
    const queryEmbedding = await provider.embed("What programming language does the user prefer?");
    assert(queryEmbedding.length === 384, "Query embedding should be 384-dim");

    const results = await store.search({
      query: queryEmbedding,
      userId: "test-user",
      topK: 5,
    });
    assert(results.length > 0, "Search returned no results");
    assert(results[0].note.id === note.id, "Search should return our note");
    assert(typeof results[0].score === "number", `Score should be a number, got ${typeof results[0].score}`);
    assert(!Number.isNaN(results[0].score), "Score should not be NaN");
    console.log(`[OK] Search returned ${results.length} result(s), top score: ${results[0].score.toFixed(4)}`);

    // 10. Verify user isolation (STORE-03)
    console.log("\n[10] Verifying user isolation...");
    const otherResults = await store.search({
      query: queryEmbedding,
      userId: "other-user",
      topK: 5,
    });
    assert(otherResults.length === 0, "User isolation failed — other-user should see no results");
    console.log("[OK] User isolation verified (STORE-03)");

    // 11. Update the note content, verify version incremented
    console.log("\n[11] Updating note...");
    const updated = await store.update(note.id, "test-user", {
      content: "User strongly prefers TypeScript over JavaScript for all projects",
      importance: 0.9,
    });
    assert(updated !== null, "Update returned null");
    assert(updated.content === "User strongly prefers TypeScript over JavaScript for all projects", "Updated content mismatch");
    assert(updated.version === 2, `Version should be 2 after update, got ${updated.version}`);
    assert(updated.importance === 0.9, "Updated importance mismatch");
    // Immutable fields preserved
    assert(updated.created_by === "test-agent", "created_by should be immutable");
    assert(updated.user_id === "test-user", "user_id should be immutable");
    assert(updated.created_at === note.created_at, "created_at should be immutable");
    console.log("[OK] Note updated, version bumped to 2");

    // 12. Delete the note, verify countByUser returns 0
    console.log("\n[12] Deleting note...");
    const deleted = await store.delete(note.id, "test-user");
    assert(deleted === true, "Delete should return true");
    const count = await store.countByUser("test-user");
    assert(count === 0, `Count after delete should be 0, got ${count}`);
    const gone = await store.read(note.id, "test-user");
    assert(gone === null, "Note should be null after delete");
    console.log("[OK] Note deleted, countByUser = 0");

    // 13. Close store and provider
    console.log("\n[13] Closing store and provider...");
    await store.close();
    store = null;
    await provider.close();
    provider = null;
    console.log("[OK] Resources closed");

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("All tests passed");
    console.log("=".repeat(60));
    console.log("Validated requirements:");
    console.log("  STORE-01: Data persists (read after create)");
    console.log("  STORE-02: SQLite backend works (via factory fallback)");
    console.log("  STORE-03: User isolation (search scoped to user_id)");
    console.log("  STORE-04: Local embedding works (384-dim MiniLM)");
    console.log("  STORE-05: Dimension validation passes");
    console.log("  PLUG-08:  All 22 metadata fields populated");
  } catch (err) {
    console.error("\n[FAIL]", (err as Error).message);
    process.exitCode = 1;
  } finally {
    // Ensure cleanup
    if (store) await store.close();
    if (provider) await provider.close();
  }
}

main();
