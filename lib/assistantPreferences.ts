export const GEMINI_MODEL_OPTIONS = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "Budget-conscious default for everyday questions.",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    description: "Lightweight model for quick, lower-cost tasks.",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "A more capable option for longer reasoning tasks.",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    description: "Higher-capability option for complex planning.",
  },
] as const;

export type GeminiReasoningModel =
  (typeof GEMINI_MODEL_OPTIONS)[number]["id"];

export const REASONING_PROVIDER_OPTIONS = [
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Uses the selected Gemini model and Google API credentials.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "Uses the server-configured DeepSeek model. Requires DEEPSEEK_API_KEY; account limits or charges may apply.",
  },
  {
    id: "custom",
    label: "Custom provider",
    description: "Uses a saved, enabled OpenAI-compatible provider profile and its selected model.",
  },
] as const;

export type ReasoningProvider =
  (typeof REASONING_PROVIDER_OPTIONS)[number]["id"];

export const SPEECH_PROVIDER_OPTIONS = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    description: "Natural streamed speech using your ElevenLabs API key.",
  },
  {
    id: "gemini",
    label: "Gemini TTS",
    description: "Google-generated speech; its quota may be limited.",
  },
  {
    id: "browser",
    label: "Browser speech",
    description: "Uses a voice provided by your browser or device.",
  },
] as const;

export type SpeechProvider =
  (typeof SPEECH_PROVIDER_OPTIONS)[number]["id"];

export const GEMINI_TTS_VOICE_OPTIONS = [
  { id: "Zephyr", label: "Zephyr — Bright" },
  { id: "Puck", label: "Puck — Upbeat" },
  { id: "Charon", label: "Charon — Informative" },
  { id: "Kore", label: "Kore — Firm" },
  { id: "Fenrir", label: "Fenrir — Excitable" },
  { id: "Leda", label: "Leda — Youthful" },
  { id: "Orus", label: "Orus — Firm" },
  { id: "Aoede", label: "Aoede — Breezy" },
  { id: "Callirrhoe", label: "Callirrhoe — Easy-going" },
  { id: "Autonoe", label: "Autonoe — Bright" },
  { id: "Enceladus", label: "Enceladus — Breathy" },
  { id: "Iapetus", label: "Iapetus — Clear" },
  { id: "Umbriel", label: "Umbriel — Easy-going" },
  { id: "Algieba", label: "Algieba — Smooth" },
  { id: "Despina", label: "Despina — Smooth" },
  { id: "Erinome", label: "Erinome — Clear" },
  { id: "Algenib", label: "Algenib — Gravelly" },
  { id: "Rasalgethi", label: "Rasalgethi — Informative" },
  { id: "Laomedeia", label: "Laomedeia — Upbeat" },
  { id: "Achernar", label: "Achernar — Soft" },
  { id: "Alnilam", label: "Alnilam — Firm" },
  { id: "Schedar", label: "Schedar — Even" },
  { id: "Gacrux", label: "Gacrux — Mature" },
  { id: "Pulcherrima", label: "Pulcherrima — Forward" },
  { id: "Achird", label: "Achird — Friendly" },
  { id: "Zubenelgenubi", label: "Zubenelgenubi — Casual" },
  { id: "Vindemiatrix", label: "Vindemiatrix — Gentle" },
  { id: "Sadachbia", label: "Sadachbia — Lively" },
  { id: "Sadaltager", label: "Sadaltager — Knowledgeable" },
  { id: "Sulafat", label: "Sulafat — Warm" },
] as const;

export type GeminiTtsVoice =
  (typeof GEMINI_TTS_VOICE_OPTIONS)[number]["id"];

export type AIPreferences = {
  reasoningProvider: ReasoningProvider;
  reasoningModel: GeminiReasoningModel;
  customProviderProfileId: string;
  customProviderModel: string;
  speechProvider: SpeechProvider;
  browserVoiceURI: string;
  geminiTtsVoice: GeminiTtsVoice;
  elevenLabsVoiceId: string;
};

export const DEFAULT_AI_PREFERENCES: AIPreferences = {
  reasoningProvider: "gemini",
  reasoningModel: "gemini-3.1-flash-lite",
  customProviderProfileId: "",
  customProviderModel: "",
  speechProvider: "elevenlabs",
  browserVoiceURI: "",
  geminiTtsVoice: "Achird",
  elevenLabsVoiceId: "JBFqnCBsd6RMkjVDRZzb",
};

const STORAGE_KEY = "personal-assistant-ai-preferences";

export function isGeminiReasoningModel(
  value: unknown,
): value is GeminiReasoningModel {
  return (
    typeof value === "string" &&
    GEMINI_MODEL_OPTIONS.some((option) => option.id === value)
  );
}

export function isProviderProfileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

export function isCustomProviderModelId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 200 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  );
}

export function isReasoningProvider(
  value: unknown,
): value is ReasoningProvider {
  return (
    typeof value === "string" &&
    REASONING_PROVIDER_OPTIONS.some((option) => option.id === value)
  );
}

export function isSpeechProvider(value: unknown): value is SpeechProvider {
  return (
    typeof value === "string" &&
    SPEECH_PROVIDER_OPTIONS.some((option) => option.id === value)
  );
}

export function isGeminiTtsVoice(value: unknown): value is GeminiTtsVoice {
  return (
    typeof value === "string" &&
    GEMINI_TTS_VOICE_OPTIONS.some((option) => option.id === value)
  );
}

export function isElevenLabsVoiceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export function normalizeAIPreferences(value: unknown): AIPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_AI_PREFERENCES };
  }

  const record = value as Record<string, unknown>;

  return {
    reasoningProvider: isReasoningProvider(record.reasoningProvider)
      ? record.reasoningProvider
      : DEFAULT_AI_PREFERENCES.reasoningProvider,
    reasoningModel: isGeminiReasoningModel(record.reasoningModel)
      ? record.reasoningModel
      : DEFAULT_AI_PREFERENCES.reasoningModel,
    customProviderProfileId: isProviderProfileId(record.customProviderProfileId)
      ? record.customProviderProfileId
      : DEFAULT_AI_PREFERENCES.customProviderProfileId,
    customProviderModel: isCustomProviderModelId(record.customProviderModel)
      ? record.customProviderModel
      : DEFAULT_AI_PREFERENCES.customProviderModel,
    speechProvider: isSpeechProvider(record.speechProvider)
      ? record.speechProvider
      : DEFAULT_AI_PREFERENCES.speechProvider,
    browserVoiceURI:
      typeof record.browserVoiceURI === "string" &&
      record.browserVoiceURI.length <= 512
        ? record.browserVoiceURI
        : DEFAULT_AI_PREFERENCES.browserVoiceURI,
    geminiTtsVoice: isGeminiTtsVoice(record.geminiTtsVoice)
      ? record.geminiTtsVoice
      : DEFAULT_AI_PREFERENCES.geminiTtsVoice,
    elevenLabsVoiceId: isElevenLabsVoiceId(record.elevenLabsVoiceId)
      ? record.elevenLabsVoiceId
      : DEFAULT_AI_PREFERENCES.elevenLabsVoiceId,
  };
}

export function loadAIPreferences(): AIPreferences {
  if (typeof window === "undefined") {
    return { ...DEFAULT_AI_PREFERENCES };
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? normalizeAIPreferences(JSON.parse(saved))
      : { ...DEFAULT_AI_PREFERENCES };
  } catch {
    return { ...DEFAULT_AI_PREFERENCES };
  }
}

export function saveAIPreferences(value: unknown): AIPreferences {
  const normalized = normalizeAIPreferences(value);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
}
