import { RouterError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig, ProviderRequest, ProviderResponse } from "../types.js";
import { baselineToOllamaInput, ollamaOutputToBaseline } from "../dialects/ollama.js";
import type { OllamaOutput } from "../dialects/ollama.js";

export class ProviderHttpError extends RouterError {
  override readonly name = "ProviderHttpError";
  constructor(readonly status: number, readonly body: string) {
    super(`Ollama returned HTTP ${status}`);
  }
}

export class OllamaProvider implements ProviderAdapter {
  private readonly config: ProviderConfig;
  constructor(config: ProviderConfig = {}, private readonly cloud = false) { this.config = { ...config }; }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const input = baselineToOllamaInput(req.input);
    const config = this.config;
    const baseURL = config.baseURL ?? (this.cloud
      ? process.env.OLLAMA_CLOUD_BASE_URL ?? "https://ollama.com"
      : process.env.OLLAMA_BASE_URL ?? "http://localhost:11434");
    const apiKey = config.apiKey ?? (this.cloud
      ? process.env.OLLAMA_CLOUD_API_KEY ?? process.env.OLLAMA_API_KEY
      : process.env.OLLAMA_API_KEY);
    if (this.cloud && !apiKey) throw new RouterError("Ollama Cloud requires apiKey, OLLAMA_CLOUD_API_KEY or OLLAMA_API_KEY");
    const root = baseURL.replace(/\/+$/, "").replace(/\/api$/, "");
    const response = await (config.fetch ?? globalThis.fetch)(`${root}/api/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ ...input, model: req.model, stream: false }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 600_000),
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
    const raw = await response.json() as OllamaOutput & { error?: string };
    if (raw.error) throw new RouterError(`Ollama: ${raw.error}`);
    if (!raw.done || !raw.message || typeof raw.model !== "string" || typeof raw.created_at !== "string") {
      throw new RouterError("Ollama returned an invalid non-streaming chat response");
    }
    return { output: ollamaOutputToBaseline(raw), raw };
  }
}

export class OllamaCloudProvider extends OllamaProvider {
  constructor(config: ProviderConfig = {}) { super(config, true); }
}
