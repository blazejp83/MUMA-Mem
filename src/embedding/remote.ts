import type { EmbeddingProvider } from "./types.js";

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export class RemoteEmbeddingProvider implements EmbeddingProvider {
  private _dimensions: number | null;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    dimensions?: number;
  }) {
    this.modelName = config.model ?? "text-embedding-3-small";
    this.apiKey = config.apiKey ?? "";
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this._dimensions = config.dimensions ?? null;
  }

  get dimensions(): number {
    if (this._dimensions === null) {
      throw new Error(
        "RemoteEmbeddingProvider dimensions unknown. Call embed() first or set dimensions in config.",
      );
    }
    return this._dimensions;
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        "RemoteEmbeddingProvider requires an API key. Set embedding.apiKey in config.",
      );
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await this.callApi([text]);
    const embedding = response.data[0].embedding;
    const result = new Float32Array(embedding);
    if (this._dimensions === null) {
      this._dimensions = result.length;
    }
    return result;
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];
    const response = await this.callApi(texts);
    // Sort by index to preserve order
    const sorted = response.data.sort((a, b) => a.index - b.index);
    const results = sorted.map((d) => new Float32Array(d.embedding));
    if (this._dimensions === null && results.length > 0) {
      this._dimensions = results[0].length;
    }
    return results;
  }

  async close(): Promise<void> {
    // No-op for HTTP-based provider
  }

  private async callApi(input: string[]): Promise<EmbeddingResponse> {
    const url = `${this.baseUrl}/embeddings`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new Error(
          `Embedding API authentication failed (401): Invalid API key. ${body}`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `Embedding API rate limited (429): Too many requests. ${body}`,
        );
      }
      throw new Error(
        `Embedding API error (${res.status}): ${res.statusText}. ${body}`,
      );
    }

    return (await res.json()) as EmbeddingResponse;
  }
}
