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

/** A monetary amount expressed in the currency's smallest denomination. */
export interface RouterCost {
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** Non-negative integer in minor units: 250 means USD 2.50 when currency is "USD". */
  amount: number;
}

/** Model pricing. Omitted rates are unknown; an amount of zero means free. */
export interface RouterModelCosts {
  /** Cost per 1,000,000 tokens, rather than per token. */
  inputPerMillionTokens?: RouterCost;
  outputPerMillionTokens?: RouterCost;
  cachedInputPerMillionTokens?: RouterCost;
  cacheWritePerMillionTokens?: RouterCost;
  /** Cost per request, when a separate request fee applies. */
  perRequest?: RouterCost;
}

/** A provider-reported model; absent metadata is not inferred. */
export interface RouterModel {
  id: string;
  name?: string;
  createdAt?: string;
  modifiedAt?: string;
  ownedBy?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  sizeBytes?: number;
  /** Optional pricing metadata, not a calculated charge for a completion. */
  costs?: RouterModelCosts;
  /** Native model metadata, including capabilities without a canonical equivalent. */
  raw: unknown;
}

export interface ProviderModelsResponse {
  models: RouterModel[];
  /** Native list payload(s). SDK page/client state must not be included. */
  raw: unknown;
}

export interface ListModelsRequest<P extends string = string> {
  provider: P;
}

export interface RouterResponseMeta {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface RouterModelsResponse extends ProviderModelsResponse {
  provider: string;
  meta: RouterResponseMeta;
}

/** Providers only communicate their API into the router baseline. */
export interface ProviderAdapter {
  complete(req: ProviderRequest): Promise<ProviderResponse>;
  /** Optional so completion-only custom adapters remain compatible. */
  listModels?(): Promise<ProviderModelsResponse>;
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
  meta: RouterResponseMeta;
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
