import { describe, expect, it } from "vitest";
import {
  isAIProviderProfileId,
  isPubliclyRoutableIp,
  normalizeAIProviderBaseUrl,
  normalizeAIProviderModelId,
  normalizeAIProviderModels,
  normalizeAIProviderName,
} from "./aiProviderConfig";

describe("AI provider configuration validation", () => {
  it("normalizes names and rejects blank, oversized, or control-character names", () => {
    expect(normalizeAIProviderName("  My provider  ")).toBe("My provider");
    expect(normalizeAIProviderName("   ")).toBeNull();
    expect(normalizeAIProviderName("x".repeat(81))).toBeNull();
    expect(normalizeAIProviderName("name\nforged")).toBeNull();
    expect(normalizeAIProviderName(42)).toBeNull();
  });

  it("accepts HTTPS provider URLs and preserves a version path", () => {
    expect(
      normalizeAIProviderBaseUrl(" https://api.example-provider.com/v1/ "),
    ).toBe("https://api.example-provider.com/v1");
  });

  it.each([
    "http://api.example.com/v1",
    "https://api.example.com:8443/v1",
    "https://localhost/v1",
    "https://service.local/v1",
    "https://service.internal/v1",
    "https://127.0.0.1/v1",
    "https://192.168.1.5/v1",
    "https://[::1]/v1",
    "https://user:password@api.example.com/v1",
    "https://api.example.com/v1?token=secret",
    "https://api.example.com/v1#fragment",
    "https://metadata.google.internal",
    "not-a-url",
  ])("rejects unsafe or malformed provider URL %s", (url) => {
    expect(normalizeAIProviderBaseUrl(url)).toBeNull();
  });

  it("validates and normalizes manual or discovered model IDs", () => {
    expect(normalizeAIProviderModelId(" provider/model-v2 ")).toBe(
      "provider/model-v2",
    );
    expect(normalizeAIProviderModelId("eleven_multilingual_v2")).toBe(
      "eleven_multilingual_v2",
    );
    expect(normalizeAIProviderModelId("../escape")).toBeNull();
    expect(normalizeAIProviderModelId("model name")).toBeNull();
    expect(
      normalizeAIProviderModels([
        "model-a",
        { id: "model-b", display_name: "Model B" },
        "model-a",
      ]),
    ).toEqual(["model-a", "model-b"]);
    expect(normalizeAIProviderModels(["good-model", "../bad"])).toBeNull();
    expect(normalizeAIProviderModels("model-a")).toBeNull();
  });

  it("accepts UUID profile IDs and rejects other identifiers", () => {
    expect(isAIProviderProfileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isAIProviderProfileId("not-a-uuid")).toBe(false);
    expect(isAIProviderProfileId("../../users")).toBe(false);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.19.0.1",
    "192.0.2.10",
    "203.0.113.8",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "2002::1",
    "::ffff:8.8.8.8",
    "not-an-ip",
  ])("rejects non-public or special-use IP address %s", (address) => {
    expect(isPubliclyRoutableIp(address)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "208.67.222.222",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts public unicast IP address %s", (address) => {
    expect(isPubliclyRoutableIp(address)).toBe(true);
  });
});
