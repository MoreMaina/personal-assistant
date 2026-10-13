import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import {
  isPubliclyRoutableIp,
  normalizeAIProviderBaseUrl,
} from "@/lib/aiProviderConfig";

const MAX_RESPONSE_BYTES = 256_000;
const MAX_REQUEST_BODY_BYTES = 128_000;

export type OpenAICompatiblePath = "/models" | "/chat/completions";

export type SecureProviderResponse = {
  status: number;
  contentType: string;
  body: string;
};

type SecureProviderRequest = {
  baseUrl: string;
  apiKey: string;
  path: OpenAICompatiblePath;
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
export async function secureOpenAICompatibleRequest(
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
  if (
    (input.path === "/models" && method !== "GET") ||
    (input.path === "/chat/completions" && method !== "POST")
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
  target.pathname =
    `${target.pathname.replace(/\/+$/, "")}${input.path}`;
  target.search = "";
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
    Authorization: `Bearer ${input.apiKey}`,
  };

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
