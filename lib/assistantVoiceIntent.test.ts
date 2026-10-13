import { describe, expect, it } from "vitest";
import { getVoiceRequestMode } from "./assistantVoiceIntent";

describe("getVoiceRequestMode", () => {
  it("routes clear task-drafting commands to review-only proposals", () => {
    expect(
      getVoiceRequestMode("Draft a task to revise lecture notes by Thursday"),
    ).toBe("task-proposal");

    expect(
      getVoiceRequestMode("Can you create a high priority task for my assignment?"),
    ).toBe("task-proposal");

    expect(
      getVoiceRequestMode("Please add a task to review my study notes"),
    ).toBe("task-proposal");

    expect(
      getVoiceRequestMode("I'd like you to prepare a task for tomorrow"),
    ).toBe("task-proposal");
  });

  it("keeps general task questions in normal chat", () => {
    expect(getVoiceRequestMode("What tasks should I focus on today?")).toBe("chat");
    expect(getVoiceRequestMode("Can you explain how to draft a task?")).toBe("chat");
    expect(getVoiceRequestMode("Summarize my active projects")).toBe("chat");
    expect(getVoiceRequestMode("  ")).toBe("chat");
  });
});
