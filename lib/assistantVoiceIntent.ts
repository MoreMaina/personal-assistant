export type VoiceRequestMode = "chat" | "task-proposal";

/**
 * Route only clear, direct task-creation commands into the review-only
 * task proposal flow. General questions about tasks remain normal chat.
 */
export function getVoiceRequestMode(transcript: string): VoiceRequestMode {
  const normalized = transcript.trim().replace(/\s+/g, " ");
  if (!normalized) return "chat";

  const isDirectCreationCommand =
    /^(?:(?:please|can you|could you|would you|i want you to|i'd like you to)\s+)*(?:draft|create|make|add|prepare)\b/i.test(
      normalized,
    );

  return isDirectCreationCommand && /\btask\b/i.test(normalized)
    ? "task-proposal"
    : "chat";
}
