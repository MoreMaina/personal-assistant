import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_AI_PROVIDER_PROFILES,
  normalizeAIProviderBaseUrl,
  normalizeAIProviderModelId,
  normalizeAIProviderModels,
  normalizeAIProviderName,
} from "@/lib/aiProviderConfig";
import { encryptAIProviderApiKey } from "@/lib/server/aiProviderCrypto";


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

async function readJson(request: Request): Promise<unknown | null> {
  try {
    const raw = await request.text();
    if (!raw || raw.length > 24_000) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function profileSummary(row: RecordValue, hasApiKey = true) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    models: Array.isArray(row.models)
      ? row.models.filter((item): item is string => typeof item === "string")
      : [],
    selectedModel: typeof row.selected_model === "string"
      ? row.selected_model
      : null,
    enabled: row.enabled === true,
    hasApiKey,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return reply({ error: "Please sign in to manage AI providers." }, 401);
  }

  const { data, error } = await supabase
    .from("user_ai_provider_profiles")
    .select("id,name,base_url,models,selected_model,enabled,encrypted_api_key,created_at,updated_at")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return reply({
      error: "Provider profiles could not be loaded. Confirm that the provider database migration has been applied.",
    }, 503);
  }

  const profiles = (data ?? []).map((row) =>
    profileSummary(row as unknown as RecordValue, Boolean(row.encrypted_api_key)),
  );

  return reply({ profiles });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin provider changes are not allowed." }, 403);
  }

  const body = await readJson(request);
  if (!isRecord(body)) {
    return reply({ error: "Send a valid provider configuration." }, 400);
  }

  const name = normalizeAIProviderName(body.name);
  const baseUrl = normalizeAIProviderBaseUrl(body.baseUrl);
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const models = normalizeAIProviderModels(body.models ?? []);

  const selectedModel =
    body.selectedModel === undefined || body.selectedModel === null ||
    body.selectedModel === ""
      ? null
      : normalizeAIProviderModelId(body.selectedModel);

  const enabled = body.enabled === undefined ? true : body.enabled;

  if (!name) return reply({ error: "Enter a provider name of up to 80 characters." }, 400);
  if (!baseUrl) {
    return reply({
      error: "Enter an HTTPS base URL on a public hostname, without credentials, query parameters, or a fragment.",
    }, 400);
  }
  if (!apiKey.trim() || apiKey.length > 8192) {
    return reply({ error: "Enter a valid provider API key." }, 400);
  }
  if (!models) return reply({ error: "The model list is invalid or too large." }, 400);
  if (body.selectedModel !== undefined && body.selectedModel !== null &&
      body.selectedModel !== "" && !selectedModel) {
    return reply({ error: "The selected model ID is invalid." }, 400);
  }
  if (selectedModel && !models.includes(selectedModel)) {
    return reply({ error: "Choose a model from the configured model list." }, 400);
  }
  if (typeof enabled !== "boolean") {
    return reply({ error: "The enabled value must be true or false." }, 400);
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return reply({ error: "Please sign in to manage AI providers." }, 401);
  }

  const { count, error: countError } = await supabase
    .from("user_ai_provider_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", authData.user.id);

  if (countError) {
    return reply({
      error: "Provider profiles are unavailable. Confirm the database migration is applied.",
    }, 503);
  }
  if ((count ?? 0) >= MAX_AI_PROVIDER_PROFILES) {
    return reply({
      error: `You can save up to ${MAX_AI_PROVIDER_PROFILES} provider profiles.`,
    }, 409);
  }

  let encryptedApiKey: string;
  try {
    encryptedApiKey = encryptAIProviderApiKey(apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return reply({
      error: message.includes("not configured")
        ? message
        : "The provider credential could not be encrypted.",
    }, 503);
  }

  const { data, error } = await supabase
    .from("user_ai_provider_profiles")
    .insert({
      user_id: authData.user.id,
      name,
      base_url: baseUrl,
      encrypted_api_key: encryptedApiKey,
      models,
      selected_model: selectedModel,
      enabled,
    })
    .select("id,name,base_url,models,selected_model,enabled,created_at,updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "A provider with that name already exists." }, 409);
    }
    return reply({ error: "The provider profile could not be saved." }, 503);
  }

  return reply({
    profile: profileSummary(data as unknown as RecordValue, true),
  }, 201);
}
