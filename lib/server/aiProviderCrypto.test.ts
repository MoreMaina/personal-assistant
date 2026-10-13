import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptAIProviderApiKey,
  encryptAIProviderApiKey,
} from "./aiProviderCrypto";

const TEST_ENCRYPTION_KEY = "ab".repeat(32);

describe("AI provider credential encryption", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips provider credentials without changing their contents", () => {
    const apiKey = "test-key-with-unicode-秘密";

    const encrypted = encryptAIProviderApiKey(apiKey);

    expect(encrypted).not.toContain(apiKey);
    expect(decryptAIProviderApiKey(encrypted)).toBe(apiKey);
  });

  it("uses a different nonce when encrypting the same credential twice", () => {
    const first = encryptAIProviderApiKey("same-test-key");
    const second = encryptAIProviderApiKey("same-test-key");

    expect(first).not.toBe(second);
    expect(first.split(".")[1]).not.toBe(second.split(".")[1]);
    expect(decryptAIProviderApiKey(first)).toBe("same-test-key");
    expect(decryptAIProviderApiKey(second)).toBe("same-test-key");
  });

  it.each([
    { label: "empty", key: "" },
    { label: "non-hex", key: "g".repeat(64) },
    { label: "too short", key: "a".repeat(62) },
    { label: "too long", key: "a".repeat(66) },
  ])("rejects a $label encryption configuration", ({ key }) => {
    vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", key);

    expect(() => encryptAIProviderApiKey("test-key")).toThrow(
      /encryption is not configured/i,
    );
  });

  it("rejects empty, whitespace-only, and oversized API keys", () => {
    expect(() => encryptAIProviderApiKey("")).toThrow(/empty or too long/i);
    expect(() => encryptAIProviderApiKey("   ")).toThrow(/empty or too long/i);
    expect(() => encryptAIProviderApiKey("x".repeat(8193))).toThrow(
      /empty or too long/i,
    );
  });

  it("rejects envelopes with unsupported or malformed formats", () => {
    expect(() => decryptAIProviderApiKey("v2.a.b.c")).toThrow(
      /unsupported format/i,
    );
    expect(() => decryptAIProviderApiKey("v1.invalid.invalid.invalid")).toThrow(
      /malformed/i,
    );
    expect(() => decryptAIProviderApiKey("x".repeat(16_385))).toThrow(
      /invalid/i,
    );
  });

  it("detects ciphertext tampering", () => {
    const envelope = encryptAIProviderApiKey("sensitive-test-key");
    const [version, nonce, authTag, encodedCiphertext] = envelope.split(".");
    const ciphertext = Buffer.from(encodedCiphertext!, "base64url");

    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;

    const tampered = [
      version,
      nonce,
      authTag,
      ciphertext.toString("base64url"),
    ].join(".");

    expect(() => decryptAIProviderApiKey(tampered)).toThrow(
      /could not be decrypted/i,
    );
  });

  it("detects authentication-tag tampering", () => {
    const envelope = encryptAIProviderApiKey("sensitive-test-key");
    const [version, nonce, encodedTag, ciphertext] = envelope.split(".");
    const authTag = Buffer.from(encodedTag!, "base64url");

    authTag[0] = (authTag[0] ?? 0) ^ 1;

    const tampered = [
      version,
      nonce,
      authTag.toString("base64url"),
      ciphertext,
    ].join(".");

    expect(() => decryptAIProviderApiKey(tampered)).toThrow(
      /could not be decrypted/i,
    );
  });

  it("rejects decryption when the configured key has changed", () => {
    const envelope = encryptAIProviderApiKey("sensitive-test-key");
    vi.stubEnv("AI_PROVIDER_ENCRYPTION_KEY", "cd".repeat(32));

    expect(() => decryptAIProviderApiKey(envelope)).toThrow(
      /could not be decrypted/i,
    );
  });
});
