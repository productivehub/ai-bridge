import type OpenAI from "openai";
import { RouterError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig, ProviderRequest, ProviderResponse } from "../types.js";
import { baselineToOpenAIInput, openAIOutputToBaseline } from "../dialects/openai.js";

export class OpenAIProvider implements ProviderAdapter {
  private client: Promise<OpenAI> | undefined;
  private readonly config: ProviderConfig;
  constructor(config: ProviderConfig = {}) { this.config = { ...config }; }

  private getClient(): Promise<OpenAI> {
    const config = this.config;
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) throw new RouterError("OpenAI requires apiKey or OPENAI_API_KEY");
    return this.client ??= import("openai").then(({ default: SDK }) => new SDK({
      apiKey, maxRetries: 0,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.timeoutMs !== undefined ? { timeout: config.timeoutMs } : {}),
    }));
  }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const input = baselineToOpenAIInput(req.input);
    const client = await this.getClient();
    const raw = await client.chat.completions.create({ ...input, model: req.model, stream: false });
    return { output: openAIOutputToBaseline(raw), raw };
  }
}
