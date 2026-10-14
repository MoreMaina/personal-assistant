import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isAIProviderProfileId,
  normalizeAIProviderBaseUrl,
  normalizeAIProviderModels,
} from "@/lib/aiProviderConfig";
import { decryptAIProviderApiKey } from "@/lib/server/aiProviderCrypto";
import { secureOpenAICompatibleRequest } from "@/lib/server/secureProviderHttp";


type RecordValue = Record<string, unknown>;

function reply(body: RecordValue, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin provider requests are not allowed." }, 403);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return reply({ error: "Could not read the provider request." }, 400);
  }

  if (rawBody.length > 12_000) {
    return reply({ error: "The provider request is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return reply({ error: "Send a valid JSON provider request." }, 400);
  }

  if (!isRecord(body)) {
    return reply({ error: "Provider details are required." }, 400);
  }

  const savedProfileId =
    body.profileId === undefined
      ? null
      : isAIProviderProfileId(body.profileId)
        ? body.profileId
        : null;

  if (body.profileId !== undefined && !savedProfileId) {
    return reply({ error: "Invalid saved provider profile ID." }, 400);
  }

  if (savedProfileId && (
    body.baseUrl !== undefined || body.apiKey !== undefined
  )) {
    return reply({
      error: "Use either a saved provider profile or a temporary URL and key, not both.",
    }, 400);
  }

  let baseUrl: string | null = null;
  let apiKey = "";

  if (!savedProfileId) {
    baseUrl = normalizeAIProviderBaseUrl(body.baseUrl);
    apiKey = typeof body.apiKey === "string" ? body.apiKey : "";

    if (!baseUrl) {
      return reply({
        error: "Enter an HTTPS provider URL on a public hostname, without credentials, query parameters, or a fragment.",
      }, 400);
    }
    if (!apiKey.trim() || apiKey.length > 8192) {
      return reply({ error: "Enter a valid provider API key." }, 400);
    }
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return reply({ error: "Please sign in to test a provider." }, 401);
  }

  if (savedProfileId) {
    const { data: profile, error: profileError } = await supabase
      .from("user_ai_provider_profiles")
      .select("base_url,encrypted_api_key")
      .eq("id", savedProfileId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      return reply({ error: "The saved provider profile could not be loaded." }, 503);
    }
    if (!profile) {
      return reply({ error: "Saved provider profile not found." }, 404);
    }

    baseUrl = normalizeAIProviderBaseUrl(profile.base_url);
    try {
      apiKey = decryptAIProviderApiKey(profile.encrypted_api_key);
    } catch {
      return reply({
        error: "The saved provider credential could not be decrypted. Confirm AI_PROVIDER_ENCRYPTION_KEY is configured and unchanged.",
      }, 503);
    }

    if (!baseUrl || !apiKey) {
      return reply({ error: "The saved provider profile is invalid." }, 503);
    }
  }

  if (!baseUrl || !apiKey.trim()) {
    return reply({ error: "Provider connection details are incomplete." }, 400);
  }

  let upstream;
  try {
    upstream = await secureOpenAICompatibleRequest({
      baseUrl,
      apiKey,
      path: "/models",
      method: "GET",
      timeoutMs: 12_000,
    });
  } catch {
    return reply({
      error: "Could not safely connect to that provider. Check its HTTPS URL, DNS configuration, and network availability.",
    }, 502);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return reply({
      error: "This provider redirects requests. Redirects are blocked for security; use its final HTTPS API URL.",
    }, 502);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return reply({
      error: "The provider rejected the key or does not permit model-list access. If it supports chat completions without model discovery, you can add model IDs manually.",
    }, 400);
  }
  if (upstream.status === 429) {
    return reply({ error: "The provider rate-limited this request. Try again later." }, 429);
  }
  if (upstream.status < 200 || upstream.status >= 300) {
    return reply({
      error: `Provider model discovery failed (HTTP ${upstream.status}).`,
    }, 502);
  }
  if (!upstream.contentType.toLowerCase().includes("json")) {
    return reply({ error: "The provider did not return JSON from its models endpoint." }, 502);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(upstream.body) as unknown;
  } catch {
    return reply({ error: "The provider returned malformed JSON." }, 502);
  }

  if (!isRecord(payload)) {
    return reply({ error: "The provider returned an unexpected model-list format." }, 502);
  }

  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : null;

  if (!rawModels) {
    return reply({ error: "No compatible model list was found. Enter model IDs manually." }, 502);
  }

  const models = normalizeAIProviderModels(rawModels.slice(0, 100));
  if (!models) {
    return reply({ error: "The provider returned invalid model IDs." }, 502);
  }

  // The supplied credential is never persisted or reflected in the response.
  return reply({
    models,
    truncated: rawModels.length > 100,
    providerLabel: new URL(baseUrl).hostname,
  });
}
