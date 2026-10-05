# Router

`@productivehub/router` is an in-process TypeScript library for calling AI providers through a shared, provider-neutral contract. It is a [productiveHub](https://github.com/productivehub) project created and maintained by [Segev Shmueli](https://github.com/segevsh) (`@segevsh`), licensed under [MIT](https://github.com/productivehub/router/blob/main/LICENSE).

Providers translate between their API and the router baseline. Dialects translate between the baseline and a caller's desired format. A provider is registered once, independently of the response dialects you use.

Completions return `RouterResponse`, with canonical output, token usage, native response data, and request timing. Call `response.toDialect(name)` to project that result into another registered dialect without making a second provider request.

## Start here

| Page | Covers |
| --- | --- |
| [Getting Started](./Getting-Started.md) | Local setup and a first completion |
| [Configuration](./Configuration.md) | Credentials, environment settings, and named accounts |
| [Providers](./Providers.md) | Built-in adapters and custom provider integration |
| [Dialects](./Dialects.md) | Canonical input, native input, and response conversion |
| [Model Discovery](./Model-Discovery.md) | Querying consistent provider model catalogs |
| [Costs](./Costs.md) | Optional prices, currencies, and minor units |
| [API Reference](./API-Reference.md) | Public methods, types, timing, and errors |
| [Maintaining the Wiki](./Maintaining-the-Wiki.md) | Editing and publishing these pages |

The current implementation supports non-streaming chat. Supported features depend on the selected provider; unsupported conversions fail explicitly. Streaming, embeddings, automatic retries and fallbacks, response caching, and charge calculation are not implemented.

The authoritative contracts live in [src/types.ts](https://github.com/productivehub/router/blob/main/src/types.ts) and [src/baseline.ts](https://github.com/productivehub/router/blob/main/src/baseline.ts). See the [architecture notes](https://github.com/productivehub/router/blob/main/docs/ARCHITECTURE.md) for design decisions.
