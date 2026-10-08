# Configuration

`createBridge({ providers, dialects })` creates isolated registries from the objects you supply. There is no global registration state. Only injected providers and dialects are available; the baseline dialect `bridge` is always available and cannot be replaced.

## Built-in provider factory

`createBuiltInProviders(config?, env?)` creates adapters only for configured connections. `env` defaults to `process.env`.

| Provider name | Registration requirement | Key environment variables | Factory base URL |
| --- | --- | --- | --- |
| `openai` | Nonempty API key | `OPENAI_API_KEY` | Explicit URL, `OPENAI_BASE_URL`, then `https://api.openai.com/v1` |
| `anthropic` | Nonempty API key | `ANTHROPIC_API_KEY` | Explicit URL, `ANTHROPIC_BASE_URL`, then `https://api.anthropic.com` |
| `ollama` | Explicit URL or nonempty `OLLAMA_BASE_URL` | Optional `OLLAMA_API_KEY` | Explicit URL or `OLLAMA_BASE_URL`; no implicit localhost registration |
| `ollama-cloud` | Nonempty API key | `OLLAMA_CLOUD_API_KEY`, then `OLLAMA_API_KEY` | Explicit URL, `OLLAMA_CLOUD_BASE_URL`, then `https://ollama.com` |

Each provider's configuration accepts `apiKey`, `baseURL`, `fetch`, and `timeoutMs`. Explicit values take precedence over the supplied environment. Empty or whitespace-only keys disable hosted providers; an empty local Ollama URL disables local registration. The factory captures credentials and URLs at startup. Restart or create a new bridge to change those connections.

`resolveBuiltInProviderConfig(config?, env?)` returns the enabled connection settings without constructing adapters. Its result contains credentials and is not public account metadata.

The bridge does not load `.env` files itself. Load them through your application runtime or launcher before creating providers.

## Multiple accounts for one provider

Register each connection with a distinct name. Names are application-defined, and the bridge infers valid names from the registry.

```ts
import { createBridge, AnthropicProvider } from "@productivehub/ai-bridge";

const workKey = process.env.ANTHROPIC_WORK_API_KEY;
const personalKey = process.env.ANTHROPIC_PERSONAL_API_KEY;
if (!workKey || !personalKey) throw new Error("Configure both account keys");

const bridge = createBridge({
  providers: {
    "claude-work": new AnthropicProvider({ apiKey: workKey }),
    "claude-personal": new AnthropicProvider({ apiKey: personalKey }),
  },
});

const workModels = await bridge.listModels({ provider: "claude-work" });
const personalModels = await bridge.listModels({ provider: "claude-personal" });
```

The names in `bridge.providers()` and `response.provider` are registry names, so these two accounts remain distinguishable.

## Direct adapter construction

Constructing an adapter explicitly opts into that provider. Unlike the factory, a directly constructed `OllamaProvider` falls back to `http://localhost:11434` if neither config nor environment supplies a URL. Direct OpenAI and Anthropic adapters initialize their SDK clients on first use and use the SDK's environment URL fallback. Cloud Ollama requires a key.

Inject `fetch` to use a custom transport or mock network requests in tests. Explicitly constructed adapters retain their environment fallbacks; use the factory when you want connections captured at startup.

JSON server configuration, default HTTP dialects, model aliases, and account metadata endpoints belong to the separate `@productivehub/ai-gateway-api` wrapper. The bridge library itself accepts provider and dialect objects and opens no listening socket.
