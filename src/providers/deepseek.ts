import { BridgeError } from "../errors.js";
import { toMinorUnits } from "../money.js";
import type {
  AllowanceWindow, ProviderAllowanceResponse, ProviderConfig, ProviderModelsResponse, ProviderRequest, ProviderResponse,
} from "../types.js";
import { OpenAIProvider } from "./openai.js";
import { ProviderHttpError } from "./ollama.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const present = (value: string | undefined): string | undefined => value?.trim() ? value : undefined;

/**
 * Headers the OpenAI SDK adds from OPENAI_ORG_ID / OPENAI_PROJECT_ID. Stripped so nothing
 * from the OpenAI environment reaches a DeepSeek endpoint.
 */
const OPENAI_ONLY_HEADERS = ["openai-organization", "openai-project"];

function isolateFetch(base: typeof globalThis.fetch | undefined): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    for (const name of OPENAI_ONLY_HEADERS) headers.delete(name);
    return (base ?? globalThis.fetch)(input, { ...init, headers });
  };
}

/**
 * DeepSeek through its OpenAI-compatible API. It authenticates only with a DeepSeek key:
 * settings are resolved once here and passed to the parent explicitly, so the parent's
 * OPENAI_API_KEY / OPENAI_BASE_URL fallbacks can never apply.
 */
export class DeepSeekProvider extends OpenAIProvider {
  private readonly key: string | undefined;
  private readonly root: string;
  private readonly http: typeof globalThis.fetch | undefined;
  private readonly timeoutMs: number | undefined;

  constructor(config: ProviderConfig = {}) {
    const key = present(config.apiKey) ?? present(process.env.DEEPSEEK_API_KEY);
    const baseURL = present(config.baseURL) ?? present(process.env.DEEPSEEK_BASE_URL) ?? DEFAULT_BASE_URL;
    super({
      baseURL, fetch: isolateFetch(config.fetch),
      ...(key ? { apiKey: key } : {}),
      ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    });
    this.key = key;
    this.root = baseURL.replace(/\/+$/, "");
    this.http = config.fetch;
    this.timeoutMs = config.timeoutMs;
  }

  private requireKey(): string {
    if (!this.key) throw new BridgeError("DeepSeek requires apiKey or DEEPSEEK_API_KEY");
    return this.key;
  }

  override async complete(req: ProviderRequest): Promise<ProviderResponse> {
    this.requireKey();
    return super.complete(req);
  }

  /** GET with the one resolved key/base pair; non-OK is a ProviderHttpError naming DeepSeek. */
  private async get(path: string): Promise<unknown> {
    const key = this.requireKey();
    const response = await (this.http ?? globalThis.fetch)(`${this.root}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs ?? 600_000),
    });
    if (!response.ok) throw new ProviderHttpError(response.status, await response.text(), "DeepSeek");
    return response.json();
  }

  /** Own implementation: DeepSeek's /models entries carry no `created`, which the OpenAI parent requires. */
  override async listModels(): Promise<ProviderModelsResponse> {
    const raw = await this.get("/models");
    const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>).data : undefined;
    if (!Array.isArray(data)) throw new BridgeError("DeepSeek returned an invalid model list");
    const models = data.map((value: unknown, i) => {
      if (!value || typeof value !== "object") throw new BridgeError(`DeepSeek returned an invalid model at index ${i}`);
      const model = value as Record<string, unknown>;
      if (typeof model.id !== "string" || !model.id) throw new BridgeError(`DeepSeek returned a model without an id at index ${i}`);
      return {
        id: model.id,
        ...(typeof model.owned_by === "string" ? { ownedBy: model.owned_by } : {}),
        ...(typeof model.created === "number" && Number.isFinite(model.created)
          ? { createdAt: new Date(model.created * 1000).toISOString() } : {}),
        raw: model,
      };
    });
    return { models, raw };
  }

  async getAllowance(): Promise<ProviderAllowanceResponse> {
    const body = await this.get("/user/balance");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BridgeError("DeepSeek returned an invalid balance response");
    const { is_available: isAvailable, balance_infos: infos } = body as Record<string, unknown>;
    if (!Array.isArray(infos)) throw new BridgeError("DeepSeek returned an invalid balance_infos");
    const entries = infos.map((value, i) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new BridgeError(`DeepSeek returned an invalid balance_infos[${i}]`);
      const entry = value as Record<string, unknown>;
      const { currency, total_balance: total } = entry;
      if (typeof currency !== "string" || !currency) throw new BridgeError(`DeepSeek balance_infos[${i}].currency is not a string`);
      if (typeof total !== "string" && typeof total !== "number") throw new BridgeError(`DeepSeek balance_infos[${i}].total_balance is not a string`);
      return { entry, currency, amount: toMinorUnits(total) };
    });
    const windows = entries.map(({ entry, currency, amount }): AllowanceWindow => ({
      id: entries.length === 1 ? "balance" : `balance-${currency.toLowerCase()}`,
      kind: "money", label: `Balance (${currency})`,
      remaining: { currency, amount }, remainingFraction: null, raw: entry,
    }));
    return {
      available: typeof isAvailable === "boolean" ? isAvailable : null,
      primary: windows[0] ?? null, windows, raw: body,
    };
  }
}
