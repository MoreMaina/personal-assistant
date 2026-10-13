import { describe, expect, it } from "vitest";
import { extractGeminiAnswer } from "./geminiResponse";

describe("extractGeminiAnswer", () => {
  it("extracts text from a Gemini candidate", () => {
    expect(extractGeminiAnswer({
      candidates: [{
        content: {
          parts: [{ text: '{"summary":"Plan","blocks":[]}' }],
        },
      }],
    })).toBe('{"summary":"Plan","blocks":[]}');
  });

  it("ignores thought parts and concatenates response parts without inserting text", () => {
    expect(extractGeminiAnswer({
      candidates: [{
        content: {
          parts: [
            { text: "This is a thought, not the answer.", thought: true },
            { text: '{"summary":"Plan","blocks":' },
            { text: '[]}' },
          ],
        },
      }],
    })).toBe('{"summary":"Plan","blocks":[]}');
  });

  it("ignores parts that do not contain text", () => {
    expect(extractGeminiAnswer({
      candidates: [{
        content: {
          parts: [
            { inlineData: { mimeType: "application/octet-stream" } },
            { text: "Answer" },
          ],
        },
      }],
    })).toBe("Answer");
  });

  it("returns an empty string for a missing or invalid candidate", () => {
    expect(extractGeminiAnswer(null)).toBe("");
    expect(extractGeminiAnswer({ candidates: [] })).toBe("");
    expect(extractGeminiAnswer({
      candidates: [{ content: { parts: "invalid" } }],
    })).toBe("");
  });
});
