import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_PREFERENCES,
  isGeminiReasoningModel,
  isReasoningProvider,
  isProviderProfileId,
  isCustomProviderModelId,
  isSpeechProvider,
  isGeminiTtsVoice,
  isElevenLabsVoiceId,
  normalizeAIPreferences,
} from "./assistantPreferences";

describe("AI preferences", () => {
  it("defaults to the existing Gemini model and ElevenLabs", () => {
    expect(DEFAULT_AI_PREFERENCES).toEqual({
      reasoningProvider: "gemini",
      reasoningModel: "gemini-3.1-flash-lite",
      customProviderProfileId: "",
      customProviderModel: "",
      speechProvider: "elevenlabs",
      browserVoiceURI: "",
      geminiTtsVoice: "Achird",
      elevenLabsVoiceId: "JBFqnCBsd6RMkjVDRZzb",
    });
  });

  it("accepts only supported reasoning providers", () => {
    expect(isReasoningProvider("gemini")).toBe(true);
    expect(isReasoningProvider("deepseek")).toBe(true);
    expect(isReasoningProvider("custom")).toBe(true);
    expect(isReasoningProvider("unknown-provider")).toBe(false);
    expect(isProviderProfileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isProviderProfileId("not-a-uuid")).toBe(false);
    expect(isCustomProviderModelId("provider/model-v2")).toBe(true);
    expect(isCustomProviderModelId("../invalid")).toBe(false);
    expect(isCustomProviderModelId("model name")).toBe(false);
  });

  it("accepts only supported Gemini model IDs", () => {
    expect(isGeminiReasoningModel("gemini-3.8-flash")).toBe(true);
    expect(isGeminiReasoningModel("gemini-2.0-flash")).toBe(false);
    expect(isGeminiReasoningModel("arbitrary-model")).toBe(false);
  });

  it("accepts only supported speech providers", () => {
    expect(isSpeechProvider("elevenlabs")).toBe(true);
    expect(isSpeechProvider("gemini")).toBe(true);
    expect(isSpeechProvider("browser")).toBe(true);
    expect(isSpeechProvider("unknown")).toBe(false);
  });

  it("accepts only supported Gemini TTS voices and safe ElevenLabs voice IDs", () => {
    expect(isGeminiTtsVoice("Achird")).toBe(true);
    expect(isGeminiTtsVoice("Zephyr")).toBe(true);
    expect(isGeminiTtsVoice("not-a-real-voice")).toBe(false);
    expect(isElevenLabsVoiceId("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(isElevenLabsVoiceId("../invalid")).toBe(false);
  });

  it("normalizes invalid saved preferences to safe defaults", () => {
    expect(normalizeAIPreferences({
      reasoningProvider: "unknown-provider",
      reasoningModel: "unknown-model",
      customProviderProfileId: "../../profile",
      customProviderModel: "../invalid",
      speechProvider: "unknown-provider",
      geminiTtsVoice: "not-a-real-voice",
      elevenLabsVoiceId: "../invalid",
      browserVoiceURI: "x".repeat(600),
    })).toEqual(DEFAULT_AI_PREFERENCES);
  });
});
