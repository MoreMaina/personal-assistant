import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAIProviderType } from "@/lib/aiProviderTypes";
import {
  isAIProviderProfileId,
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

function summary(row: RecordValue) {
  return {
    id: row.id,
    providerType: isAIProviderType(row.provider_type)
      ? row.provider_type
      : "openai_compatible",
    name: row.name,
    baseUrl: row.base_url,
    models: Array.isArray(row.models)
      ? row.models.filter((item): item is string => typeof item === "string")
      : [],
    speechModels: Array.isArray(row.speech_models)
      ? row.speech_models.filter((item): item is string => typeof item === "string")
      : [],
    selectedModel: typeof row.selected_model === "string"
      ? row.selected_model
      : null,
    enabled: row.enabled === true,
    hasApiKey: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin provider changes are not allowed." }, 403);
  }

  const { id } = await context.params;
  if (!isAIProviderProfileId(id)) {
    return reply({ error: "Invalid provider profile ID." }, 400);
  }

  const body = await readJson(request);
  if (!isRecord(body)) {
    return reply({ error: "Send a valid provider update." }, 400);
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

  const { data: existing, error: readError } = await supabase
    .from("user_ai_provider_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (readError) {
    return reply({ error: "The provider profile could not be loaded." }, 503);
  }
  if (!existing) return reply({ error: "Provider profile not found." }, 404);

  const current = existing as unknown as RecordValue;
  const updates: RecordValue = { updated_at: new Date().toISOString() };

  if (body.speechModels !== undefined) {
    const speechModels = normalizeAIProviderModels(body.speechModels);
    if (!speechModels) {
      return reply({
        error: "The speech model list is invalid or too large.",
      }, 400);
    }
    updates.speech_models = speechModels;
  }

  if (body.providerType !== undefined) {
    if (!isAIProviderType(body.providerType)) {
      return reply({ error: "Choose a supported API connection type." }, 400);
    }
    updates.provider_type = body.providerType;
  }

  const name = Object.prototype.hasOwnProperty.call(body, "name")
    ? normalizeAIProviderName(body.name)
    : current.name;
  if (!name) return reply({ error: "The provider name is invalid." }, 400);
  if (body.name !== undefined) updates.name = name;

  const baseUrl = Object.prototype.hasOwnProperty.call(body, "baseUrl")
    ? normalizeAIProviderBaseUrl(body.baseUrl)
    : current.base_url;
  if (!baseUrl) return reply({ error: "The provider base URL is invalid." }, 400);
  if (body.baseUrl !== undefined) updates.base_url = baseUrl;

  const models = body.models === undefined
    ? normalizeAIProviderModels(current.models)
    : normalizeAIProviderModels(body.models);
  if (!models) return reply({ error: "The model list is invalid or too large." }, 400);
  if (body.models !== undefined) updates.models = models;

  let selectedModel: string | null;
  if (
    body.selectedModel === undefined
  ) {
    selectedModel = typeof current.selected_model === "string"
      ? current.selected_model
      : null;
  } else if (body.selectedModel === null || body.selectedModel === "") {
    selectedModel = null;
  } else {
    selectedModel = normalizeAIProviderModelId(body.selectedModel);
    if (!selectedModel) {
      return reply({ error: "The selected model ID is invalid." }, 400);
    }
  }

  if (selectedModel && !models.includes(selectedModel)) {
    return reply({ error: "Choose a model from the configured model list." }, 400);
  }
  if (body.selectedModel !== undefined) updates.selected_model = selectedModel;

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return reply({ error: "The enabled value must be true or false." }, 400);
    }
    updates.enabled = body.enabled;
  }

  if (Object.prototype.hasOwnProperty.call(body, "apiKey")) {
    if (typeof body.apiKey !== "string" || !body.apiKey.trim() ||
        body.apiKey.length > 8192) {
      return reply({ error: "Enter a valid replacement API key." }, 400);
    }

    try {
      updates.encrypted_api_key = encryptAIProviderApiKey(body.apiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return reply({
        error: message.includes("not configured")
          ? message
          : "The provider credential could not be encrypted.",
      }, 503);
    }
  }

  const { data, error } = await supabase
    .from("user_ai_provider_profiles")
    .update(updates)
    .eq("id", id)
    .eq("user_id", authData.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return reply({ error: "A provider with that name already exists." }, 409);
    }
    if (error.code === "42703" || error.code === "PGRST204") {
      return reply({
        error: "Connection types are not available yet. Apply the AI provider connection-types database migration.",
      }, 503);
    }
    return reply({ error: "The provider profile could not be updated." }, 503);
  }
  if (!data) return reply({ error: "Provider profile not found." }, 404);

  return reply({ profile: summary(data as unknown as RecordValue) });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!sameOrigin(request)) {
    return reply({ error: "Cross-origin provider changes are not allowed." }, 403);
  }

  const { id } = await context.params;
  if (!isAIProviderProfileId(id)) {
    return reply({ error: "Invalid provider profile ID." }, 400);
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

  const { error } = await supabase
    .from("user_ai_provider_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", authData.user.id);

  if (error) {
    return reply({ error: "The provider profile could not be deleted." }, 503);
  }

  return reply({ ok: true });
}
