import { describe, expect, it } from "vitest";
import {
  buildCustomProviderRequestOptions,
  getEmptyAssistantResponseMessage,
  isGroqGPTOSSProvider,
} from "./customProviderRequest";

describe("custom provider request configuration", () => {
  it("recognizes supported Groq GPT-OSS models only on the Groq endpoint", () => {
    expect(
      isGroqGPTOSSProvider(
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-20b",
      ),
    ).toBe(true);

    expect(
      isGroqGPTOSSProvider(
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-120b",
      ),
    ).toBe(true);

    expect(
      isGroqGPTOSSProvider(
        "https://api.groq.com/openai/v1",
        "some-other-model",
      ),
    ).toBe(false);

    expect(
      isGroqGPTOSSProvider(
        "https://provider.example/v1",
        "openai/gpt-oss-20b",
      ),
    ).toBe(false);
  });

  it("preserves the working GPT-OSS daily-plan settings", () => {
    const options = buildCustomProviderRequestOptions({
      isGroqGPTOSS: true,
      mode: "daily-plan",
      maxOutputTokens: 700,
    });

    expect(options).toMatchObject({
      max_completion_tokens: 4096,
      reasoning_effort: "low",
      include_reasoning: false,
    });
    expect(options).not.toHaveProperty("max_tokens");
    expect(options).not.toHaveProperty("response_format");
  });

  it("preserves JSON Object Mode for other GPT-OSS requests", () => {
    const options = buildCustomProviderRequestOptions({
      isGroqGPTOSS: true,
      mode: "chat",
      maxOutputTokens: 700,
    });

    expect(options).toMatchObject({
      max_tokens: 700,
      include_reasoning: false,
      response_format: { type: "json_object" },
    });
    expect(options).not.toHaveProperty("max_completion_tokens");
  });

  it("preserves the non-GPT-OSS daily-plan request options", () => {
    expect(
      buildCustomProviderRequestOptions({
        isGroqGPTOSS: false,
        mode: "daily-plan",
        maxOutputTokens: 700,
      }),
    ).toEqual({
      max_tokens: 700,
      response_format: { type: "json_object" },
    });
  });

  it("preserves the 250-token task-proposal budget", () => {
    expect(
      buildCustomProviderRequestOptions({
        isGroqGPTOSS: false,
        mode: "task-proposal",
        maxOutputTokens: 700,
      }),
    ).toEqual({
      max_tokens: 250,
      response_format: { type: "json_object" },
    });
  });
});

describe("empty assistant response handling", () => {
  it("explains when Groq runs out of output tokens during daily planning", () => {
    expect(
      getEmptyAssistantResponseMessage({
        isDailyPlan: true,
        isGroqGPTOSS: true,
        finishReason: "length",
      }),
    ).toMatch(/output-token limit/i);
  });

  it("keeps the generic error for other empty responses", () => {
    expect(
      getEmptyAssistantResponseMessage({
        isDailyPlan: false,
        isGroqGPTOSS: true,
        finishReason: "length",
      }),
    ).toMatch(/returned no text/i);

    expect(
      getEmptyAssistantResponseMessage({
        isDailyPlan: true,
        isGroqGPTOSS: true,
        finishReason: "stop",
      }),
    ).toMatch(/returned no text/i);
  });
});
