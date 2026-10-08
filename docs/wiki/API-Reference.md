# API Reference

The root module `@productivehub/ai-bridge` exports the bridge factory, contracts, built-in provider classes, dialect services, and bridge errors. Provider and dialect exports are also available through `@productivehub/ai-bridge/providers` and `@productivehub/ai-bridge/dialects`.

## Bridge creation and methods

| API | Result |
| --- | --- |
| `createBridge({ providers, dialects? })` | A bridge with instance-local registries; provider and dialect names are inferred |
| `bridge.complete({ provider, model, input, dialect? })` | `Promise<BridgeResponse>` using canonical output |
| `bridge.listModels({ provider })` | `Promise<BridgeModelsResponse>` using canonical model metadata |
| `bridge.getAllowance({ provider })` | `Promise<BridgeAllowanceResponse>` for providers that implement the optional allowance method |
| `bridge.providers()` | Registered provider/account names |
| `bridge.dialects()` | Registered dialect names, including intrinsic `bridge` |
| `createBuiltInProviders(config?, env?)` | Adapters for enabled built-in connections |
| `resolveBuiltInProviderConfig(config?, env?)` | Enabled connection settings, including credentials |

See [Configuration](./Configuration.md) for startup settings. Provider names and native dialect names are not hardcoded unions in the core contract. Both registries are captured at creation; there is no global registration API.

## Completion response

| Field | Type / meaning |
| --- | --- |
| `provider` | Registered provider/account name |
| `model` | Requested provider model identifier |
| `dialect` | Always `"bridge"` |
| `output` | `BridgeOutput` |
| `usage` | Canonical `BridgeUsage`, also available as `output.usage` |
| `raw` | Native provider response |
| `meta` | `BridgeResponseMeta` |
| `toDialect(name)` | Synchronous projection; return type inferred from the registered dialect |

`BridgeOutput` includes `id`, `model`, optional `createdAt`, `choices`, `usage`, and optional namespaced `extensions`. Each choice includes an assistant message and a canonical finish reason.

`BridgeUsage` includes `inputTokens`, `outputTokens`, and `totalTokens`; unknown counts are `null`. Optional fields retain cache reads/writes, cache TTL breakdowns, reasoning, audio, predictions, service information, server-tool usage, and provider timings. Input/output counts are inclusive; Anthropic input includes ordinary input plus cache reads and writes, and reasoning is a subset of output tokens.

## Request timing

`BridgeResponseMeta` contains UTC ISO 8601 `startedAt` and `endedAt`, plus monotonic elapsed `durationMs`. This measures the bridge call. Provider inference timings are separate and may appear under `usage.timings`; native Ollama durations are converted to milliseconds.

Model discovery uses the same timing envelope. Model creation/modification timestamps describe the model and are independent of request timing. Allowance reads use the same timing envelope, and their native payloads stay in `raw` without the key.

## Extension contracts

| Contract | Required methods / fields |
| --- | --- |
| `ProviderAdapter` | `complete(ProviderRequest): Promise<ProviderResponse>`; optional `listModels(): Promise<ProviderModelsResponse>` and `getAllowance(): Promise<ProviderAllowanceResponse>` |
| `ProviderRequest` | `model`, canonical `input` |
| `ProviderResponse` | Canonical `output`, native `raw` |
| `DialectService<Input, Output>` | `fromBaseline(BridgeOutput): Output`; optional `toBaseline(Input): BridgeInput` |
| `ProviderModelsResponse` | `models: BridgeModel[]`, native list `raw` |
| `BridgeModelsResponse` | Provider model response plus `provider` and `meta` |
| `BridgeCost` | `currency`, `amount` in minor units |
| `ProviderAllowanceResponse` | `available` (`true`/`false`/`null`), `primary` window or `null`, `windows`, optional `usage`, native `raw` |
| `BridgeAllowanceResponse` | Provider allowance response plus `provider` and `meta` |
| `AllowanceWindow` | `id`, `kind` (`money` or `plan`), optional `label`, optional `limit`/`remaining`/`used` `BridgeCost`s, `remainingFraction` or `null`, optional `period`, native `raw` |
| `AllowanceUsage` | `from`/`until`, optional `requests`, `cost`, `tokens` and time `buckets` |

The complete [public types](https://github.com/productivehub/ai-bridge/blob/main/src/types.ts) and [baseline types](https://github.com/productivehub/ai-bridge/blob/main/src/baseline.ts) are the source of truth. See [Providers](./Providers.md), [Dialects](./Dialects.md), [Model Discovery](./Model-Discovery.md), and [Costs](./Costs.md) for examples.

## Errors

| Error | When it occurs |
| --- | --- |
| `BridgeError` | Bridge configuration or provider response problems; base class for bridge errors |
| `UnknownProviderError` | Requested adapter is absent; includes `provider` |
| `UnknownDialectError` | Requested converter is absent; includes `dialect` |
| `UnsupportedFeatureError` | A mapping cannot express a feature, a dialect is response-only, or an adapter lacks discovery or allowance (allowance uses `feature === "allowance"`); includes `target` and `feature` |
| `ProviderHttpError` | A provider returns a non-success HTTP response; includes `status`, native `body` and the provider name in the message (e.g. `DeepSeek returned HTTP 401`) |

OpenAI and Anthropic SDK errors and transport failures propagate to the caller. The library does not turn them into HTTP responses, retry them, or automatically select another provider.

The core library opens no server and has no HTTP status or endpoint contract. The separate AI gateway API wrapper provides those behaviors.
