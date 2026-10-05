import { BridgeError } from "../errors.js";
import type { ProviderAdapter, ProviderConfig, ProviderRequest, ProviderResponse, ProviderModelsResponse } from "../types.js";
import { baselineToOllamaInput, ollamaOutputToBaseline } from "../dialects/ollama.js";
import type { OllamaOutput } from "../dialects/ollama.js";

export class ProviderHttpError extends BridgeError {
  override readonly name = "ProviderHttpError";
  constructor(readonly status: number, readonly body: string) {
    super(`Ollama returned HTTP ${status}`);
  }
}

export class OllamaProvider implements ProviderAdapter {
  private readonly config: ProviderConfig;
  constructor(config: ProviderConfig = {}, private readonly cloud = false) { this.config = { ...config }; }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const config = this.config;
    const baseURL = config.baseURL ?? (this.cloud
      ? process.env.OLLAMA_CLOUD_BASE_URL ?? "https://ollama.com"
      : process.env.OLLAMA_BASE_URL ?? "http://localhost:11434");
    const apiKey = config.apiKey ?? (this.cloud
      ? process.env.OLLAMA_CLOUD_API_KEY ?? process.env.OLLAMA_API_KEY
      : process.env.OLLAMA_API_KEY);
    if (this.cloud && !apiKey) throw new BridgeError("Ollama Cloud requires apiKey, OLLAMA_CLOUD_API_KEY or OLLAMA_API_KEY");
    const root = baseURL.replace(/\/+$/, "").replace(/\/api$/, "");
    const response = await (config.fetch ?? globalThis.fetch)(`${root}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(config.timeoutMs ?? 600_000),
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text());
    const raw: unknown = await response.json();
    if (raw && typeof raw === "object" && "error" in raw && raw.error) throw new BridgeError(`Ollama: ${String(raw.error)}`);
    return raw;
  }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const input = baselineToOllamaInput(req.input);
    const raw = await this.request("/api/chat", {
      method: "POST", body: JSON.stringify({ ...input, model: req.model, stream: false }),
    }) as OllamaOutput;
    if (!raw || !raw.done || !raw.message || typeof raw.model !== "string" || typeof raw.created_at !== "string") {
      throw new BridgeError("Ollama returned an invalid non-streaming chat response");
    }
    return { output: ollamaOutputToBaseline(raw), raw };
  }

  async listModels(): Promise<ProviderModelsResponse> {
    const raw = await this.request("/api/tags", { method: "GET" });
    if (!raw || typeof raw !== "object" || !("models" in raw) || !Array.isArray(raw.models)) {
      throw new BridgeError("Ollama returned an invalid model list");
    }
    const models = raw.models.map((value: unknown) => {
      if (!value || typeof value !== "object") throw new BridgeError("Ollama returned an invalid model");
      const model = value as Record<string, unknown>;
      const id = model.model ?? model.name;
      if (typeof id !== "string" || !id) throw new BridgeError("Ollama returned a model without an id");
      return {
        id, ...(typeof model.name === "string" ? { name: model.name } : {}),
        ...(typeof model.modified_at === "string" ? { modifiedAt: model.modified_at } : {}),
        ...(typeof model.size === "number" ? { sizeBytes: model.size } : {}),
        raw: model,
      };
    });
    return { models, raw };
  }
}

export class OllamaCloudProvider extends OllamaProvider {
  constructor(config: ProviderConfig = {}) { super(config, true); }
}
