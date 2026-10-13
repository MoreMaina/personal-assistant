import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const MAX_API_KEY_LENGTH = 8192;

function getEncryptionKey(): Buffer {
  const configured = process.env.AI_PROVIDER_ENCRYPTION_KEY?.trim();

  if (!configured || !/^[0-9a-fA-F]{64}$/.test(configured)) {
    throw new Error(
      "Provider credential encryption is not configured. Set AI_PROVIDER_ENCRYPTION_KEY to a 32-byte hex key on the server.",
    );
  }

  return Buffer.from(configured, "hex");
}

export function encryptAIProviderApiKey(apiKey: string): string {
  if (
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    apiKey.length > MAX_API_KEY_LENGTH
  ) {
    throw new Error("The provider API key is empty or too long.");
  }

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    nonce,
  );

  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    nonce.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptAIProviderApiKey(envelope: string): string {
  if (typeof envelope !== "string" || envelope.length > 16_384) {
    throw new Error("The stored provider credential is invalid.");
  }

  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    throw new Error("The stored provider credential has an unsupported format.");
  }

  let nonce: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;

  try {
    nonce = Buffer.from(parts[1], "base64url");
    authTag = Buffer.from(parts[2], "base64url");
    ciphertext = Buffer.from(parts[3], "base64url");
  } catch {
    throw new Error("The stored provider credential is malformed.");
  }

  if (
    nonce.length !== NONCE_BYTES ||
    authTag.length !== AUTH_TAG_BYTES ||
    ciphertext.length === 0
  ) {
    throw new Error("The stored provider credential is malformed.");
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      nonce,
    );
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "The provider credential could not be decrypted. Check whether AI_PROVIDER_ENCRYPTION_KEY has changed.",
    );
  }
}
