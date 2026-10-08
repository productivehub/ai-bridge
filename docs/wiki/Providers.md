# Providers

A provider handles communication with an upstream API and converts its response into `BridgeOutput`. It accepts the canonical `BridgeInput`, regardless of which response dialect the caller later requests.

## Built-in adapters

| Class | Completion API | Discovery API |
| --- | --- | --- |
| `OpenAIProvider` | Chat Completions through the OpenAI SDK | Models through the SDK |
| `AnthropicProvider` | Messages through the Anthropic SDK | Models through the SDK, including all pages |
| `DeepSeekProvider` | OpenAI-compatible Chat Completions through the OpenAI SDK, with its own key and base URL | Direct `GET /models` on that key and base URL |
| `OllamaProvider` | Native `/api/chat` | Native `/api/tags` |
| `OllamaCloudProvider` | Native `/api/chat` with bearer authentication | Native `/api/tags` with bearer authentication |

Classes are exported from both `@productivehub/ai-bridge` and `@productivehub/ai-bridge/providers`. Ollama Cloud shares the native Ollama implementation. DeepSeek never reads the `OPENAI_*` environment, and its direct GETs strip the OpenAI SDK's organization/project headers. Built-in requests are non-streaming, and SDK automatic retries are disabled. For `bridge.getAllowance`, `OllamaCloudProvider` reads `/api/balance` plus optional `/api/usage` and `DeepSeekProvider` reads `/user/balance`; the other built-ins throw `UnsupportedFeatureError` with `feature === "allowance"`.

Built-in request mappings reject features they cannot express. Registering another response dialect does not make the upstream provider support additional request features.

## Implement a custom provider

Implement `ProviderAdapter.complete(request): Promise<ProviderResponse>`. Return canonical output and the native response in `raw`. Model discovery is optional, and so is the allowance read (`getAllowance(): Promise<ProviderAllowanceResponse>`) that backs `bridge.getAllowance`.

This self-contained example uses a deterministic local adapter to show the contract. Replace its implementation with your transport and response mapping when integrating a real provider.

```ts
import {
  createBridge,
  type ProviderAdapter,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderModelsResponse,
} from "@productivehub/ai-bridge";

class ExampleProvider implements ProviderAdapter {
  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const raw = { text: "Hello from a custom provider" };
    return {
      output: {
        id: "example-response",
        model: request.model,
        choices: [{
          index: 0,
          message: { role: "assistant", content: raw.text },
          finishReason: "stop",
        }],
        usage: { inputTokens: null, outputTokens: null, totalTokens: null },
      },
      raw,
    };
  }

  async listModels(): Promise<ProviderModelsResponse> {
    const raw = { available: ["example-model"] };
    return {
      models: raw.available.map((id) => ({ id, raw: { id } })),
      raw,
    };
  }
}

const bridge = createBridge({ providers: { example: new ExampleProvider() } });
const response = await bridge.complete({
  provider: "example",
  model: "example-model",
  input: { messages: [{ role: "user", content: "Hello" }] },
});
```

There is no central provider-name union to edit. Provider names come from the injected registry. Completion-only adapters remain valid, but requesting discovery from them throws `UnsupportedFeatureError`, and requesting allowance from an adapter without `getAllowance` throws `UnsupportedFeatureError` with `feature === "allowance"`.

Map missing token counts to `null`; do not invent usage. Keep native payloads in `raw` without including SDK client objects or transport state. Optional model costs follow the [Costs](./Costs.md) contract.

See [Configuration](./Configuration.md) for connection settings and [Dialects](./Dialects.md) for caller-facing conversion.
