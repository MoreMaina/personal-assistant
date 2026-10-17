import { NextResponse } from "next/server";
import { GEMINI_TTS_VOICE_OPTIONS } from "@/lib/assistantPreferences";
import {
  isAIProviderProfileId,
  normalizeAIProviderBaseUrl,
} from "@/lib/aiProviderConfig";
import { isAIProviderType, supportsAICapability } from "@/lib/aiProviderTypes";
import { createClient } from "@/lib/supabase/server";
import { decryptAIProviderApiKey } from "@/lib/server/aiProviderCrypto";
import { secureProviderHttpRequest } from "@/lib/server/secureProviderHttp";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

type VoiceOption = { id: string; name: string; category: string };

function normalizeVoiceList(payload: unknown): VoiceOption[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.voices)) return null;

  return payload.voices.flatMap((value): VoiceOption[] => {
    if (!isRecord(value)) return [];

    const id = value.voice_id;
    const name = value.name;
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return [];
    }

    return [{
      id,
      name: name.trim().slice(0, 120),
      category: typeof value.category === "string"
        ? value.category.slice(0, 60)
        : "",
    }];
  }).slice(0, 100);
}

export async function GET(request: Request) {
  let supabase;

  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return reply({ error: "Please sign in to load available voices." }, 401);
  }

  const savedProfileId =
    new URL(request.url).searchParams.get("providerProfileId");

  if (savedProfileId !== null) {
    if (!isAIProviderProfileId(savedProfileId)) {
      return reply({ error: "Invalid saved provider profile ID." }, 400);
    }

    const { data: savedProfile, error: profileError } = await supabase
      .from("user_ai_provider_profiles")
      .select("*")
      .eq("id", savedProfileId)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      return reply({
        error: "The saved speech connection could not be loaded. Confirm that the provider migrations are applied.",
      }, 503);
    }
    if (!savedProfile) {
      return reply({ error: "Saved speech connection not found." }, 404);
    }

    const profileRow = savedProfile as unknown as Record<string, unknown>;
    const providerType = isAIProviderType(profileRow.provider_type)
      ? profileRow.provider_type
      : null;

    if (!providerType || !supportsAICapability(providerType, "speech")) {
      return reply({
        error: "This saved connection does not support voice selection.",
      }, 409);
    }
    if (profileRow.enabled !== true) {
      return reply({
        error: "Enable this speech connection in AI & Voice Settings before loading voices.",
      }, 409);
    }

    if (providerType === "google_generative_language") {
      return reply({
        voices: GEMINI_TTS_VOICE_OPTIONS.map((voice) => ({
          id: voice.id,
          name: voice.label,
          category: "Google generated",
        })),
      });
    }

    const baseUrl = normalizeAIProviderBaseUrl(profileRow.base_url);
    if (
      !baseUrl ||
      typeof profileRow.encrypted_api_key !== "string" ||
      !profileRow.encrypted_api_key
    ) {
      return reply({ error: "The saved voice connection is incomplete." }, 503);
    }

    let savedApiKey: string;
    try {
      savedApiKey = decryptAIProviderApiKey(profileRow.encrypted_api_key);
    } catch {
      return reply({
        error: "The saved speech credential could not be decrypted. Verify AI_PROVIDER_ENCRYPTION_KEY on the server.",
      }, 503);
    }

    let savedVoicesResponse;
    try {
      savedVoicesResponse = await secureProviderHttpRequest({
        baseUrl,
        apiKey: savedApiKey,
        path: "/elevenlabs/voices",
        method: "GET",
        timeoutMs: 12_000,
      });
    } catch {
      return reply({ error: "Could not safely load voices from the saved connection." }, 502);
    }

    if (savedVoicesResponse.status === 429) {
      return reply({ error: "Voice discovery is rate-limited. Try again later." }, 429);
    }
    if (
      savedVoicesResponse.status === 401 ||
      savedVoicesResponse.status === 403
    ) {
      return reply({
        error: "The saved speech connection rejected its API key or permissions.",
      }, 503);
    }
    if (
      savedVoicesResponse.status < 200 ||
      savedVoicesResponse.status >= 300
    ) {
      return reply({
        error: `Voice discovery failed (HTTP ${savedVoicesResponse.status}).`,
      }, 502);
    }

    let savedPayload: unknown;
    try {
      savedPayload = JSON.parse(savedVoicesResponse.body) as unknown;
    } catch {
      return reply({ error: "The saved speech connection returned malformed voice data." }, 502);
    }

    const voices = normalizeVoiceList(savedPayload);
    if (!voices) {
      return reply({ error: "The saved speech connection returned an invalid voice list." }, 502);
    }

    return reply({ voices });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return reply({
      error: "ElevenLabs is not configured. Add ELEVENLABS_API_KEY to the server environment.",
    }, 503);
  }

  let upstream: Response;

  try {
    upstream = await fetch(
      "https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=false",
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    return reply({ error: "Could not load ElevenLabs voices. Please try again." }, 502);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return reply({ error: "ElevenLabs voice discovery is rate-limited. Try again later." }, 429);
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return reply({ error: "ElevenLabs rejected the API key or account permissions." }, 503);
    }

    return reply({ error: "ElevenLabs could not return its available voices." }, 502);
  }

  const payload: unknown = await upstream.json().catch(() => null);
  const voices = normalizeVoiceList(payload);
  if (!voices) {
    return reply({ error: "ElevenLabs returned an invalid voice list." }, 502);
  }

  return reply({ voices });
}
