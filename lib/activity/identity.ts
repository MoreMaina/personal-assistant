import {
  ACTIVITY_KINDS,
  type ActivityDomain,
  type ActivityIdentity,
} from "./types";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Runtime validation is important because identities may eventually
 * be assembled from legacy browser or cloud records.
 */
export function isActivityIdentity(
  value: unknown,
): value is ActivityIdentity {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.domain !== "string" ||
    !Object.prototype.hasOwnProperty.call(
      ACTIVITY_KINDS,
      value.domain,
    )
  ) {
    return false;
  }

  const domain = value.domain as ActivityDomain;
  const allowedKinds: readonly string[] =
    ACTIVITY_KINDS[domain];

  if (
    typeof value.kind !== "string" ||
    !allowedKinds.includes(value.kind)
  ) {
    return false;
  }

  const entityId = value.entityId;

  if (typeof entityId === "string") {
    return (
      entityId.trim().length > 0 &&
      entityId.length <= 1024
    );
  }

  return (
    typeof entityId === "number" &&
    Number.isSafeInteger(entityId) &&
    entityId >= 0
  );
}

/**
 * Builds a stable, namespaced identity.
 *
 * The domain and kind prevent collisions between records with
 * identical legacy IDs in different feature areas.
 */
export function getActivityIdentityKey(
  identity: ActivityIdentity,
): string {
  if (!isActivityIdentity(identity)) {
    throw new Error("Cannot create a key for an invalid activity identity.");
  }

  return [
    "pa",
    "v1",
    identity.domain,
    identity.kind,
    encodeURIComponent(String(identity.entityId)),
  ].join(":");
}
