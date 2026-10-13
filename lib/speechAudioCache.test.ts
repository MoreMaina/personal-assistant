import { describe, expect, it } from "vitest";

import { SpeechAudioCache } from "./speechAudioCache";

describe("SpeechAudioCache", () => {
  it("caches audio by key and expires entries", () => {
    const cache = new SpeechAudioCache({ ttlMs: 100 });
    const bytes = Uint8Array.of(1, 2, 3);

    expect(cache.set("elevenlabs:hello", bytes, 24000, 0)).toBe(true);
    expect(cache.get("elevenlabs:hello", 50)).toEqual({
      bytes,
      sampleRate: 24000,
    });
    expect(cache.get("gemini:hello", 50)).toBeNull();
    expect(cache.get("elevenlabs:hello", 100)).toBeNull();
    expect(cache.size).toBe(0);
    expect(cache.totalBytes).toBe(0);
  });

  it("evicts the least recently used entry to stay within memory limits", () => {
    const cache = new SpeechAudioCache({
      ttlMs: 1000,
      maxEntries: 3,
      maxTotalBytes: 5,
      maxEntryBytes: 4,
    });

    cache.set("a", Uint8Array.of(1, 2, 3), 24000, 0);
    cache.set("b", Uint8Array.of(4, 5), 24000, 0);
    expect(cache.get("a", 1)).not.toBeNull();

    cache.set("c", Uint8Array.of(6, 7), 24000, 2);

    expect(cache.get("a", 3)).not.toBeNull();
    expect(cache.get("b", 3)).toBeNull();
    expect(cache.get("c", 3)).not.toBeNull();
    expect(cache.totalBytes).toBe(5);
  });

  it("does not cache oversized or empty audio", () => {
    const cache = new SpeechAudioCache({
      maxTotalBytes: 4,
      maxEntryBytes: 3,
    });

    expect(cache.set("large", Uint8Array.of(1, 2, 3, 4), 24000)).toBe(false);
    expect(cache.set("empty", new Uint8Array(0), 24000)).toBe(false);
    expect(cache.size).toBe(0);
  });

  it("copies the audio bytes rather than retaining a mutable input buffer", () => {
    const cache = new SpeechAudioCache();
    const source = Uint8Array.of(10, 20);

    cache.set("test", source, 24000);
    source[0] = 99;

    expect(cache.get("test")?.bytes).toEqual(Uint8Array.of(10, 20));
  });
});
