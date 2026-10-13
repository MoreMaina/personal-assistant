import { describe, expect, it, vi } from "vitest";
import {
  fetchGeminiWithRetries,
  type GeminiRetryOptions,
} from "./geminiRetry";

function makeOptions(
  overrides: Partial<GeminiRetryOptions> = {},
): GeminiRetryOptions {
  return {
    isDailyPlan: true,
    mode: "daily-plan",
    model: "gemini-3.1-flash-lite",
    logDiagnostic: vi.fn(),
    sleep: vi.fn(async () => undefined),
    random: () => 0,
    ...overrides,
  };
}

describe("fetchGeminiWithRetries", () => {
  it("retries a daily-plan 503 and returns the successful response", async () => {
    const responses = [
      new Response("busy", { status: 503 }),
      new Response("ok", { status: 200 }),
    ];
    const request = vi.fn(async (): Promise<Response> => {
      const response = responses.shift();
      if (!response) throw new Error("Unexpected extra request");
      return response;
    });
    const sleep = vi.fn(async () => undefined);
    const logDiagnostic = vi.fn();

    const result = await fetchGeminiWithRetries(request, makeOptions({
      sleep,
      logDiagnostic,
    }));

    expect(result.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
    expect(logDiagnostic).toHaveBeenCalledTimes(1);

    const [label, details] = logDiagnostic.mock.calls[0];
    expect(label).toBe("[assistant Gemini retry]");
    expect(JSON.parse(details)).toMatchObject({
      mode: "daily-plan",
      model: "gemini-3.1-flash-lite",
      httpStatus: 503,
      retry: 1,
      delayMs: 500,
    });
  });

  it("stops after two retries when every daily-plan request returns 503", async () => {
    const request = vi.fn(async (): Promise<Response> =>
      new Response("busy", { status: 503 })
    );
    const delays: number[] = [];
    const diagnostics: string[] = [];

    const result = await fetchGeminiWithRetries(request, makeOptions({
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
      logDiagnostic: (_label, details) => {
        diagnostics.push(details);
      },
    }));

    expect(result.status).toBe(503);
    expect(request).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
    expect(diagnostics).toHaveLength(2);
    expect(JSON.parse(diagnostics[1])).toMatchObject({
      retry: 2,
      delayMs: 1000,
    });
  });

  it("does not retry a 503 for non-planner requests", async () => {
    const request = vi.fn(async (): Promise<Response> =>
      new Response("busy", { status: 503 })
    );
    const sleep = vi.fn(async () => undefined);
    const logDiagnostic = vi.fn();

    const result = await fetchGeminiWithRetries(request, makeOptions({
      isDailyPlan: false,
      mode: "chat",
      sleep,
      logDiagnostic,
    }));

    expect(result.status).toBe(503);
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(logDiagnostic).not.toHaveBeenCalled();
  });

  it("does not retry a daily-plan quota error", async () => {
    const request = vi.fn(async (): Promise<Response> =>
      new Response("quota", { status: 429 })
    );
    const sleep = vi.fn(async () => undefined);

    const result = await fetchGeminiWithRetries(request, makeOptions({ sleep }));

    expect(result.status).toBe(429);
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry a rejected network request", async () => {
    const request = vi.fn(async (): Promise<Response> => {
      throw new Error("network failure");
    });

    await expect(fetchGeminiWithRetries(request, makeOptions()))
      .rejects.toThrow("network failure");

    expect(request).toHaveBeenCalledTimes(1);
  });
});
