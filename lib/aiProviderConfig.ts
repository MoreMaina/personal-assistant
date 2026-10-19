export const MAX_AI_PROVIDER_PROFILES = 12;
export const MAX_AI_PROVIDER_NAME_LENGTH = 80;
export const MAX_AI_PROVIDER_URL_LENGTH = 2048;
export const MAX_AI_PROVIDER_MODELS = 100;
export const MAX_AI_PROVIDER_MODEL_ID_LENGTH = 200;

export type AIProviderProfileSummary = {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  selectedModel: string | null;
  enabled: boolean;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
};

export function normalizeAIProviderName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const name = value.trim();
  if (
    name.length < 1 ||
    name.length > MAX_AI_PROVIDER_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    return null;
  }

  return name;
}

function looksLikeIpLiteral(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // URL.hostname normalizes many non-standard IPv4 representations.
  if (/^\d+(?:\.\d+){0,3}$/.test(host)) return true;

  // Reject IPv6 literals in this profile format. DNS hostnames are supported.
  return host.startsWith("[") || host.includes(":");
}

/**
 * Syntax and scheme validation only. Server requests must additionally resolve
 * the hostname, reject non-public IP addresses, and pin the validated address.
 */
export function normalizeAIProviderBaseUrl(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.trim().length < 1 ||
    value.trim().length > MAX_AI_PROVIDER_URL_LENGTH
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    Boolean(url.port) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname.includes(".") ||
    hostname.length > 253 ||
    looksLikeIpLiteral(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home.arpa") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".example") ||
    hostname.endsWith(".invalid") ||
    hostname === "metadata.google.internal"
  ) {
    return null;
  }

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }

  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}`;
}

export function normalizeAIProviderModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const modelId = value.trim();
  if (
    modelId.length < 1 ||
    modelId.length > MAX_AI_PROVIDER_MODEL_ID_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/_-]*$/.test(modelId)
  ) {
    return null;
  }

  return modelId;
}

/**
 * Accept model IDs from manual input or OpenAI-compatible { id } responses.
 * Any invalid entry rejects the list instead of silently changing model IDs.
 */
export function normalizeAIProviderModels(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_AI_PROVIDER_MODELS) {
    return null;
  }

  const models: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const candidate =
      typeof item === "string"
        ? item
        : item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            "id" in item
          ? item.id
          : null;

    const id = normalizeAIProviderModelId(candidate);
    if (!id) return null;

    if (!seen.has(id)) {
      seen.add(id);
      models.push(id);
    }
  }

  return models;
}

export function isAIProviderProfileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function parseIPv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    octets.push(octet);
  }

  return (
    octets[0] * 16_777_216 +
    octets[1] * 65_536 +
    octets[2] * 256 +
    octets[3]
  );
}

function parseIPv6Groups(address: string): number[] | null {
  const value = address.toLowerCase();

  // IPv4-embedded and scoped IPv6 forms are rejected rather than
  // ambiguously classified by this public-address validator.
  if (!value.includes(":") || value.includes(".") || value.includes("%")) {
    return null;
  }

  const separator = value.indexOf("::");
  if (separator !== value.lastIndexOf("::")) return null;

  let groups: string[];

  if (separator >= 0) {
    const leftText = value.slice(0, separator);
    const rightText = value.slice(separator + 2);
    const left = leftText ? leftText.split(":") : [];
    const right = rightText ? rightText.split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    groups = value.split(":");
    if (groups.length !== 8) return null;
  }

  if (
    groups.length !== 8 ||
    groups.some((group) => !/^[a-f0-9]{1,4}$/.test(group))
  ) {
    return null;
  }

  return groups.map((group) => parseInt(group, 16));
}

function matchesIPv6Prefix(
  address: number[],
  network: number[],
  prefixLength: number,
): boolean {
  if (
    address.length !== 8 ||
    network.length !== 8 ||
    prefixLength < 0 ||
    prefixLength > 128
  ) {
    return false;
  }

  let bitsRemaining = prefixLength;

  for (let index = 0; index < 8 && bitsRemaining > 0; index++) {
    const bitsToCompare = Math.min(16, bitsRemaining);
    const mask = bitsToCompare === 16
      ? 0xffff
      : (0xffff << (16 - bitsToCompare)) & 0xffff;

    if ((address[index] & mask) !== (network[index] & mask)) {
      return false;
    }

    bitsRemaining -= bitsToCompare;
  }

  return bitsRemaining === 0;
}

function isBlockedIPv4Range(address: string): boolean {
  const value = parseIPv4Number(address);
  if (value === null) return true;

  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];

  return ranges.some(([network, prefix]) => {
    const networkValue = parseIPv4Number(network);
    if (networkValue === null) return true;

    const blockSize = 2 ** (32 - prefix);
    return Math.floor(value / blockSize) ===
      Math.floor(networkValue / blockSize);
  });
}

/**
 * Returns true only for globally routable unicast IPv4/IPv6 addresses.
 * Hostname-to-IP resolution and pinning must still be done by the server.
 */
export function isPubliclyRoutableIp(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const address = value.trim();

  if (parseIPv4Number(address) !== null) {
    return !isBlockedIPv4Range(address);
  }

  const ipv6 = parseIPv6Groups(address);
  const globalUnicastNetwork = parseIPv6Groups("2000::");

  if (
    ipv6 === null ||
    globalUnicastNetwork === null ||
    !matchesIPv6Prefix(ipv6, globalUnicastNetwork, 3)
  ) {
    return false;
  }

  const specialRanges: Array<[string, number]> = [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ];

  for (const [network, prefix] of specialRanges) {
    const networkGroups = parseIPv6Groups(network);
    if (
      networkGroups === null ||
      matchesIPv6Prefix(ipv6, networkGroups, prefix)
    ) {
      return false;
    }
  }

  return true;
}

