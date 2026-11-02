import { describe, expect, it } from "vitest";

import {
  getActivityIdentityKey,
  isActivityIdentity,
} from "./identity";

import type { ActivityIdentity } from "./types";

describe("shared activity identity", () => {
  it("creates a stable key for a Reading book", () => {
    expect(
      getActivityIdentityKey({
        domain: "reading",
        kind: "book",
        entityId: 42,
      }),
    ).toBe("pa:v1:reading:book:42");
  });

  it("keeps identical numeric IDs separate across features", () => {
    const book = getActivityIdentityKey({
      domain: "reading",
      kind: "book",
      entityId: 42,
    });

    const project = getActivityIdentityKey({
      domain: "project",
      kind: "project",
      entityId: 42,
    });

    expect(book).not.toBe(project);
  });

  it("keeps different entity kinds separate within one feature", () => {
    const book = getActivityIdentityKey({
      domain: "reading",
      kind: "book",
      entityId: 42,
    });

    const essay = getActivityIdentityKey({
      domain: "reading",
      kind: "essay",
      entityId: 42,
    });

    expect(book).not.toBe(essay);
  });

  it("encodes string IDs without losing their identity", () => {
    expect(
      getActivityIdentityKey({
        domain: "study",
        kind: "review",
        entityId: "review:unit 1",
      }),
    ).toBe("pa:v1:study:review:review%3Aunit%201");
  });

  it("accepts valid identities from each feature domain", () => {
    const identities: unknown[] = [
      { domain: "study", kind: "assignment", entityId: "assignment-1" },
      { domain: "reading", kind: "essay", entityId: 10 },
      { domain: "project", kind: "milestone", entityId: 20 },
      { domain: "personal", kind: "appointment", entityId: "meeting-1" },
    ];

    for (const identity of identities) {
      expect(isActivityIdentity(identity)).toBe(true);
    }
  });

  it("rejects unsupported domain and kind combinations", () => {
    expect(
      isActivityIdentity({
        domain: "reading",
        kind: "project",
        entityId: 42,
      }),
    ).toBe(false);
  });

  it("rejects empty and invalid entity IDs", () => {
    const invalidIdentities: unknown[] = [
      { domain: "reading", kind: "book", entityId: "" },
      { domain: "reading", kind: "book", entityId: "   " },
      { domain: "reading", kind: "book", entityId: -1 },
      { domain: "reading", kind: "book", entityId: 1.5 },
      { domain: "reading", kind: "book", entityId: Number.NaN },
    ];

    for (const identity of invalidIdentities) {
      expect(isActivityIdentity(identity)).toBe(false);
    }
  });

  it("refuses to generate keys for invalid runtime values", () => {
    const invalid = {
      domain: "reading",
      kind: "project",
      entityId: 42,
    } as unknown as ActivityIdentity;

    expect(() => getActivityIdentityKey(invalid)).toThrow(
      "Cannot create a key for an invalid activity identity.",
    );
  });
});
