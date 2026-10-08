# Dialects

The `bridge` dialect is the canonical baseline. It is defined independently of vendor SDKs and includes common chat features plus provider-specific information that can be retained through tagged blocks and namespaced extensions.

Providers communicate through this baseline. Dialects convert caller input into the baseline or project canonical output into the caller's requested format.

## Built-in dialects

| Name | Native request conversion | Response projection |
| --- | --- | --- |
| `bridge` | Canonical input | Canonical output, returned unchanged |
| `openai` | OpenAI Chat Completions input | OpenAI Chat Completions response |
| `anthropic` | Anthropic Messages input | Anthropic Messages response |
| `ollama` | Response-only dialect | Native Ollama chat response |

The bridge baseline is intrinsic. Inject `openaiDialect`, `anthropicDialect`, or `ollamaDialect` under the names you want to expose. Dialect names do not have to match provider names.

## Convert a response

```ts
import {
  createBridge,
  OllamaProvider,
  anthropicDialect,
  openaiDialect,
} from "@productivehub/ai-bridge";

const bridge = createBridge({
  providers: { local: new OllamaProvider({ baseURL: "http://localhost:11434" }) },
  dialects: { anthropic: anthropicDialect, openai: openaiDialect },
});

const response = await bridge.complete({
  provider: "local",
  model: "llama3.2",
  input: { messages: [{ role: "user", content: "Hello" }] },
});

const canonical = response.toDialect("bridge");
const anthropic = response.toDialect("anthropic");
const openai = response.toDialect("openai");
```

`toDialect` is synchronous and makes no network request. Its return type follows the registered dialect. Full information remains in `response.output` and `response.raw`.

## Accept native input

Set the request's `dialect` to a registered service with `toBaseline(input)`. Omit `dialect` for canonical input. The returned response still uses the bridge baseline; request conversion does not select the output projection.

For example, an Anthropic request uses `max_tokens` and Anthropic message blocks. The bridge converts these to canonical input before dispatching to the selected provider. A response-only dialect cannot be used as the input dialect.

## Add a custom response dialect

```ts
import { createBridge, OllamaProvider, type BridgeOutput } from "@productivehub/ai-bridge";

const bridge = createBridge({
  providers: { local: new OllamaProvider({ baseURL: "http://localhost:11434" }) },
  dialects: {
    summary: {
      fromBaseline(output: BridgeOutput) {
        return { id: output.id, choices: output.choices, usage: output.usage };
      },
    },
  },
});

const response = await bridge.complete({
  provider: "local",
  model: "llama3.2",
  input: { messages: [{ role: "user", content: "Hello" }] },
});
const summary = response.toDialect("summary");
```

A custom service needs `fromBaseline(output)`. Add `toBaseline(input)` when the service should also accept its own request shape.

## Conversion limits

The baseline retains thinking signatures, cache controls and accounting, tool calls and results, multimodal sources, reasoning settings, structured output, multiple candidates, and Ollama runtime settings and timings. Support for sending those features depends on the provider.

Built-in request converters throw `UnsupportedFeatureError` for unrepresentable features. Native extensions are sent only to the matching wire API. Response projections can omit fields absent from the target schema, but converting multiple candidates into a single-message schema throws rather than silently dropping candidates. Invalid tool argument JSON throws when the target requires parsed JSON.

Unknown token counts remain `null` in canonical usage. Anthropic projection throws if required usage counts are unknown; OpenAI projection can omit optional usage. Some native fields may be synthesized when the source lacks them, such as the OpenAI creation timestamp.
