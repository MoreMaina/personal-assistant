import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_PREFERENCES,
  isProviderProfileId,
  isCustomProviderModelId,
  isGeminiTtsVoice,
  isElevenLabsVoiceId,
  normalizeAIPreferences,
} from "./assistantPreferences";

describe("AI preferences", () => {
  it("starts with no built-in connection selected", () => {
    expect(DEFAULT_AI_PREFERENCES).toEqual({
      reasoningConnectionId: "",
      reasoningModel: "",
      speechConnectionId: "",
      speechModel: "",
      speechVoiceId: "",
    });
  });

  it("validates connection and model IDs", () => {
    expect(isProviderProfileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isProviderProfileId("not-a-uuid")).toBe(false);
    expect(isCustomProviderModelId("provider/model-v2")).toBe(true);
    expect(isCustomProviderModelId("eleven_multilingual_v2")).toBe(true);
    expect(isCustomProviderModelId("../invalid")).toBe(false);
    expect(isCustomProviderModelId("model name")).toBe(false);
  });

  it("validates protocol voice IDs", () => {
    expect(isGeminiTtsVoice("Achird")).toBe(true);
    expect(isElevenLabsVoiceId("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(isElevenLabsVoiceId("../invalid")).toBe(false);
  });

  it("preserves an existing saved custom reasoning connection", () => {
    expect(normalizeAIPreferences({
      reasoningProvider: "custom",
      customProviderProfileId: "550e8400-e29b-41d4-a716-446655440000",
      customProviderModel: "provider/model-v2",
      speechProvider: "elevenlabs",
      elevenLabsVoiceId: "JBFqnCBsd6RMkjVDRZzb",
    })).toEqual({
      reasoningConnectionId: "550e8400-e29b-41d4-a716-446655440000",
      reasoningModel: "provider/model-v2",
      speechConnectionId: "",
      speechModel: "",
      speechVoiceId: "JBFqnCBsd6RMkjVDRZzb",
    });
  });

  it("does not restore legacy built-in services as selected connections", () => {
    expect(normalizeAIPreferences({
      reasoningProvider: "gemini",
      reasoningModel: "gemini-3.1-flash-lite",
      speechProvider: "gemini",
      geminiTtsVoice: "Achird",
    })).toEqual({
      reasoningConnectionId: "",
      reasoningModel: "",
      speechConnectionId: "",
      speechModel: "",
      speechVoiceId: "Achird",
    });
  });

  it("normalizes malformed preferences safely", () => {
    expect(normalizeAIPreferences({
      reasoningConnectionId: "../../profile",
      reasoningModel: "../invalid",
      speechConnectionId: "invalid",
      speechModel: "model name",
      speechVoiceId: "../invalid",
    })).toEqual(DEFAULT_AI_PREFERENCES);
  });
});
