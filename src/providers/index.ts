/** Built-ins are opt-in; the bridge core has no provider registry or SDK imports. */
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider, OllamaCloudProvider } from "./ollama.js";
import type { ProviderConfig } from "../types.js";

export { OpenAIProvider, AnthropicProvider, OllamaProvider, OllamaCloudProvider };
export { ProviderHttpError } from "./ollama.js";

export interface BuiltInProviderConfig {
  openai?: ProviderConfig;
  anthropic?: ProviderConfig;
  ollama?: ProviderConfig;
  "ollama-cloud"?: ProviderConfig;
}

export type BuiltInProviders = {
  openai?: OpenAIProvider;
  anthropic?: AnthropicProvider;
  ollama?: OllamaProvider;
  "ollama-cloud"?: OllamaCloudProvider;
};

function configured(explicit: string | undefined, fallback: string | undefined): string | undefined {
  const value = explicit ?? fallback;
  return value?.trim() ? value : undefined;
}

/** Register only configured providers. Connection settings are captured at startup. */
export function resolveBuiltInProviderConfig(
  config: BuiltInProviderConfig = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): BuiltInProviderConfig {
  const providers: BuiltInProviderConfig = {};
  const openaiKey = configured(config.openai?.apiKey, env.OPENAI_API_KEY);
  if (openaiKey) providers.openai = {
    ...config.openai, apiKey: openaiKey,
    baseURL: configured(config.openai?.baseURL, env.OPENAI_BASE_URL) ?? "https://api.openai.com/v1",
  };
  const anthropicKey = configured(config.anthropic?.apiKey, env.ANTHROPIC_API_KEY);
  if (anthropicKey) providers.anthropic = {
    ...config.anthropic, apiKey: anthropicKey,
    baseURL: configured(config.anthropic?.baseURL, env.ANTHROPIC_BASE_URL) ?? "https://api.anthropic.com",
  };
  const ollamaURL = configured(config.ollama?.baseURL, env.OLLAMA_BASE_URL);
  if (ollamaURL) providers.ollama = {
    ...config.ollama, baseURL: ollamaURL,
    apiKey: configured(config.ollama?.apiKey, env.OLLAMA_API_KEY) ?? "",
  };
  const cloudKey = configured(config["ollama-cloud"]?.apiKey, configured(env.OLLAMA_CLOUD_API_KEY, undefined) ?? configured(env.OLLAMA_API_KEY, undefined));
  if (cloudKey) providers["ollama-cloud"] = {
    ...config["ollama-cloud"], apiKey: cloudKey,
    baseURL: configured(config["ollama-cloud"]?.baseURL, env.OLLAMA_CLOUD_BASE_URL) ?? "https://ollama.com",
  };
  return providers;
}

/** Create only providers enabled by explicit settings or the supplied environment. */
export function createBuiltInProviders(
  config: BuiltInProviderConfig = {},
  env: Readonly<Record<string, string | undefined>> = process.env,
): BuiltInProviders {
  const settings = resolveBuiltInProviderConfig(config, env);
  return {
    ...(settings.openai ? { openai: new OpenAIProvider(settings.openai) } : {}),
    ...(settings.anthropic ? { anthropic: new AnthropicProvider(settings.anthropic) } : {}),
    ...(settings.ollama ? { ollama: new OllamaProvider(settings.ollama) } : {}),
    ...(settings["ollama-cloud"] ? { "ollama-cloud": new OllamaCloudProvider(settings["ollama-cloud"]) } : {}),
  };
}
