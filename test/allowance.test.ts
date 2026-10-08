import { describe, expect, it } from "vitest";
import {
  createBridge, BridgeError, toMinorUnits, UnknownProviderError, UnsupportedFeatureError,
  OllamaProvider, OllamaCloudProvider, ProviderHttpError,
  type AllowanceWindow, type ProviderAdapter, type ProviderAllowanceResponse,
} from "../src/index.js";
import { baselineResponse } from "./fixtures.js";

describe("allowance types (A1)", () => {
  it("accepts a plan window with no money fields", () => {
    const w = {
      id: "weekly", kind: "plan", label: "Weekly, Opus", remainingFraction: 0.4,
      period: { resetsAt: "2026-10-12T00:00:00Z" },
    } satisfies AllowanceWindow;
    expect(w.kind).toBe("plan");
  });
  it("rejects an unknown kind", () => {
    // @ts-expect-error "credit" is not a valid kind
    const w: AllowanceWindow = { id: "x", kind: "credit", remainingFraction: null };
    expect(w.id).toBe("x");
  });
});

describe("Bridge.getAllowance (A2)", () => {
  const result: ProviderAllowanceResponse = { available: true, primary: null, windows: [], raw: { a: 1 } };
  const base = { complete: async () => ({ output: baselineResponse(), raw: {} }) } as unknown as ProviderAdapter;
  const bridge = createBridge({
    providers: { with: { ...base, getAllowance: async () => result }, without: base },
  });

  it("returns the adapter result plus provider and meta", async () => {
    const res = await bridge.getAllowance({ provider: "with" });
    expect(res).toMatchObject({ ...result, provider: "with" });
    expect(Date.parse(res.meta.startedAt)).not.toBeNaN();
    expect(Date.parse(res.meta.endedAt)).not.toBeNaN();
    expect(res.meta.durationMs).toBeGreaterThanOrEqual(0);
  });
  it("rejects when the adapter lacks getAllowance", async () => {
    const err = await bridge.getAllowance({ provider: "without" }).catch((e) => e);
    expect(err).toBeInstanceOf(UnsupportedFeatureError);
    expect(err.feature).toBe("allowance");
  });
  it("rejects an unknown provider", async () => {
    // @ts-expect-error not a registered provider
    await expect(bridge.getAllowance({ provider: "nope" })).rejects.toBeInstanceOf(UnknownProviderError);
  });
});

describe("toMinorUnits (A3)", () => {
  it("converts amounts to minor units", () => {
    expect(toMinorUnits("110.00")).toBe(11000);
    expect(toMinorUnits("1.005")).toBe(101);
    expect(toMinorUnits(6.28068)).toBe(628);
    expect(toMinorUnits(50.34109)).toBe(5034);
    expect(toMinorUnits(0.125)).toBe(13);
    expect(toMinorUnits(60)).toBe(6000);
    expect(toMinorUnits("1e-7")).toBe(0);
  });
  it("rounds half-up instead of in binary floating point", () => {
    expect(toMinorUnits("1.045")).toBe(105);
    expect(toMinorUnits(1.045)).toBe(105);
    expect(Math.round(1.005 * 100)).toBe(100);
  });
  it("honours fractionDigits and exponent forms", () => {
    expect(toMinorUnits("1.005", 3)).toBe(1005);
    expect(toMinorUnits("2.5e+3")).toBe(250000);
    expect(toMinorUnits("0")).toBe(0);
  });
  it.each(["abc", "", "  ", "NaN", "Infinity", "-1", "-0.01"])("rejects the string %o", (value) => {
    expect(() => toMinorUnits(value)).toThrow(BridgeError);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects the number %o", (value) => {
    expect(() => toMinorUnits(value)).toThrow(BridgeError);
  });
});

// Fixtures copied from .ai/projects/roadmap/usage/ENDPOINTS.md §Ollama Cloud.
const zero = { request_count: 0, usage_usd: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
const day = (n: number) => ({ from: `2026-10-0${n}T00:00:00Z`, until: `2026-10-0${n + 1}T00:00:00Z` });
const usageFixture = {
  range: "7d", scope: "self", granularity: "day",
  from: "2026-10-01T00:00:00Z", until: "2026-10-08T02:28:25.225567716Z",
  totals: { request_count: 1135, usage_usd: 6.28068, input_tokens: 6524206, cached_input_tokens: 1472064, output_tokens: 309963 },
  buckets: [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ ...day(n), ...zero })),
    { ...day(7), request_count: 1135, usage_usd: 6.28068, input_tokens: 6524206, cached_input_tokens: 1472064, output_tokens: 309963 },
    { from: "2026-10-08T00:00:00Z", until: "2026-10-08T02:28:25.225567716Z", partial: true, ...zero },
  ],
};
const balanceFixture = {
  included: { balance_usd: 50.34109, allowance_usd: 60, period: { from: "2026-09-28T13:46:39Z", until: "2026-10-28T13:46:39Z" } },
  purchased: { balance_usd: 0 },
};

