import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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
    return reply({ error: "Please sign in to load available voices." }, 401);
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
  if (!isRecord(payload) || !Array.isArray(payload.voices)) {
    return reply({ error: "ElevenLabs returned an invalid voice list." }, 502);
  }

  const voices = payload.voices.flatMap((value) => {
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
      category:
        typeof value.category === "string"
          ? value.category.slice(0, 60)
          : "",
    }];
  }).slice(0, 100);

  return reply({ voices });
}
