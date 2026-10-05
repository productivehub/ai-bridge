# API Reference

The root module `@productivehub/router` exports the router factory, contracts, built-in provider classes, dialect services, and router errors. Provider and dialect exports are also available through `@productivehub/router/providers` and `@productivehub/router/dialects`.

## Router creation and methods

| API | Result |
| --- | --- |
| `createRouter({ providers, dialects? })` | A router with instance-local registries; provider and dialect names are inferred |
| `router.complete({ provider, model, input, dialect? })` | `Promise<RouterResponse>` using canonical output |
| `router.listModels({ provider })` | `Promise<RouterModelsResponse>` using canonical model metadata |
| `router.providers()` | Registered provider/account names |
| `router.dialects()` | Registered dialect names, including intrinsic `router` |
| `createBuiltInProviders(config?, env?)` | Adapters for enabled built-in connections |
| `resolveBuiltInProviderConfig(config?, env?)` | Enabled connection settings, including credentials |

See [Configuration](./Configuration.md) for startup settings. Provider names and native dialect names are not hardcoded unions in the core contract. Both registries are captured at creation; there is no global registration API.

## Completion response

| Field | Type / meaning |
| --- | --- |
| `provider` | Registered provider/account name |
| `model` | Requested provider model identifier |
| `dialect` | Always `"router"` |
| `output` | `RouterOutput` |
| `usage` | Canonical `RouterUsage`, also available as `output.usage` |
| `raw` | Native provider response |
| `meta` | `RouterResponseMeta` |
| `toDialect(name)` | Synchronous projection; return type inferred from the registered dialect |

`RouterOutput` includes `id`, `model`, optional `createdAt`, `choices`, `usage`, and optional namespaced `extensions`. Each choice includes an assistant message and a canonical finish reason.

`RouterUsage` includes `inputTokens`, `outputTokens`, and `totalTokens`; unknown counts are `null`. Optional fields retain cache reads/writes, cache TTL breakdowns, reasoning, audio, predictions, service information, server-tool usage, and provider timings. Input/output counts are inclusive; Anthropic input includes ordinary input plus cache reads and writes, and reasoning is a subset of output tokens.

`RouteResponse` remains a deprecated alias for `RouterResponse`.

## Request timing

`RouterResponseMeta` contains UTC ISO 8601 `startedAt` and `endedAt`, plus monotonic elapsed `durationMs`. This measures the router call. Provider inference timings are separate and may appear under `usage.timings`; native Ollama durations are converted to milliseconds.

Model discovery uses the same timing envelope. Model creation/modification timestamps describe the model and are independent of request timing.

## Extension contracts

| Contract | Required methods / fields |
| --- | --- |
| `ProviderAdapter` | `complete(ProviderRequest): Promise<ProviderResponse>`; optional `listModels(): Promise<ProviderModelsResponse>` |
| `ProviderRequest` | `model`, canonical `input` |
| `ProviderResponse` | Canonical `output`, native `raw` |
| `DialectService<Input, Output>` | `fromBaseline(RouterOutput): Output`; optional `toBaseline(Input): RouterInput` |
| `ProviderModelsResponse` | `models: RouterModel[]`, native list `raw` |
| `RouterModelsResponse` | Provider model response plus `provider` and `meta` |
| `RouterCost` | `currency`, `amount` in minor units |

The complete [public types](https://github.com/productivehub/router/blob/main/src/types.ts) and [baseline types](https://github.com/productivehub/router/blob/main/src/baseline.ts) are the source of truth. See [Providers](./Providers.md), [Dialects](./Dialects.md), [Model Discovery](./Model-Discovery.md), and [Costs](./Costs.md) for examples.

## Errors

| Error | When it occurs |
| --- | --- |
| `RouterError` | Router configuration or provider response problems; base class for router errors |
| `UnknownProviderError` | Requested adapter is absent; includes `provider` |
| `UnknownDialectError` | Requested converter is absent; includes `dialect` |
| `UnsupportedFeatureError` | A mapping cannot express a feature, a dialect is response-only, or an adapter lacks discovery; includes `target` and `feature` |
| `ProviderHttpError` | Ollama returns a non-success HTTP response; includes `status` and native `body` |

OpenAI and Anthropic SDK errors and transport failures propagate to the caller. The library does not turn them into HTTP responses, retry them, or automatically select another provider.

The core library opens no server and has no HTTP status or endpoint contract. The separate router API wrapper provides those behaviors.
