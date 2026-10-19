export const AI_PROVIDER_TYPE_OPTIONS = [
  {
    id: "openai_compatible",
    label: "OpenAI-compatible API",
  },
  {
    id: "google_generative_language",
    label: "Google Generative Language API",
  },
  {
    id: "elevenlabs_tts",
    label: "ElevenLabs speech API",
  },
] as const;

export type AIProviderType =
  (typeof AI_PROVIDER_TYPE_OPTIONS)[number]["id"];

export type AICapability = "reasoning" | "speech";

const PROVIDER_CAPABILITIES: Record<
  AIProviderType,
  readonly AICapability[]
> = {
  openai_compatible: ["reasoning"],
  google_generative_language: ["reasoning", "speech"],
  elevenlabs_tts: ["speech"],
};

export function isAIProviderType(
  value: unknown,
): value is AIProviderType {
  return (
    typeof value === "string" &&
    AI_PROVIDER_TYPE_OPTIONS.some((option) => option.id === value)
  );
}

export function supportsAICapability(
  providerType: AIProviderType,
  capability: AICapability,
): boolean {
  return PROVIDER_CAPABILITIES[providerType].includes(capability);
}
