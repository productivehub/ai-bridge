import { RouterError, UnknownDialectError, UnknownProviderError, UnsupportedFeatureError } from "./errors.js";
import { routerDialect } from "./dialects/router.js";
import type { RouterInput } from "./baseline.js";
import type {
  DialectInput, DialectOutput, DialectRegistry, DialectService, ProviderRegistry,
  RouteRequest, RouterConfig, RouterResponse, ListModelsRequest, RouterModelsResponse,
} from "./types.js";

type WithBaseline<D extends DialectRegistry> = D & { router: typeof routerDialect };

export interface Router<P extends ProviderRegistry = ProviderRegistry, D extends DialectRegistry = DialectRegistry> {
  complete(req: RouteRequest<keyof P & string, WithBaseline<D>>): Promise<RouterResponse<WithBaseline<D>>>;
  listModels(req: ListModelsRequest<keyof P & string>): Promise<RouterModelsResponse>;
  providers(): (keyof P & string)[];
  dialects(): (keyof WithBaseline<D> & string)[];
}

/** Startup injection creates isolated registries; there is no shared global state. */
export function createRouter<const P extends ProviderRegistry, const D extends DialectRegistry = {}>(config: RouterConfig<P, D>): Router<P, D> {
  const providers = new Map(Object.entries(config.providers));
  if (config.dialects && "router" in config.dialects) throw new RouterError('"router" is the built-in baseline dialect');
  const dialects = new Map<string, DialectService<never, unknown>>([
    ["router", routerDialect], ...Object.entries(config.dialects ?? {}),
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
      let input: RouterInput;
      if (req.dialect === undefined) input = req.input as RouterInput;
      else {
        const converter = service(req.dialect);
        if (!converter.toBaseline) throw new UnsupportedFeatureError(req.dialect, "input conversion (response-only dialect)");
        input = converter.toBaseline(req.input as DialectInput<typeof converter>);
      }
      const result = await provider.complete({ model: req.model, input });
      const response: RouterResponse<WithBaseline<D>> = {
        provider: req.provider, model: req.model, dialect: "router",
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
