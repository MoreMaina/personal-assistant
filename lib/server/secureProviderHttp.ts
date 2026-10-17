import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { Readable } from "node:stream";
import {
  isPubliclyRoutableIp,
  normalizeAIProviderBaseUrl,
  normalizeAIProviderModelId,
} from "@/lib/aiProviderConfig";

const MAX_RESPONSE_BYTES = 256_000;
const MAX_REQUEST_BODY_BYTES = 128_000;
const MAX_STREAM_RESPONSE_BYTES = 20 * 1024 * 1024;

export type OpenAICompatiblePath = "/models" | "/chat/completions";

export type SecureProviderPath =
  | OpenAICompatiblePath
  | "/google/models"
  | "/google/generate-content"
  | "/elevenlabs/models"
  | "/elevenlabs/voices";

export type SecureProviderResponse = {
  status: number;
  contentType: string;
  body: string;
};

export type SecureProviderRequest = {
  baseUrl: string;
  apiKey: string;
  path: SecureProviderPath;
  model?: string;
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
};

/**
 * Makes a pinned HTTPS request to a user-configured OpenAI-compatible host.
 *
 * Every DNS answer must be globally routable. The socket lookup is pinned to
 * a previously checked address, TLS verification remains enabled, redirects
 * are never followed, and response bodies are bounded.
 */
async function secureProviderRequest(
  input: SecureProviderRequest,
): Promise<SecureProviderResponse> {
  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl);
  if (!baseUrl) {
    throw new Error("The provider base URL is invalid or disallowed.");
  }

  if (
    typeof input.apiKey !== "string" ||
    !input.apiKey.trim() ||
    input.apiKey.length > 8192
  ) {
    throw new Error("The provider API key is empty or invalid.");
  }

  const method = input.method ?? "GET";
  const isModelsRequest =
    input.path === "/models" ||
    input.path === "/google/models" ||
    input.path === "/elevenlabs/models" ||
    input.path === "/elevenlabs/voices";
  const isGoogleGenerationRequest =
    input.path === "/google/generate-content";

  if (
    (isModelsRequest && method !== "GET") ||
    (input.path === "/chat/completions" && method !== "POST") ||
    (isGoogleGenerationRequest && method !== "POST") ||
    (
      !isModelsRequest &&
      input.path !== "/chat/completions" &&
      !isGoogleGenerationRequest
    )
  ) {
    throw new Error("The requested provider operation is not allowed.");
  }

  const requestBody = input.body;
  if (
    method === "POST" &&
    (typeof requestBody !== "string" ||
      Buffer.byteLength(requestBody, "utf8") > MAX_REQUEST_BODY_BYTES)
  ) {
    throw new Error("The provider request body is missing or too large.");
  }

  const target = new URL(baseUrl);
  const googleModel =
    typeof input.model === "string"
      ? input.model.replace(/^models\//, "")
      : "";

  if (
    isGoogleGenerationRequest &&
    (
      !normalizeAIProviderModelId(googleModel) ||
      /[/:]/.test(googleModel)
    )
  ) {
    throw new Error("The Google generation model ID is invalid.");
  }

  // Typed first-party protocols must use their canonical HTTPS origin
  // and API base path so credentials cannot be sent to another hostname.
  if (
    isGoogleGenerationRequest &&
    (
      target.hostname !== "generativelanguage.googleapis.com" ||
      target.pathname.replace(/\/+$/, "") !== "/v1beta"
    )
  ) {
    throw new Error(
      "Google generation must use the canonical Google API host and /v1beta path.",
    );
  }

  if (
    input.path === "/google/models" &&
    (
      target.hostname !== "generativelanguage.googleapis.com" ||
      target.pathname.replace(/\/+$/, "") !== "/v1beta"
    )
  ) {
    throw new Error(
      "Google model discovery must use the canonical Google API host and /v1beta path.",
    );
  }

  if (
    (
      input.path === "/elevenlabs/models" ||
      input.path === "/elevenlabs/voices"
    ) &&
    (
      target.hostname !== "api.elevenlabs.io" ||
      target.pathname.replace(/\/+$/, "") !== "/v1"
    )
  ) {
    throw new Error(
      "ElevenLabs model discovery must use the canonical ElevenLabs API host and /v1 path.",
    );
  }

  const isElevenLabsVoicesRequest = input.path === "/elevenlabs/voices";
  const endpointPath =
    input.path === "/google/models" ||
    input.path === "/elevenlabs/models"
      ? "/models"
      : isGoogleGenerationRequest
        ? `/models/${encodeURIComponent(googleModel)}:generateContent`
        : input.path;

  target.pathname = isElevenLabsVoicesRequest
    ? "/v2/voices"
    : `${target.pathname.replace(/\/+$/, "")}${endpointPath}`;
  target.search = isElevenLabsVoicesRequest
    ? "?page_size=100&include_total_count=false"
    : "";
  target.hash = "";

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(target.hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("The provider hostname could not be resolved.");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPubliclyRoutableIp(address))
  ) {
    throw new Error(
      "The provider hostname must resolve exclusively to public IP addresses.",
    );
  }

  const preferred = addresses.find((address) => address.family === 4)
    ?? addresses[0];

  const pinnedLookup = ((
    _hostname: string,
    options: unknown,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    const lookupOptions =
      options && typeof options === "object"
        ? options as { all?: boolean; family?: number }
        : {};

    const selected =
      typeof lookupOptions.family === "number" && lookupOptions.family !== 0
        ? addresses.find(
            (address) => address.family === lookupOptions.family,
          ) ?? preferred
        : preferred;

    if (lookupOptions.all) {
      callback(null, [{ address: selected.address, family: selected.family }]);
    } else {
      callback(null, selected.address, selected.family);
    }
  }) as NonNullable<RequestOptions["lookup"]>;

  const timeoutMs = Math.max(
    1000,
    Math.min(input.timeoutMs ?? 12_000, 45_000),
  );

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (
    input.path === "/google/models" ||
    input.path === "/google/generate-content"
  ) {
    headers["x-goog-api-key"] = input.apiKey;
  } else if (
    input.path === "/elevenlabs/models" ||
    input.path === "/elevenlabs/voices"
  ) {
    headers["xi-api-key"] = input.apiKey;
  } else {
    headers.Authorization = `Bearer ${input.apiKey}`;
  }

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }

  return new Promise<SecureProviderResponse>((resolve, reject) => {
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.hostname,
        port: target.port || 443,
        method,
        path: `${target.pathname}${target.search}`,
        headers,
        lookup: pinnedLookup,
        servername: target.hostname,
        rejectUnauthorized: true,
        maxHeaderSize: 16_384,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let receivedBytes = 0;

        response.on("data", (chunk: Buffer | string) => {
          if (settled) return;

          const bytes = Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(chunk);
          receivedBytes += bytes.byteLength;

          if (receivedBytes > MAX_RESPONSE_BYTES) {
            fail("The provider response exceeded the allowed size.");
            response.destroy();
            request.destroy();
            return;
          }

          chunks.push(bytes);
        });

        response.on("error", () => {
          fail("The provider response could not be read.");
        });

        response.on("end", () => {
          if (settled) return;
          settled = true;

          const rawContentType = response.headers["content-type"];
          resolve({
            status: response.statusCode ?? 502,
            contentType:
              typeof rawContentType === "string" ? rawContentType : "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Provider request timed out."));
    });

    request.on("error", () => {
      fail("The provider HTTPS request failed or timed out.");
    });

    if (method === "POST" && requestBody !== undefined) {
      request.write(requestBody, "utf8");
    }

    // Node's HTTPS client does not follow redirects. Any 3xx response is
    // returned to the caller for rejection; credentials never reach its target.
    request.end();
  });
}


