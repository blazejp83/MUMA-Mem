export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface LLMProvider {
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T>;
  readonly modelName: string;
}

interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTemperature: number;
  private readonly defaultMaxTokens: number;

  constructor(config: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    if (!config.apiKey) {
      throw new Error(
        "[muma-mem] LLM provider requires an API key. Set llm.apiKey in config.",
      );
    }
    this.modelName = config.model ?? "gpt-4o-mini";
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.defaultTemperature = config.temperature ?? 0.7;
    this.defaultMaxTokens = config.maxTokens ?? 1024;
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const response = await this.callApi(prompt, options, false);
    return response.choices[0].message.content;
  }

  async generateJSON<T>(prompt: string, options?: GenerateOptions): Promise<T> {
    const response = await this.callApi(prompt, options, true);
    const content = response.choices[0].message.content;
    try {
      return JSON.parse(content) as T;
    } catch {
      throw new Error(
        `[muma-mem] LLM returned invalid JSON: ${content.slice(0, 200)}`,
      );
    }
  }

  private async callApi(
    prompt: string,
    options: GenerateOptions | undefined,
    jsonMode: boolean,
  ): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    };

    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new Error(
          `[muma-mem] LLM API authentication failed (401): Invalid API key. ${text}`,
        );
      }
      if (res.status === 429) {
        throw new Error(
          `[muma-mem] LLM API rate limited (429): Too many requests. ${text}`,
        );
      }
      throw new Error(
        `[muma-mem] LLM API error (${res.status}): ${res.statusText}. ${text}`,
      );
    }

    return (await res.json()) as ChatCompletionResponse;
  }
}
