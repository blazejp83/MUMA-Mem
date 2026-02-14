import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import type { EmbeddingProvider } from "./types.js";

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private pipe: FeatureExtractionPipeline | null = null;
  private _dimensions: number;
  readonly modelName: string;

  constructor(config: { model?: string; dimensions?: number }) {
    this.modelName = config.model ?? "Xenova/all-MiniLM-L6-v2";
    // Default 384 for MiniLM-L6-v2; overridden on first embed if dimensions not set
    this._dimensions = config.dimensions ?? 384;
  }

  get dimensions(): number {
    return this._dimensions;
  }

  async initialize(): Promise<void> {
    // Dynamic import + cast to avoid TS2590 (union too complex) from pipeline() overloads
    const { pipeline } = await import("@huggingface/transformers");
    this.pipe = (await (pipeline as Function)(
      "feature-extraction",
      this.modelName,
    )) as FeatureExtractionPipeline;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.pipe) {
      throw new Error(
        "LocalEmbeddingProvider not initialized. Call initialize() first.",
      );
    }
    const output = await this.pipe(text, {
      pooling: "mean",
      normalize: true,
    });
    const data = output.tolist()[0] as number[];
    const result = new Float32Array(data);
    // Detect actual dimensions from first embedding
    if (result.length !== this._dimensions) {
      this._dimensions = result.length;
    }
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.pipe) {
      throw new Error(
        "LocalEmbeddingProvider not initialized. Call initialize() first.",
      );
    }
    const output = await this.pipe(texts, {
      pooling: "mean",
      normalize: true,
    });
    const nested = output.tolist() as number[][];
    const results = nested.map((arr) => new Float32Array(arr));
    // Detect actual dimensions from first embedding
    if (results.length > 0 && results[0].length !== this._dimensions) {
      this._dimensions = results[0].length;
    }
    return results;
  }

  async close(): Promise<void> {
    // Pipeline cleanup handled by GC
    this.pipe = null;
  }
}