/**
 * Secure requests used by the Google and ElevenLabs protocol adapters.
 * The request path is a closed set; callers cannot supply arbitrary paths.
 */
export async function secureProviderHttpRequest(
  input: SecureProviderRequest,
): Promise<SecureProviderResponse> {
  return secureProviderRequest(input);
}

/**
 * Backward-compatible entry point for existing OpenAI-compatible callers.
 */
export async function secureOpenAICompatibleRequest(
  input: Omit<SecureProviderRequest, "path"> & {
    path: OpenAICompatiblePath;
  },
): Promise<SecureProviderResponse> {
  return secureProviderRequest(input);
}


export type SecureProviderStreamPath =
  | "/google/stream-generate-content"
  | "/elevenlabs/tts";

export type SecureProviderStreamRequest = {
  baseUrl: string;
  apiKey: string;
  path: SecureProviderStreamPath;
  model?: string;
  voiceId?: string;
  body: string;
  timeoutMs?: number;
};

export type SecureProviderStreamResponse = {
  status: number;
  contentType: string;
  body: ReadableStream<Uint8Array>;
};

/**
 * Makes a pinned HTTPS request for first-party streaming speech operations.
 * The upstream response remains streamed; redirects are not followed and
 * the total response size is bounded.
 */
export async function secureProviderHttpStream(
  input: SecureProviderStreamRequest,
): Promise<SecureProviderStreamResponse> {
  const baseUrl = normalizeAIProviderBaseUrl(input.baseUrl);
  if (!baseUrl) {
    throw new Error("The provider base URL is invalid or disallowed.");
  }

  if (
    typeof input.apiKey !== "string" ||
    !input.apiKey.trim() ||
    input.apiKey.length > 8192
  ) {
    throw new Error("The provider API key is empty or invalid.");
  }

  if (
    typeof input.body !== "string" ||
    Buffer.byteLength(input.body, "utf8") > MAX_REQUEST_BODY_BYTES
  ) {
    throw new Error("The provider request body is missing or too large.");
  }

  const target = new URL(baseUrl);
  const isGoogle = input.path === "/google/stream-generate-content";
  let endpointPath: string;
  let endpointQuery: string;

  if (isGoogle) {
    const model =
      typeof input.model === "string"
        ? input.model.replace(/^models\//, "")
        : "";

    if (
      !normalizeAIProviderModelId(model) ||
      /[/:]/.test(model)
    ) {
      throw new Error("The Google generation model ID is invalid.");
    }

    if (
      target.hostname !== "generativelanguage.googleapis.com" ||
      target.pathname.replace(/\/+$/, "") !== "/v1beta"
    ) {
      throw new Error(
        "Google streaming must use the canonical Google API host and /v1beta path.",
      );
    }

    endpointPath =
      `/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent`;
    endpointQuery = "?alt=sse";
  } else {
    const model =
      typeof input.model === "string"
        ? input.model
        : "";
    const voiceId =
      typeof input.voiceId === "string"
        ? input.voiceId
        : "";

    if (
      !normalizeAIProviderModelId(model) ||
      /[/:]/.test(model)
    ) {
      throw new Error("The ElevenLabs speech model ID is invalid.");
    }

    if (!/^[A-Za-z0-9_-]{1,128}$/.test(voiceId)) {
      throw new Error("The ElevenLabs voice ID is invalid.");
    }

    if (
      target.hostname !== "api.elevenlabs.io" ||
      target.pathname.replace(/\/+$/, "") !== "/v1"
    ) {
      throw new Error(
        "ElevenLabs streaming must use the canonical host and /v1 path.",
      );
    }

    endpointPath =
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;
    endpointQuery = "?output_format=pcm_24000";
  }

  target.pathname = endpointPath;
  target.search = endpointQuery;
  target.hash = "";

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(target.hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("The provider hostname could not be resolved.");
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPubliclyRoutableIp(address))
  ) {
    throw new Error(
      "The provider hostname must resolve exclusively to public IP addresses.",
    );
  }

  const preferred = addresses.find(({ family }) => family === 4)
    ?? addresses[0];

  const pinnedLookup = ((
    _hostname: string,
    options: unknown,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | Array<{ address: string; family: number }>,
      family?: number,
    ) => void,
  ) => {
    const lookupOptions =
      options && typeof options === "object"
        ? options as { all?: boolean; family?: number }
        : {};

    const selected =
      typeof lookupOptions.family === "number" && lookupOptions.family !== 0
        ? addresses.find(
            ({ family }) => family === lookupOptions.family,
          ) ?? preferred
        : preferred;

    if (lookupOptions.all) {
      callback(null, [{ address: selected.address, family: selected.family }]);
    } else {
      callback(null, selected.address, selected.family);
    }
  }) as NonNullable<RequestOptions["lookup"]>;

  const timeoutMs = Math.max(
    1000,
    Math.min(input.timeoutMs ?? 45_000, 60_000),
  );

  const headers: Record<string, string> = {
    Accept: isGoogle ? "text/event-stream" : "audio/*",
    "Content-Type": "application/json",
    ...(isGoogle
      ? { "x-goog-api-key": input.apiKey }
      : { "xi-api-key": input.apiKey }),
  };

  return new Promise<SecureProviderStreamResponse>((resolve, reject) => {
    let settled = false;

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.hostname,
        port: target.port || 443,
        method: "POST",
        path: `${target.pathname}${target.search}`,
        headers,
        lookup: pinnedLookup,
        servername: target.hostname,
        rejectUnauthorized: true,
        maxHeaderSize: 16_384,
      },
      (response) => {
        if (settled) {
          response.destroy();
          return;
        }

        settled = true;
        const rawContentType = response.headers["content-type"];
        const contentType =
          typeof rawContentType === "string" ? rawContentType : "";

        const source = Readable.toWeb(response) as ReadableStream<Uint8Array>;
        let receivedBytes = 0;
        const boundedBody = source.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              receivedBytes += chunk.byteLength;
              if (receivedBytes > MAX_STREAM_RESPONSE_BYTES) {
                throw new Error("The streamed provider response exceeded the allowed size.");
              }
              controller.enqueue(chunk);
            },
          }),
        );

        resolve({
          status: response.statusCode ?? 502,
          contentType,
          body: boundedBody,
        });
      },
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Provider streaming request timed out."));
    });

    request.on("error", () => {
      fail("The provider HTTPS streaming request failed or timed out.");
    });

    request.write(input.body, "utf8");
    request.end();
  });
}
