export type CachedSpeechAudio = {
  bytes: Uint8Array;
  sampleRate: number;
};

type CacheEntry = CachedSpeechAudio & {
  expiresAt: number;
};

type SpeechAudioCacheOptions = {
  ttlMs?: number;
  maxEntries?: number;
  maxTotalBytes?: number;
  maxEntryBytes?: number;
};

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5;
const DEFAULT_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 3 * 1024 * 1024;

/**
 * A bounded, in-memory LRU cache. Instantiate per UI session; do not share
 * a module-level instance between users or persist audio to browser storage.
 */
export class SpeechAudioCache {
  private readonly entries = new Map<string, CacheEntry>();
  private currentBytes = 0;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxTotalBytes: number;
  readonly maxEntryBytes: number;

  constructor(options: SpeechAudioCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
    this.maxEntryBytes = options.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  }

  get totalBytes(): number {
    return this.currentBytes;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string, now = Date.now()): CachedSpeechAudio | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= now) {
      this.delete(key);
      return null;
    }

    // Refresh insertion order so recently replayed audio stays in the cache.
    this.entries.delete(key);
    this.entries.set(key, entry);

    return { bytes: entry.bytes, sampleRate: entry.sampleRate };
  }

  set(
    key: string,
    bytes: Uint8Array,
    sampleRate: number,
    now = Date.now(),
  ): boolean {
    if (
      !key ||
      bytes.byteLength === 0 ||
      bytes.byteLength > this.maxEntryBytes ||
      bytes.byteLength > this.maxTotalBytes ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0
    ) {
      return false;
    }

    this.removeExpired(now);
    this.delete(key);

    const entry: CacheEntry = {
      bytes: bytes.slice(),
      sampleRate,
      expiresAt: now + this.ttlMs,
    };

    this.entries.set(key, entry);
    this.currentBytes += entry.bytes.byteLength;
    this.evictToLimits();

    return this.entries.has(key);
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;

    this.entries.delete(key);
    this.currentBytes -= entry.bytes.byteLength;
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.currentBytes = 0;
  }

  private removeExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.delete(key);
    }
  }

  private evictToLimits(): void {
    while (
      this.entries.size > this.maxEntries ||
      this.currentBytes > this.maxTotalBytes
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }
}
