/** SDK-free contracts. Provider and dialect names come from injected registries. */
import type { BridgeInput, BridgeOutput, BridgeUsage } from "./baseline.js";

export interface ProviderRequest {
  model: string;
  input: BridgeInput;
}

export interface ProviderResponse {
  output: BridgeOutput;
  /** Untouched wire response. */
  raw: unknown;
}

/** A monetary amount expressed in the currency's smallest denomination. */
export interface BridgeCost {
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** Non-negative integer in minor units: 250 means USD 2.50 when currency is "USD". */
  amount: number;
}

/** Model pricing. Omitted rates are unknown; an amount of zero means free. */
export interface BridgeModelCosts {
  /** Cost per 1,000,000 tokens, rather than per token. */
  inputPerMillionTokens?: BridgeCost;
  outputPerMillionTokens?: BridgeCost;
  cachedInputPerMillionTokens?: BridgeCost;
  cacheWritePerMillionTokens?: BridgeCost;
  /** Cost per request, when a separate request fee applies. */
  perRequest?: BridgeCost;
}

/** A provider-reported model; absent metadata is not inferred. */
export interface BridgeModel {
  id: string;
  name?: string;
  createdAt?: string;
  modifiedAt?: string;
  ownedBy?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  sizeBytes?: number;
  /** Optional pricing metadata, not a calculated charge for a completion. */
  costs?: BridgeModelCosts;
  /** Native model metadata, including capabilities without a canonical equivalent. */
  raw: unknown;
}

export interface ProviderModelsResponse {
  models: BridgeModel[];
  /** Native list payload(s). SDK page/client state must not be included. */
  raw: unknown;
}

export interface ListModelsRequest<P extends string = string> {
  provider: P;
}

export interface BridgeResponseMeta {
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface BridgeModelsResponse extends ProviderModelsResponse {
  provider: string;
  meta: BridgeResponseMeta;
}

/** Providers only communicate their API into the bridge baseline. */
export interface ProviderAdapter {
  complete(req: ProviderRequest): Promise<ProviderResponse>;
  /** Optional so completion-only custom adapters remain compatible. */
  listModels?(): Promise<ProviderModelsResponse>;
}

/** A response-only dialect needs only fromBaseline; input conversion is optional. */
export interface DialectService<Input = BridgeInput, Output = unknown> {
  toBaseline?(input: Input): BridgeInput;
  fromBaseline(output: BridgeOutput): Output;
}

export type ProviderRegistry = Readonly<Record<string, ProviderAdapter>>;
export type DialectRegistry = Readonly<Record<string, DialectService<never, unknown>>>;
export type DialectInput<T> = T extends { toBaseline(input: infer I): BridgeInput } ? I : never;
export type DialectOutput<T> = T extends { fromBaseline(output: BridgeOutput): infer O } ? O : never;

export type BridgeRequest<P extends string = string, D extends DialectRegistry = DialectRegistry> =
  | { provider: P; model: string; input: BridgeInput; dialect?: undefined }
  | { [K in keyof D & string]: { provider: P; model: string; dialect: K; input: DialectInput<D[K]> } }[keyof D & string];

export interface BridgeResponse<D extends DialectRegistry = DialectRegistry> {
  provider: string;
  model: string;
  readonly dialect: "bridge";
  output: BridgeOutput;
  usage: BridgeUsage;
  raw: unknown;
  /** Bridge-observed timestamps and monotonic elapsed duration. */
  meta: BridgeResponseMeta;
  /** Native response projection. Full information remains in output/raw. */
  toDialect<K extends keyof D & string>(dialect: K): DialectOutput<D[K]>;
}

/** Common connection options for built-ins; custom providers may define their own. */
export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export interface BridgeConfig<P extends ProviderRegistry = ProviderRegistry, D extends DialectRegistry = DialectRegistry> {
  providers: P;
  dialects?: D;
}
