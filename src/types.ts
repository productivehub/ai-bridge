/** SDK-free contracts. Provider and dialect names come from injected registries. */
import type { RouterInput, RouterOutput, RouterUsage } from "./baseline.js";

export interface ProviderRequest {
  model: string;
  input: RouterInput;
}

export interface ProviderResponse {
  output: RouterOutput;
  /** Untouched wire response. */
  raw: unknown;
}

/** Providers only communicate their API into the router baseline. */
export interface ProviderAdapter {
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

/** A response-only dialect needs only fromBaseline; input conversion is optional. */
export interface DialectService<Input = RouterInput, Output = unknown> {
  toBaseline?(input: Input): RouterInput;
  fromBaseline(output: RouterOutput): Output;
}

export type ProviderRegistry = Readonly<Record<string, ProviderAdapter>>;
export type DialectRegistry = Readonly<Record<string, DialectService<never, unknown>>>;
export type DialectInput<T> = T extends { toBaseline(input: infer I): RouterInput } ? I : never;
export type DialectOutput<T> = T extends { fromBaseline(output: RouterOutput): infer O } ? O : never;

export type RouteRequest<P extends string = string, D extends DialectRegistry = DialectRegistry> =
  | { provider: P; model: string; input: RouterInput; dialect?: undefined }
  | { [K in keyof D & string]: { provider: P; model: string; dialect: K; input: DialectInput<D[K]> } }[keyof D & string];

export interface RouterResponse<D extends DialectRegistry = DialectRegistry> {
  provider: string;
  model: string;
  readonly dialect: "router";
  output: RouterOutput;
  usage: RouterUsage;
  raw: unknown;
  /** Router-observed timestamps and monotonic elapsed duration. */
  meta: { startedAt: string; endedAt: string; durationMs: number };
  /** Native response projection. Full information remains in output/raw. */
  toDialect<K extends keyof D & string>(dialect: K): DialectOutput<D[K]>;
}

/** @deprecated Use RouterResponse. */
export type RouteResponse<D extends DialectRegistry = DialectRegistry> = RouterResponse<D>;

/** Common connection options for built-ins; custom providers may define their own. */
export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface RouterConfig<P extends ProviderRegistry = ProviderRegistry, D extends DialectRegistry = DialectRegistry> {
  providers: P;
  dialects?: D;
}
