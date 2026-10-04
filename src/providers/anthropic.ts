import type Anthropic from "@anthropic-ai/sdk";
import { RouterError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig, ProviderRequest, ProviderResponse } from "../types.js";
import { baselineToAnthropicInput, anthropicOutputToBaseline } from "../dialects/anthropic.js";

export class AnthropicProvider implements ProviderAdapter {
  private client: Promise<Anthropic> | undefined;
  private readonly config: ProviderConfig;
  constructor(config: ProviderConfig = {}) { this.config = { ...config }; }

  private getClient(): Promise<Anthropic> {
    const config = this.config;
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new RouterError("Anthropic requires apiKey or ANTHROPIC_API_KEY");
    return this.client ??= import("@anthropic-ai/sdk").then(({ default: SDK }) => new SDK({
      apiKey, maxRetries: 0,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
      ...(config.fetch ? { fetch: config.fetch } : {}),
      ...(config.timeoutMs !== undefined ? { timeout: config.timeoutMs } : {}),
    }));
  }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const input = baselineToAnthropicInput(req.input);
    const client = await this.getClient();
    const raw = await client.messages.create({ ...input, model: req.model, stream: false });
    return { output: anthropicOutputToBaseline(raw), raw };
  }
}
