export type CustomProviderRequestMode =
  | "chat"
  | "task-proposal"
  | "daily-plan"
  | "voice-chat";

export function isGroqGPTOSSProvider(
  baseUrl: string,
  model: string,
): boolean {
  return (
    baseUrl.startsWith("https://api.groq.com/") &&
    /^openai\/gpt-oss-(20b|120b)$/i.test(model)
  );
}

/**
 * Returns request options for a custom OpenAI-compatible provider.
 * GPT-OSS daily plans intentionally avoid forced JSON mode and use a
 * bounded completion budget with low reasoning effort.
 */
export function buildCustomProviderRequestOptions(input: {
  isGroqGPTOSS: boolean;
  mode: CustomProviderRequestMode;
  maxOutputTokens: number;
}): Record<string, unknown> {
  const isDailyPlan = input.mode === "daily-plan";
  const isTaskProposal = input.mode === "task-proposal";

  return {
    ...(input.isGroqGPTOSS && isDailyPlan
      ? {
          max_completion_tokens: 4096,
          reasoning_effort: "low",
        }
      : {
          max_tokens: isTaskProposal
            ? 250
            : isDailyPlan
              ? 700
              : input.maxOutputTokens,
        }),
    ...(input.isGroqGPTOSS ? { include_reasoning: false } : {}),
    ...(input.isGroqGPTOSS && isDailyPlan
      ? {}
      : { response_format: { type: "json_object" } }),
  };
}

export function getEmptyAssistantResponseMessage(input: {
  isDailyPlan: boolean;
  isGroqGPTOSS: boolean;
  finishReason: string | null;
}): string {
  if (
    input.isDailyPlan &&
    input.isGroqGPTOSS &&
    input.finishReason === "length"
  ) {
    return "Groq reached the output-token limit before returning a daily plan. No plan was shown; try again or reduce the planning details.";
  }

  return "The assistant returned no text. Please rephrase your request and try again.";
}
