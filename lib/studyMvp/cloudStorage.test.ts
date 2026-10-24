import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyMvpState } from "./types";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  assertStudyStateIntegrity: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./storage", () => ({
  assertStudyStateIntegrity: mocks.assertStudyStateIntegrity,
}));

import {
  loadStudyMvpCloudState,
  saveStudyMvpCloudState,
  StudyMvpCloudConflictError,
} from "./cloudStorage";

const sampleState = {
  schema_version: 1,
} as StudyMvpState;

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.assertStudyStateIntegrity.mockReset();
});

describe("Study MVP cloud storage adapter", () => {
  it("returns null when the signed-in user has no cloud state", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn().mockReturnValue({ select });

    mocks.createClient.mockReturnValue({ from });

    await expect(loadStudyMvpCloudState()).resolves.toBeNull();

    expect(from).toHaveBeenCalledWith("user_study_mvp_state");
    expect(select).toHaveBeenCalledWith("state,revision,updated_at");
  });

  it("loads and validates the saved state and revision", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        state: sampleState,
        revision: 4,
        updated_at: "2026-10-24T08:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn().mockReturnValue({ select });

    mocks.createClient.mockReturnValue({ from });

    await expect(loadStudyMvpCloudState()).resolves.toEqual({
      state: sampleState,
      revision: 4,
      updatedAt: "2026-10-24T08:00:00.000Z",
    });

    expect(mocks.assertStudyStateIntegrity).toHaveBeenCalledWith(sampleState);
  });

  it("refuses to load malformed cloud state", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        state: [],
        revision: 1,
        updated_at: "2026-10-24T08:00:00.000Z",
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const from = vi.fn().mockReturnValue({ select });

    mocks.createClient.mockReturnValue({ from });

    await expect(loadStudyMvpCloudState()).rejects.toThrow(
      "not a valid object",
    );
  });

  it("saves using the expected revision and returns the new revision", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 5,
      error: null,
    });

    mocks.createClient.mockReturnValue({ rpc });

    await expect(
      saveStudyMvpCloudState(sampleState, 4),
    ).resolves.toBe(5);

    expect(rpc).toHaveBeenCalledWith(
      "save_user_study_mvp_state",
      {
        p_state: sampleState,
        p_expected_revision: 4,
      },
    );
    expect(mocks.assertStudyStateIntegrity).toHaveBeenCalledWith(sampleState);
  });

  it("reports a stale revision instead of silently overwriting newer data", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "40001",
        message: "Study MVP revision conflict",
      },
    });

    mocks.createClient.mockReturnValue({ rpc });

    await expect(
      saveStudyMvpCloudState(sampleState, 4),
    ).rejects.toBeInstanceOf(StudyMvpCloudConflictError);
  });

  it("rejects invalid expected revisions before making a database call", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockReturnValue({ rpc });

    await expect(
      saveStudyMvpCloudState(sampleState, -1),
    ).rejects.toThrow("expected Study revision is invalid");

    expect(rpc).not.toHaveBeenCalled();
  });
});
