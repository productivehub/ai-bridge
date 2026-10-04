# @productivehub/router

An extensible AI router with its own provider-neutral `router` dialect. Providers only speak this baseline. Every call returns a `RouterResponse`; use `res.toDialect(name)` when you need another response shape.

Created and maintained by [Segev Shmueli](https://github.com/segevsh) (`@segevsh`) as part of [productiveHub](https://github.com/productivehub).

## Getting started

The package uses ESM and requires Node.js 22 or later. From a standalone checkout:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

When used in the `phub-director` monorepo, run `pnpm install` from that repository's root. A workspace consumer can add `"@productivehub/router": "workspace:*"` to its dependencies.

Configure the API key or local server URL for the providers you inject; see [connection settings](#connection-settings) below.

```ts
import {
  createRouter,
  createBuiltInProviders,
  openaiDialect,
  anthropicDialect,
  ollamaDialect,
} from "@productivehub/router";

const router = createRouter({
  providers: createBuiltInProviders({
    ollama: { baseURL: "http://localhost:11434" },
  }),
  dialects: {
    openai: openaiDialect,
    anthropic: anthropicDialect,
    ollama: ollamaDialect,
  },
});

const res = await router.complete({
  provider: "ollama",
  model: "llama3.2",
  input: {
    maxOutputTokens: 1024,
    messages: [{ role: "user", content: "Summarise this repo in one line." }],
  },
});

res.output;                       // RouterOutput: full canonical response
res.usage;                        // RouterUsage: inclusive token counts and details
res.raw;                          // Untouched provider response
res.meta;                         // startedAt / endedAt (UTC ISO 8601), durationMs
const claude = res.toDialect("anthropic"); // Anthropic.Messages.Message
const openai = res.toDialect("openai");   // OpenAI.Chat.Completions.ChatCompletion
const native = res.toDialect("ollama");   // OllamaOutput
res.toDialect("router");                 // Same object as res.output
```

Only injected providers and dialects are available. The `router` baseline dialect is intrinsic. Registries belong to each instance; there is no global registration state. Names and native input/output types are inferred from the objects passed at startup.

Providers are lightweight until first use. OpenAI and Anthropic load their SDKs lazily. Ollama and Ollama Cloud share the native `/api/chat` implementation. Calls are non-streaming and do not retry automatically.

## Native input, canonical response

If a dialect includes `toBaseline`, it also accepts native input. Output remains canonical regardless of input dialect:

```ts
const res = await router.complete({
  provider: "ollama",
  model: "llama3.2",
  dialect: "anthropic",
  input: {
    max_tokens: 1024,
    messages: [{ role: "user", content: "Hello." }],
  },
});
const message = res.toDialect("openai");
```

Omit `dialect` for canonical input. The built-in OpenAI and Anthropic dialects support native input; the Ollama dialect is a response converter.

## Baseline features and conversion limits

`src/baseline.ts` defines SDK-independent contracts for:

- Text, image and document sources, audio input, and refusals.
- Function tools, calls and results, including result errors.
- Thinking text, replay signatures and redacted thinking blocks.
- Prompt cache controls, structured JSON output, reasoning controls, multiple candidates, and stop reasons.
- Inclusive token counts, cache reads/writes and TTL breakdowns, reasoning/audio/prediction token details, and server-tool usage.
- Ollama runtime settings, model residency and provider timings.
- Native extension fields and content/tool blocks for features without a portable equivalent.

This is a richer internal representation, not a guarantee that every provider supports every feature. Built-in request converters throw `UnsupportedFeatureError` for features they cannot express. Native extensions are sent only to their matching API; foreign native extensions are rejected.

Response projections return the target schema and can omit fields it cannot represent: for example, an OpenAI Chat Completions response has no signed Anthropic thinking blocks. The full information remains in `res.output` and `res.raw`. Converting multiple candidates into a single-message dialect throws rather than silently selecting one. Invalid tool argument JSON also throws when a target requires parsed JSON.

Unreported token counts are `null` in canonical usage. OpenAI projection can omit its optional usage block; Anthropic projection throws if required counts are unavailable. Anthropic prompt token totals include uncached input, cache reads and cache writes; output counts include thinking tokens. Projected schemas may require synthesized fields: for example, OpenAI `created` uses conversion time when the source reports no creation timestamp.

Anthropic uses `maxOutputTokens` or a default of 4096 for its required `max_tokens`. Provider-native options without portable equivalents can be placed in `input.extensions`, keyed by wire API name, e.g. `{ openai: { logprobs: true } }`.

## Custom providers and dialects

No central provider or dialect union needs editing. A provider implements one method returning canonical output and its untouched native response. A dialect needs only a response converter:

```ts
import type {
  ProviderAdapter, ProviderRequest, ProviderResponse, RouterOutput,
} from "@productivehub/router";

class MyProvider implements ProviderAdapter {
  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    // Call your API, map its reply into RouterOutput, and return { output, raw }.
    return callMyAPI(req);
  }
}

const customRouter = createRouter({
  providers: { "my-server": new MyProvider() },
  dialects: {
    summary: {
      fromBaseline(output: RouterOutput) {
        return { id: output.id, choices: output.choices, tokens: output.usage.totalTokens };
      },
    },
  },
});

const res = await customRouter.complete({
  provider: "my-server",
  model: "my-model",
  input: { messages: [{ role: "user", content: "Hello." }] },
});
const summary = res.toDialect("summary"); // Inferred return type, no cast
```

`callMyAPI` above represents the consumer's API integration. Add an optional `toBaseline(input)` method to a custom dialect when it should also accept its own request shape. A response-only dialect cannot be used as a request dialect.

You may inject just the built-ins you use, or give an adapter your own registry name:

```ts
import { OpenAIProvider } from "@productivehub/router/providers";

const privateRouter = createRouter({
  providers: {
    "private-api": new OpenAIProvider({
      baseURL: "https://my-compatible-server.example/v1",
      apiKey: "...",
    }),
  },
});
```

## Connection settings

Built-in providers accept `apiKey`, `baseURL`, `fetch`, and `timeoutMs`. Explicit settings take precedence over environment variables. Injecting `fetch` supports custom transports and tests.

| Provider | Key fallback | Base URL fallback |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | SDK `OPENAI_BASE_URL`, then OpenAI's default |
| Anthropic | `ANTHROPIC_API_KEY` | SDK `ANTHROPIC_BASE_URL`, then Anthropic's default |
| Ollama | Optional `OLLAMA_API_KEY` | `OLLAMA_BASE_URL`, then `http://localhost:11434` |
| Ollama Cloud | `OLLAMA_CLOUD_API_KEY`, then `OLLAMA_API_KEY` | `OLLAMA_CLOUD_BASE_URL`, then `https://ollama.com` |

For Ollama, use the server root or `/api` as `baseURL`. Cloud requires a key; local Ollama does not. No hosted-provider credential is reused for local Ollama.

## Develop

```sh
pnpm -F @productivehub/router typecheck
pnpm -F @productivehub/router test
pnpm -F @productivehub/router build
```

Tests use injected transports and make no external API calls. See [architecture notes](./docs/ARCHITECTURE.md) for the design.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, implementation conventions and validation. Project ownership and contributor credits are listed in [AUTHORS.md](./AUTHORS.md).

## License

Licensed under the [MIT license](./LICENSE). Copyright © 2026 Segev Shmueli.