function transport(replies: Record<string, { body: unknown; status?: number }>) {
  const calls: Request[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    calls.push(req);
    const reply = replies[new URL(req.url).pathname];
    if (!reply) throw new Error(`Unexpected request ${req.url}`);
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

describe("OllamaCloudProvider.getAllowance (A4)", () => {
  const ok = { "/api/balance": { body: balanceFixture }, "/api/usage": { body: usageFixture } };

  it("maps the balance and usage fixtures", async () => {
    const t = transport(ok);
    const res = await new OllamaCloudProvider({ apiKey: "secret-key", fetch: t.fetch }).getAllowance();
    const [included, purchased] = res.windows;
    expect(res.available).toBeNull();
    expect(res.primary?.id).toBe("included");
    expect(res.windows).toHaveLength(2);
    expect(included).toMatchObject({
      id: "included", kind: "money", limit: { currency: "USD", amount: 6000 }, remaining: { currency: "USD", amount: 5034 },
      period: { from: "2026-09-28T13:46:39Z", until: "2026-10-28T13:46:39Z" },
    });
    expect(included?.remainingFraction).toBeCloseTo(50.34109 / 60, 3);
    expect(purchased).toMatchObject({ id: "purchased", kind: "money", remaining: { currency: "USD", amount: 0 }, remainingFraction: null });
    expect(purchased?.limit).toBeUndefined();
    expect(res.usage).toMatchObject({
      from: "2026-10-01T00:00:00Z", until: "2026-10-08T02:28:25.225567716Z", requests: 1135, cost: { currency: "USD", amount: 628 },
      tokens: { inputTokens: 6524206, outputTokens: 309963, cachedInputTokens: 1472064 },
    });
    expect(res.usage?.buckets).toHaveLength(8);
    expect(res.usage?.buckets?.[6]).toMatchObject({ requests: 1135, cost: { amount: 628 } });
    expect(res.usage?.buckets?.[6]?.partial).toBeUndefined();
    expect(res.usage?.buckets?.[7]).toMatchObject({ partial: true, requests: 0, cost: { amount: 0 } });
    expect(res.raw).toEqual({ balance: balanceFixture, usage: usageFixture });
    expect(JSON.stringify(res.raw)).not.toContain("secret-key");
  });

  it("sends the bearer key on both GETs", async () => {
    const t = transport(ok);
    await new OllamaCloudProvider({ apiKey: "secret-key", fetch: t.fetch }).getAllowance();
    expect(t.calls.map((c) => [c.method, new URL(c.url).pathname]).sort()).toEqual([["GET", "/api/balance"], ["GET", "/api/usage"]]);
    for (const c of t.calls) expect(c.headers.get("authorization")).toBe("Bearer secret-key");
  });

  it("surfaces a 401 as ProviderHttpError", async () => {
    const t = transport({ ...ok, "/api/balance": { body: { error: "unauthorized" }, status: 401 } });
    const err = await new OllamaCloudProvider({ apiKey: "k", fetch: t.fetch }).getAllowance().catch((e) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect(err.status).toBe(401);
  });

  it("gives a null fraction when the allowance is 0", async () => {
    const t = transport({ ...ok, "/api/balance": { body: { ...balanceFixture, included: { ...balanceFixture.included, allowance_usd: 0 } } } });
    const res = await new OllamaCloudProvider({ apiKey: "k", fetch: t.fetch }).getAllowance();
    expect(res.windows[0]?.remainingFraction).toBeNull();
  });

  it("clamps the fraction to [0,1]", async () => {
    const t = transport({ ...ok, "/api/balance": { body: { ...balanceFixture, included: { ...balanceFixture.included, balance_usd: 90 } } } });
    const res = await new OllamaCloudProvider({ apiKey: "k", fetch: t.fetch }).getAllowance();
    expect(res.windows[0]?.remainingFraction).toBe(1);
  });

  it.each([
    ["balance without included", { "/api/balance": { body: { purchased: { balance_usd: 0 } } } }],
    ["usage without buckets", { "/api/usage": { body: { ...usageFixture, buckets: undefined } } }],
    ["non-numeric totals", { "/api/usage": { body: { ...usageFixture, totals: { ...usageFixture.totals, usage_usd: "x" } } } }],
  ])("rejects a malformed body: %s", async (_name, override) => {
    const t = transport({ ...ok, ...override });
    await expect(new OllamaCloudProvider({ apiKey: "k", fetch: t.fetch }).getAllowance()).rejects.toBeInstanceOf(BridgeError);
  });

  it("is not offered by local Ollama", () => {
    expect("getAllowance" in new OllamaProvider()).toBe(false);
    expect("getAllowance" in new OllamaCloudProvider({ apiKey: "k" })).toBe(true);
  });
});
