function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractGeminiAnswer(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return "";

  const candidate = payload.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content)) return "";
  if (!Array.isArray(candidate.content.parts)) return "";

  return candidate.content.parts
    .filter((part): part is Record<string, unknown> =>
      isRecord(part) &&
      typeof part.text === "string" &&
      part.thought !== true)
    .map((part) => part.text as string)
    .join("")
    .trim();
}
