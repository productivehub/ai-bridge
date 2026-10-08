import { describe, expect, it } from "vitest";
import {
  createBridge, BridgeError, toMinorUnits, UnknownProviderError, UnsupportedFeatureError,
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
