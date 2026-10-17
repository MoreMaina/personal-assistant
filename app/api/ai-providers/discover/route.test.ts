import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  secureOpenAICompatibleRequest: vi.fn(),
  secureProviderHttpRequest: vi.fn(),
  decryptAIProviderApiKey: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/server/secureProviderHttp", () => ({
  secureOpenAICompatibleRequest: mocks.secureOpenAICompatibleRequest,
  secureProviderHttpRequest: mocks.secureProviderHttpRequest,
}));

vi.mock("@/lib/server/aiProviderCrypto", () => ({
  decryptAIProviderApiKey: mocks.decryptAIProviderApiKey,
}));

import { POST } from "./route";

const APP_ORIGIN = "https://personal-assistant.example.com";

function makeRequest(body: Record<string, unknown>) {
  return new Request(`${APP_ORIGIN}/api/ai-providers/discover`, {
    method: "POST",
    headers: {
      origin: APP_ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function jsonResponse(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

describe("AI provider model discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "test-user-id" } },
          error: null,
        }),
      },
    });

    mocks.secureOpenAICompatibleRequest.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [{ id: "chat-model-a" }, { id: "chat-model-b" }],
      }),
    });

    mocks.secureProviderHttpRequest.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ models: [] }),
    });
  });

  it("preserves OpenAI-compatible model discovery", async () => {
    const response = await POST(
      makeRequest({
        providerType: "openai_compatible",
        baseUrl: "https://api.example-provider.com/v1",
        apiKey: "test-key",
      }),
    );

    const result = await jsonResponse(response);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      models: ["chat-model-a", "chat-model-b"],
      speechModels: [],
      providerLabel: "api.example-provider.com",
    });
    expect(mocks.secureOpenAICompatibleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/models",
        method: "GET",
      }),
    );
  });

  it("separates Google reasoning models from TTS models", async () => {
    mocks.secureProviderHttpRequest.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          {
            name: "models/gemini-3.8-flash",
            baseModelId: "gemini-3.8-flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3.8-flash-tts",
            baseModelId: "gemini-3.8-flash-tts",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-unavailable",
            baseModelId: "gemini-unavailable",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    });

    const response = await POST(
      makeRequest({
        providerType: "google_generative_language",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: "test-key",
      }),
    );

    const result = await jsonResponse(response);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      models: ["gemini-3.8-flash"],
      speechModels: ["gemini-3.8-flash-tts"],
      providerLabel: "generativelanguage.googleapis.com",
    });
    expect(mocks.secureProviderHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/google/models",
        method: "GET",
      }),
    );
  });

  it("includes only ElevenLabs models that support text-to-speech", async () => {
    mocks.secureProviderHttpRequest.mockResolvedValue({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          model_id: "eleven_multilingual_v2",
          can_do_text_to_speech: true,
        },
        {
          model_id: "voice-conversion-only",
          can_do_text_to_speech: false,
        },
      ]),
    });

    const response = await POST(
      makeRequest({
        providerType: "elevenlabs_tts",
        baseUrl: "https://api.elevenlabs.io/v1",
        apiKey: "test-key",
      }),
    );

    const result = await jsonResponse(response);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      models: [],
      speechModels: ["eleven_multilingual_v2"],
      providerLabel: "api.elevenlabs.io",
    });
    expect(mocks.secureProviderHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/elevenlabs/models",
        method: "GET",
      }),
    );
  });

  it("rejects unsupported connection types without making an upstream request", async () => {
    const response = await POST(
      makeRequest({
        providerType: "unknown",
        baseUrl: "https://api.example-provider.com/v1",
        apiKey: "test-key",
      }),
    );

    const result = await jsonResponse(response);

    expect(result.status).toBe(400);
    expect(mocks.secureOpenAICompatibleRequest).not.toHaveBeenCalled();
    expect(mocks.secureProviderHttpRequest).not.toHaveBeenCalled();
  });
});
