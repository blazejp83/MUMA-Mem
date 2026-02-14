export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  readonly dimensions: number;
  readonly modelName: string;
  initialize(): Promise<void>;
  close(): Promise<void>;
}
