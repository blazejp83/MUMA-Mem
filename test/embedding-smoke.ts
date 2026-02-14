/**
 * Smoke test for LocalEmbeddingProvider.
 * Run: npx tsx test/embedding-smoke.ts
 */
import { LocalEmbeddingProvider } from "../src/embedding/local.js";

async function main() {
  console.log("Creating LocalEmbeddingProvider...");
  const provider = new LocalEmbeddingProvider({});

  console.log(`Model: ${provider.modelName}`);
  console.log(`Expected dimensions: ${provider.dimensions}`);

  console.log("Initializing (downloading model if first run)...");
  await provider.initialize();

  console.log("Embedding 'Hello world'...");
  const embedding = await provider.embed("Hello world");

  console.log(`Result type: ${embedding.constructor.name}`);
  console.log(`Result length: ${embedding.length}`);
  console.log(`First 5 values: [${Array.from(embedding.slice(0, 5)).map(v => v.toFixed(6)).join(", ")}]`);

  // Assertions
  if (!(embedding instanceof Float32Array)) {
    throw new Error(`Expected Float32Array, got ${embedding.constructor.name}`);
  }
  if (embedding.length !== 384) {
    throw new Error(`Expected 384 dimensions, got ${embedding.length}`);
  }
  if (provider.dimensions !== 384) {
    throw new Error(`Expected provider.dimensions === 384, got ${provider.dimensions}`);
  }

  // Test batch embedding
  console.log("\nTesting batch embedding...");
  const batch = await provider.embedBatch(["Hello", "World", "Test"]);
  console.log(`Batch size: ${batch.length}`);
  if (batch.length !== 3) {
    throw new Error(`Expected 3 embeddings, got ${batch.length}`);
  }
  for (let i = 0; i < batch.length; i++) {
    if (!(batch[i] instanceof Float32Array) || batch[i].length !== 384) {
      throw new Error(`Batch[${i}] invalid: type=${batch[i].constructor.name}, length=${batch[i].length}`);
    }
  }

  await provider.close();

  console.log("\n--- ALL CHECKS PASSED ---");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
