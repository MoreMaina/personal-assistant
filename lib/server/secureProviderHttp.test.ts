import { EventEmitter } from "node:events";
import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

import { secureOpenAICompatibleRequest } from "./secureProviderHttp";

type FakeResponse = EventEmitter & {
  statusCode: number;
  headers: Record<string, string>;
  destroy: ReturnType<typeof vi.fn>;
};

function setupHttpsResponse(options?: {
  status?: number;
  body?: string;
  contentType?: string;
  location?: string;
}) {
  let capturedOptions: RequestOptions | undefined;

  const response = Object.assign(new EventEmitter(), {
    statusCode: options?.status ?? 200,
    headers: {
      "content-type": options?.contentType ?? "application/json",
      ...(options?.location ? { location: options.location } : {}),
    },
    destroy: vi.fn(),
  }) as FakeResponse;

  const request = Object.assign(new EventEmitter(), {
    setTimeout: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    destroy: vi.fn(),
  });

  vi.mocked(httpsRequest).mockImplementation(((
    requestOptions: RequestOptions,
    callback: (response: FakeResponse) => void,
  ) => {
    capturedOptions = requestOptions;

    request.end.mockImplementation(() => {
      callback(response);
      response.emit("data", Buffer.from(options?.body ?? '{"ok":true}'));
      response.emit("end");
      return request;
    });

    return request as never;
  }) as never);

  return {
    request,
    response,
    getOptions: () => capturedOptions,
  };
}

const validInput = {
  baseUrl: "https://api.example-provider.com/v1",
  apiKey: "test-secret-not-for-logging",
  path: "/models" as const,
};

describe("secure provider HTTPS requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(lookup).mockImplementation((async () => [
      { address: "8.8.8.8", family: 4 },
    ]) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid or disallowed URLs before making a request", async () => {
    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        baseUrl: "http://api.example-provider.com",
      }),
    ).rejects.toThrow(/base URL is invalid or disallowed/i);

    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized API keys before DNS lookup", async () => {
    await expect(
      secureOpenAICompatibleRequest({ ...validInput, apiKey: " " }),
    ).rejects.toThrow(/API key is empty or invalid/i);

    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        apiKey: "x".repeat(8193),
      }),
    ).rejects.toThrow(/API key is empty or invalid/i);

    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects disallowed method and path combinations", async () => {
    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        method: "POST",
      }),
    ).rejects.toThrow(/operation is not allowed/i);

    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        path: "/chat/completions",
        method: "GET",
      }),
    ).rejects.toThrow(/operation is not allowed/i);

    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects missing and oversized POST request bodies", async () => {
    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        path: "/chat/completions",
        method: "POST",
      }),
    ).rejects.toThrow(/body is missing or too large/i);

    await expect(
      secureOpenAICompatibleRequest({
        ...validInput,
        path: "/chat/completions",
        method: "POST",
        body: "x".repeat(128_001),
      }),
    ).rejects.toThrow(/body is missing or too large/i);

    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects DNS results containing any non-public address", async () => {
    vi.mocked(lookup).mockImplementationOnce((async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ]) as never);

    await expect(
      secureOpenAICompatibleRequest(validInput),
    ).rejects.toThrow(/exclusively to public IP addresses/i);

    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("handles DNS resolution failures without making an HTTPS request", async () => {
    vi.mocked(lookup).mockImplementationOnce((async () => {
      throw new Error("simulated DNS failure");
    }) as never);

    await expect(
      secureOpenAICompatibleRequest(validInput),
    ).rejects.toThrow(/hostname could not be resolved/i);

    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("pins DNS, verifies TLS, and sends credentials only to the configured host", async () => {
    const mock = setupHttpsResponse({
      body: '{"data":[]}',
    });

    const result = await secureOpenAICompatibleRequest({
      ...validInput,
      baseUrl: "https://api.example-provider.com/v1/",
      path: "/chat/completions",
      method: "POST",
      body: '{"model":"test-model"}',
    });

    expect(result.status).toBe(200);
    expect(result.contentType).toBe("application/json");
    expect(result.body).toBe('{"data":[]}');

    const options = mock.getOptions();
    expect(options?.hostname).toBe("api.example-provider.com");
    expect(options?.path).toBe("/v1/chat/completions");
    expect(options?.servername).toBe("api.example-provider.com");
    expect(options?.rejectUnauthorized).toBe(true);
    expect(options?.lookup).toEqual(expect.any(Function));
    expect(options?.headers).toMatchObject({
      Authorization: "Bearer test-secret-not-for-logging",
      "Content-Type": "application/json",
    });

    expect(mock.request.write).toHaveBeenCalledWith(
      '{"model":"test-model"}',
      "utf8",
    );
  });

  it("returns redirect responses without following their locations", async () => {
    setupHttpsResponse({
      status: 302,
      body: "",
      location: "https://other.example/collect",
    });

    const result = await secureOpenAICompatibleRequest(validInput);

    expect(result.status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects responses exceeding the configured size limit", async () => {
    setupHttpsResponse({ body: "x".repeat(256_001) });

    await expect(
      secureOpenAICompatibleRequest(validInput),
    ).rejects.toThrow(/response exceeded the allowed size/i);
  });
});
