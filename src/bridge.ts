import { BridgeError, UnknownDialectError, UnknownProviderError, UnsupportedFeatureError } from "./errors.js";
import { bridgeDialect } from "./dialects/bridge.js";
import type { BridgeInput } from "./baseline.js";
import type {
  DialectInput, DialectOutput, DialectRegistry, DialectService, ProviderRegistry,
  BridgeRequest, BridgeConfig, BridgeResponse, ListModelsRequest, BridgeModelsResponse,
} from "./types.js";

type WithBaseline<D extends DialectRegistry> = D & { bridge: typeof bridgeDialect };

export interface Bridge<P extends ProviderRegistry = ProviderRegistry, D extends DialectRegistry = DialectRegistry> {
  complete(req: BridgeRequest<keyof P & string, WithBaseline<D>>): Promise<BridgeResponse<WithBaseline<D>>>;
  listModels(req: ListModelsRequest<keyof P & string>): Promise<BridgeModelsResponse>;
  providers(): (keyof P & string)[];
  dialects(): (keyof WithBaseline<D> & string)[];
}

/** Startup injection creates isolated registries; there is no shared global state. */
export function createBridge<const P extends ProviderRegistry, const D extends DialectRegistry = {}>(config: BridgeConfig<P, D>): Bridge<P, D> {
  const providers = new Map(Object.entries(config.providers));
  if (config.dialects && "bridge" in config.dialects) throw new BridgeError('"bridge" is the built-in baseline dialect');
  const dialects = new Map<string, DialectService<never, unknown>>([
    ["bridge", bridgeDialect], ...Object.entries(config.dialects ?? {}),
  ]);

  function service(name: string): DialectService<unknown, unknown> {
    const value = dialects.get(name);
    if (!value) throw new UnknownDialectError(name);
    return value as DialectService<unknown, unknown>;
  }

  return {
    async listModels(req) {
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const provider = providers.get(req.provider);
      if (!provider) throw new UnknownProviderError(req.provider);
      if (!provider.listModels) throw new UnsupportedFeatureError(req.provider, "model discovery");
      const result = await provider.listModels();
      return {
        provider: req.provider, models: result.models, raw: result.raw,
        meta: { startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - start },
      };
    },
    async complete(req) {
      const startedAt = new Date().toISOString();
      const start = performance.now();
      const provider = providers.get(req.provider);
      if (!provider) throw new UnknownProviderError(req.provider);
      let input: BridgeInput;
      if (req.dialect === undefined) input = req.input as BridgeInput;
      else {
        const converter = service(req.dialect);
        if (!converter.toBaseline) throw new UnsupportedFeatureError(req.dialect, "input conversion (response-only dialect)");
        input = converter.toBaseline(req.input as DialectInput<typeof converter>);
      }
      const result = await provider.complete({ model: req.model, input });
      const response: BridgeResponse<WithBaseline<D>> = {
        provider: req.provider, model: req.model, dialect: "bridge",
        output: result.output, usage: result.output.usage, raw: result.raw,
        meta: { startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - start },
        toDialect<K extends keyof WithBaseline<D> & string>(name: K): DialectOutput<WithBaseline<D>[K]> {
          return service(name).fromBaseline(response.output) as DialectOutput<WithBaseline<D>[K]>;
        },
      };
      return response;
    },
    providers: () => [...providers.keys()] as (keyof P & string)[],
    dialects: () => [...dialects.keys()] as (keyof WithBaseline<D> & string)[],
  };
}
