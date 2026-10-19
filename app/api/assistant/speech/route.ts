import { NextResponse } from "next/server";
import {
  isElevenLabsVoiceId,
  isGeminiTtsVoice,
} from "@/lib/assistantPreferences";
import {
  isAIProviderProfileId,
  normalizeAIProviderBaseUrl,
  normalizeAIProviderModelId,
  normalizeAIProviderModels,
} from "@/lib/aiProviderConfig";
import {
  isAIProviderType,
  supportsAICapability,
  type AIProviderType,
} from "@/lib/aiProviderTypes";
import { createClient } from "@/lib/supabase/server";
import { decryptAIProviderApiKey } from "@/lib/server/aiProviderCrypto";
import { secureProviderHttpStream } from "@/lib/server/secureProviderHttp";

const MAX_TEXT_LENGTH = 4000;
const MAX_REQUESTS_PER_DAY = 30;
const dailyUsage = new Map<string, { day: string; count: number }>();

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function nairobiDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function takeDailySlot(userId: string) {
  const day = nairobiDay();
  const previous = dailyUsage.get(userId);

  if (previous?.day === day && previous.count >= MAX_REQUESTS_PER_DAY) {
    return false;
  }

  dailyUsage.set(userId, {
    day,
    count: previous?.day === day ? previous.count + 1 : 1,
  });
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return reply({ error: "Could not read the speech request." }, 400);
  }

  if (rawBody.length > 12_000) {
    return reply({ error: "That speech request is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return reply({ error: "Send a valid JSON speech request." }, 400);
  }

  if (!isRecord(body) || typeof body.text !== "string") {
    return reply({ error: "Text to read aloud is required." }, 400);
  }

  const requestedProfileId =
    body.providerProfileId === undefined
      ? null
      : isAIProviderProfileId(body.providerProfileId)
        ? body.providerProfileId
        : null;

  if (body.providerProfileId !== undefined && !requestedProfileId) {
    return reply({ error: "Invalid saved provider profile ID." }, 400);
  }

  if (requestedProfileId && body.provider !== undefined) {
    return reply({
      error: "Send either a saved provider profile ID or a legacy provider selection, not both.",
    }, 400);
  }

  let speechProvider: "elevenlabs" | "gemini" | null = requestedProfileId
    ? null
    : body.provider === undefined || body.provider === "elevenlabs"
      ? "elevenlabs"
      : body.provider === "gemini"
        ? "gemini"
        : null;

  if (!speechProvider && !requestedProfileId) {
    return reply({ error: "Unsupported speech provider." }, 400);
  }

  if (
    !requestedProfileId &&
    body.provider === "gemini" &&
    body.voice !== undefined &&
    !isGeminiTtsVoice(body.voice)
  ) {
    return reply({ error: "Unsupported Google TTS voice." }, 400);
  }

  if (
    !requestedProfileId &&
    speechProvider === "elevenlabs" &&
    body.voiceId !== undefined &&
    !isElevenLabsVoiceId(body.voiceId)
  ) {
    return reply({ error: "Invalid speech voice ID." }, 400);
  }

  const text = body.text.trim();
  if (!text) return reply({ error: "Text to read aloud is required." }, 400);
  if (text.length > MAX_TEXT_LENGTH) {
    return reply({ error: `Please keep spoken responses under ${MAX_TEXT_LENGTH} characters.` }, 400);
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return reply({ error: "Account authentication is unavailable." }, 503);
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return reply({ error: "Please sign in to use natural voice." }, 401);
  }

  let savedSpeechConfig: {
    providerType: AIProviderType;
    baseUrl: string;
    apiKey: string;
    model: string;
  } | null = null;

  if (requestedProfileId) {
    const { data: savedProfile, error: profileError } = await supabase
      .from("user_ai_provider_profiles")
      .select("*")
      .eq("id", requestedProfileId)
      .eq("user_id", user.id)
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
        error: "This saved connection does not support speech generation.",
      }, 409);
    }
    if (profileRow.enabled !== true) {
      return reply({
        error: "Enable this speech connection in AI & Voice Settings before using it.",
      }, 409);
    }

    const baseUrl = normalizeAIProviderBaseUrl(profileRow.base_url);
    if (
      !baseUrl ||
      typeof profileRow.encrypted_api_key !== "string" ||
      !profileRow.encrypted_api_key
    ) {
      return reply({
        error: "The saved speech connection is missing required configuration.",
      }, 503);
    }

    const speechModels = normalizeAIProviderModels(profileRow.speech_models);
    const selectedSpeechModel = normalizeAIProviderModelId(body.model);
    if (
      !speechModels ||
      !selectedSpeechModel ||
      !speechModels.includes(selectedSpeechModel)
    ) {
      return reply({
        error: "Choose a speech model from this connection's saved speech model list.",
      }, 400);
    }

    if (providerType === "google_generative_language") {
      if (body.voice !== undefined && !isGeminiTtsVoice(body.voice)) {
        return reply({ error: "Unsupported Google speech voice." }, 400);
      }
      speechProvider = "gemini";
    } else if (providerType === "elevenlabs_tts") {
      if (!isElevenLabsVoiceId(body.voiceId)) {
        return reply({ error: "Choose a valid voice for this speech connection." }, 400);
      }
      speechProvider = "elevenlabs";
    } else {
      return reply({
        error: "This connection protocol does not support speech generation.",
      }, 409);
    }

    try {
      savedSpeechConfig = {
        providerType,
        baseUrl,
        apiKey: decryptAIProviderApiKey(profileRow.encrypted_api_key),
        model: selectedSpeechModel,
      };
    } catch {
      return reply({
        error: "The saved speech credential could not be decrypted. Verify AI_PROVIDER_ENCRYPTION_KEY on the server.",
      }, 503);
    }
  }

  if (!speechProvider) {
    return reply({ error: "Choose a saved speech connection." }, 400);
  }

  if (!takeDailySlot(user.id)) {
    return reply({
      error: "The development limit of 30 spoken responses has been reached for today. Try again tomorrow.",
    }, 429);
  }

  if (speechProvider === "gemini") {
    const googleApiKey =
      savedSpeechConfig?.apiKey ??
      process.env.GEMINI_API_KEY?.trim() ??
      process.env.GOOGLE_API_KEY?.trim();

    if (!googleApiKey) {
      return reply({
        error: "Gemini TTS isn't configured. Add GEMINI_API_KEY to .env.local.",
      }, 503);
    }

    const geminiTtsModel =
      savedSpeechConfig?.model ??
      process.env.GEMINI_TTS_MODEL?.trim() ??
      "gemini-3.8-flash-lite-tts";
    const geminiTtsVoice =
      typeof body.voice === "string"
        ? body.voice
        : process.env.GEMINI_TTS_VOICE?.trim() || "Achird";

    const geminiSpeechBody = {
      contents: [{
        parts: [{
          text: `Speak in a warm, natural, friendly conversational style with clear pronunciation and relaxed pacing:\n${text}`,
        }],
      }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: geminiTtsVoice },
          },
        },
      },
    };

    let geminiResponse: Response;
    try {
      if (savedSpeechConfig) {
        const streamed = await secureProviderHttpStream({
          baseUrl: savedSpeechConfig.baseUrl,
          apiKey: savedSpeechConfig.apiKey,
          path: "/google/stream-generate-content",
          model: savedSpeechConfig.model,
          body: JSON.stringify(geminiSpeechBody),
          timeoutMs: 45_000,
        });
        geminiResponse = new Response(streamed.body, {
          status: streamed.status,
          headers: {
            "Content-Type": streamed.contentType || "text/event-stream",
          },
        });
      } else {
        geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiTtsModel)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": googleApiKey,
          },
          body: JSON.stringify(geminiSpeechBody),
          cache: "no-store",
          signal: AbortSignal.timeout(45_000),
        },
      );
      }
    } catch {
      return reply({ error: "Google TTS could not be reached. Please try again." }, 502);
    }

    if (!geminiResponse.ok) {
      let detail = "";
      try {
        const raw = await geminiResponse.clone().json();
        if (
          isRecord(raw) &&
          isRecord(raw.error) &&
          typeof raw.error.message === "string"
        ) {
          detail = raw.error.message.slice(0, 240);
        }
      } catch {
        // A provider error may not be JSON.
      }

      console.warn("[assistant speech provider error]", JSON.stringify({
        provider: "gemini",
        status: geminiResponse.status,
        model: geminiTtsModel,
        message: detail || "No provider details returned",
      }));

      if (geminiResponse.status === 429) {
        return reply({
          error: "Gemini TTS returned HTTP 429. Check the Google AI Studio quota for the selected TTS model.",
        }, 429);
      }
      if (geminiResponse.status === 401 || geminiResponse.status === 403) {
        return reply({
          error: "Gemini TTS rejected the API key or project permissions.",
        }, 503);
      }
      return reply({ error: "Gemini TTS generation failed." }, 502);
    }

    if (!geminiResponse.body) {
      return reply({ error: "Gemini TTS returned no audio stream." }, 502);
    }

    const reader = geminiResponse.body.getReader();

    const pcmStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const decoder = new TextDecoder();
        let pending = "";

        function processLine(line: string) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") return;

          let chunk: unknown;
          try {
            chunk = JSON.parse(payload);
          } catch {
            return;
          }

          if (!isRecord(chunk) || !Array.isArray(chunk.candidates)) return;
          const candidate = chunk.candidates[0];
          const content =
            isRecord(candidate) && isRecord(candidate.content)
              ? candidate.content
              : null;
          const parts = content && Array.isArray(content.parts) ? content.parts : [];

          for (const part of parts) {
            if (!isRecord(part) || !isRecord(part.inlineData)) continue;
            const encoded = part.inlineData.data;
            if (typeof encoded !== "string" || !encoded) continue;
            const bytes = Buffer.from(encoded, "base64");
            if (bytes.byteLength) controller.enqueue(new Uint8Array(bytes));
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            pending += decoder.decode(value, { stream: true });
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? "";
            for (const line of lines) processLine(line);
          }

          pending += decoder.decode();
          if (pending.trim()) processLine(pending);
          controller.close();
        } catch {
          controller.error(new Error("Gemini TTS audio stream failed."));
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // Ignore an already released reader.
          }
        }
      },
      cancel(reason) {
        void reader.cancel(reason).catch(() => {});
      },
    });

    return new Response(pcmStream, {
      status: 200,
      headers: {
        "Content-Type": "audio/L16;codec=pcm;rate=24000",
        "X-Audio-Sample-Rate": "24000",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const apiKey = savedSpeechConfig?.apiKey ?? process.env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    return reply({
      error: "ElevenLabs isn't configured. Add ELEVENLABS_API_KEY to .env.local and restart the dev server.",
    }, 503);
  }

  // Prefer the validated voice selected in settings; environment defaults
  // remain available for older clients that do not send a voice ID.
  const voiceId =
    typeof body.voiceId === "string"
      ? body.voiceId
      : process.env.ELEVENLABS_VOICE_ID?.trim() || "JBFqnCBsd6RMkjVDRZzb";
  const model =
    savedSpeechConfig?.model ??
    process.env.ELEVENLABS_TTS_MODEL?.trim() ??
    "eleven_flash_v2_5";

  const elevenLabsSpeechBody = {
    text,
    model_id: model,
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0.2,
      use_speaker_boost: true,
    },
  };

  let upstream: Response;

  try {
    if (savedSpeechConfig) {
      const streamed = await secureProviderHttpStream({
        baseUrl: savedSpeechConfig.baseUrl,
        apiKey: savedSpeechConfig.apiKey,
        path: "/elevenlabs/tts",
        model,
        voiceId,
        body: JSON.stringify(elevenLabsSpeechBody),
        timeoutMs: 45_000,
      });
      upstream = new Response(streamed.body, {
        status: streamed.status,
        headers: {
          "Content-Type": streamed.contentType || "audio/pcm",
        },
      });
    } else {
      upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_24000`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify(elevenLabsSpeechBody),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      },
    );
    }
  } catch {
    return reply({
      error: "The speech provider could not be reached. Please try again.",
    }, 502);
  }

  if (!upstream.ok) {
    let providerMessage = "";

    try {
      const raw = await upstream.text();
      try {
        const payload: unknown = JSON.parse(raw);
        if (
          payload &&
          typeof payload === "object" &&
          !Array.isArray(payload)
        ) {
          const record = payload as Record<string, unknown>;
          const detail = record.detail;
          if (
            detail &&
            typeof detail === "object" &&
            !Array.isArray(detail)
          ) {
            const detailRecord = detail as Record<string, unknown>;
            if (typeof detailRecord.message === "string") {
              providerMessage = detailRecord.message.slice(0, 240);
            } else if (typeof detailRecord.status === "string") {
              providerMessage = detailRecord.status.slice(0, 240);
            }
          }
          if (!providerMessage && typeof record.message === "string") {
            providerMessage = record.message.slice(0, 240);
          }
        }
      } catch {
        providerMessage = raw.slice(0, 240);
      }
    } catch {
      // The provider may return an empty error body.
    }

    console.warn("[assistant speech provider error]", JSON.stringify({
      provider: "elevenlabs",
      status: upstream.status,
      model,
      message: providerMessage || "No provider details returned",
    }));

    if (upstream.status === 401 || upstream.status === 403) {
      return reply({
        error: "ElevenLabs rejected the API key or account permissions. Check ELEVENLABS_API_KEY.",
      }, 503);
    }

    if (upstream.status === 429) {
      return reply({
        error: "ElevenLabs returned HTTP 429. Check your remaining credits and account rate limits.",
      }, 429);
    }

    return reply({
      error: `ElevenLabs speech generation failed (HTTP ${upstream.status}). Check the server log for provider details.`,
    }, 502);
  }

  if (!upstream.body) {
    return reply({
      error: "ElevenLabs returned no audio stream.",
    }, 502);
  }

  // Forward raw signed 16-bit PCM at 24 kHz. The existing browser streaming
  // player already understands this format and can schedule chunks as they arrive.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "audio/L16;codec=pcm;rate=24000",
      "X-Audio-Sample-Rate": "24000",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
