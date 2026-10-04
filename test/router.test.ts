import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createRouter, UnknownProviderError, UnknownDialectError, UnsupportedFeatureError, RouterError, openaiDialect, anthropicDialect } from "../src/index.js";
import type { ProviderAdapter, RouterInput, RouterOutput, RouterResponse, DialectService } from "../src/index.js";
import { baselineResponse } from "./fixtures.js";

function fakeProvider(): ProviderAdapter {
  return { complete: vi.fn(async () => ({ output: baselineResponse(), raw: { original: true } })) };
}

describe("startup injection", () => {
  it("rejects an unknown provider without a global registry", async () => {
    const router = createRouter({ providers: {} });
    // Runtime calls from JavaScript still receive a clear error.
    await expect(router.complete({ provider: "missing" as never, model: "test-model", input: { messages: [] } })).rejects.toBeInstanceOf(UnknownProviderError);
  });

  it("routes custom names and keeps instances isolated", async () => {
    const fake = fakeProvider();
    const first = createRouter({ providers: { "my-model-server": fake } });
    const second = createRouter({ providers: {} });
    const input: RouterInput = { messages: [{ role: "user", content: "hi" }] };
    const res = await first.complete({ provider: "my-model-server", model: "test-model", input });
    expect(fake.complete).toHaveBeenCalledWith({ model: "test-model", input });
    expect(first.providers()).toEqual(["my-model-server"]);
    expect(second.providers()).toEqual([]);
    expect(res.dialect).toBe("router");
    expect(res.usage).toBe(res.output.usage);
    expect(res.raw).toEqual({ original: true });
    expect(res.toDialect("router")).toBe(res.output);
    expect(Date.parse(res.meta.startedAt)).toBeLessThanOrEqual(Date.parse(res.meta.endedAt));
    expect(res.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("converts requests before calling a provider that only speaks baseline", async () => {
    const fake = fakeProvider();
    const router = createRouter({ providers: { custom: fake }, dialects: { anthropic: anthropicDialect } });
    await router.complete({ provider: "custom", model: "test-model", dialect: "anthropic", input: { max_tokens: 20, messages: [{ role: "user", content: "hi" }] } });
    expect(fake.complete).toHaveBeenCalledWith({ model: "test-model", input: expect.objectContaining({ maxOutputTokens: 20, messages: [expect.objectContaining({ role: "user", content: "hi" })] }) });
  });

  it("supports custom input and output types with inferred toDialect return types", async () => {
    const custom = {
      toBaseline: (input: { prompt: string }): RouterInput => ({ messages: [{ role: "user", content: input.prompt }] }),
      fromBaseline: (output: RouterOutput) => ({ answer: output.id, tokens: output.usage.totalTokens }),
    } satisfies DialectService<{ prompt: string }, { answer: string; tokens: number | null }>;
    const router = createRouter({ providers: { custom: fakeProvider() }, dialects: { "my-format": custom } });
    const res = await router.complete({ provider: "custom", model: "test-model", dialect: "my-format", input: { prompt: "hi" } });
    const converted = res.toDialect("my-format");
    expectTypeOf(converted).toEqualTypeOf<{ answer: string; tokens: number | null }>();
    expect(converted).toEqual({ answer: "test-1", tokens: 14 });
    expect(router.dialects()).toEqual(["router", "my-format"]);
  });

  it("supports response-only dialects and conversions detached from the response", async () => {
    const compact = { fromBaseline: (output: RouterOutput) => output.id };
    const router = createRouter({ providers: { custom: fakeProvider() }, dialects: { compact } });
    const res = await router.complete({ provider: "custom", model: "test-model", input: { messages: [] } });
    const convert = res.toDialect;
    expect(convert("compact")).toBe("test-1");
    await expect(router.complete({ provider: "custom", model: "test-model", dialect: "compact", input: {} as never })).rejects.toBeInstanceOf(UnsupportedFeatureError);
    expect(() => res.toDialect("missing" as never)).toThrow(UnknownDialectError);
  });

  it("does not convert until asked and does not mutate the canonical output", async () => {
    const converter = vi.fn((output: RouterOutput) => output.id);
    const router = createRouter({ providers: { custom: fakeProvider() }, dialects: { simple: { fromBaseline: converter }, openai: openaiDialect, anthropic: anthropicDialect } });
    const res = await router.complete({ provider: "custom", model: "test-model", input: { messages: [] } });
    expect(converter).not.toHaveBeenCalled();
    const before = structuredClone(res.output);
    expect(res.toDialect("openai").choices[0]?.message.content).toBe("hello");
    expect(res.toDialect("anthropic").content[0]).toMatchObject({ type: "text", text: "hello" });
    res.toDialect("simple");
    expect(converter).toHaveBeenCalledOnce();
    expect(res.output).toEqual(before);
  });

  it("reserves the router name for the canonical dialect", () => {
    expect(() => createRouter({ providers: {}, dialects: { router: { fromBaseline: () => "other" } } })).toThrow(RouterError);
  });

  it("measures elapsed time independently of wall-clock adjustments", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValueOnce(145);
    try {
      const router = createRouter({ providers: { custom: { async complete() {
        vi.setSystemTime(new Date("2026-10-04T11:59:59Z"));
        return { output: baselineResponse(), raw: null };
      } } } });
      const res = await router.complete({ provider: "custom", model: "test-model", input: { messages: [] } });
      expect(res.meta).toEqual({ startedAt: "2026-10-04T12:00:00.000Z", endedAt: "2026-10-04T11:59:59.000Z", durationMs: 45 });
    } finally { clock.mockRestore(); vi.useRealTimers(); }
  });
});

/** Compile-time regression checks: tsc checks this function; it is never called. */
async function checkTypes() {
  const router = createRouter({ providers: { custom: fakeProvider() }, dialects: { openai: openaiDialect, anthropic: anthropicDialect, simple: { fromBaseline: (output: RouterOutput) => output.id } } });
  const res = await router.complete({ provider: "custom", model: "test-model", input: { messages: [] } });
  const genericResponse: RouterResponse = res;
  void genericResponse;
  expectTypeOf(res.toDialect("simple")).toEqualTypeOf<string>();
  // @ts-expect-error Provider keys come from startup injection.
  await router.complete({ provider: "unregistered", model: "test-model", input: { messages: [] } });
  // @ts-expect-error Anthropic inputs require max_tokens.
  await router.complete({ provider: "custom", model: "test-model", dialect: "anthropic", input: { messages: [] } });
  // @ts-expect-error Unknown dialects are not permitted.
  res.toDialect("unregistered");
  // @ts-expect-error Response-only dialects do not accept input.
  await router.complete({ provider: "custom", model: "test-model", dialect: "simple", input: {} });
}
void checkTypes;
