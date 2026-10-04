/** Built-ins are opt-in; the router core has no provider registry or SDK imports. */
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

/** Creates lightweight adapters; credentials and SDKs are resolved on first call. */
export function createBuiltInProviders(config: BuiltInProviderConfig = {}) {
  return {
    openai: new OpenAIProvider(config.openai),
    anthropic: new AnthropicProvider(config.anthropic),
    ollama: new OllamaProvider(config.ollama),
    "ollama-cloud": new OllamaCloudProvider(config["ollama-cloud"]),
  };
}
