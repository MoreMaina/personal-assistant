import { createClient } from "@/lib/supabase/client";
import {   assertStudyStateIntegrity,   normalizeLegacyDailyPlanExecutions, } from "./storage";
import type { StudyMvpState } from "./types";

export interface StudyMvpCloudRecord {
  state: StudyMvpState;
  revision: number;
  updatedAt: string;
}

export class StudyMvpCloudConflictError extends Error {
  constructor(message = "Study data changed elsewhere. Reload the latest state before saving.") {
    super(message);
    this.name = "StudyMvpCloudConflictError";
  }
}

function validateCloudRevision(value: unknown): number {
  const revision = Number(value);

  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("The saved Study revision is invalid.");
  }

  return revision;
}

function validateCloudState(value: unknown): StudyMvpState {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("The saved cloud Study state is not a valid object.");
  }

  const state = normalizeLegacyDailyPlanExecutions(     value as StudyMvpState,   );

  try {
    assertStudyStateIntegrity(state);
  } catch {
    throw new Error(
      "The saved cloud Study state failed integrity validation. It was not overwritten.",
    );
  }

  return state;
}

/**
 * Reads the authenticated user's Study MVP state from Supabase.
 * Returns null when no cloud state has been created yet.
 *
 * This function does not fall back to or overwrite browser storage.
 */
export async function loadStudyMvpCloudState(): Promise<StudyMvpCloudRecord | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("user_study_mvp_state")
    .select("state,revision,updated_at")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load Study data from Supabase: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (
    typeof data.updated_at !== "string" ||
    !data.updated_at
  ) {
    throw new Error("The saved cloud Study timestamp is invalid.");
  }

  return {
    state: validateCloudState(data.state),
    revision: validateCloudRevision(data.revision),
    updatedAt: data.updated_at,
  };
}

/**
 * Saves a complete validated Study state using optimistic concurrency.
 *
 * Pass expectedRevision = 0 only when the caller has confirmed that no
 * cloud state exists. Otherwise pass the revision returned by the last
 * successful load or save.
 */
export async function saveStudyMvpCloudState(
  state: StudyMvpState,
  expectedRevision: number,
): Promise<number> {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    throw new Error("The expected Study revision is invalid.");
  }

  assertStudyStateIntegrity(state);

  const supabase = createClient();

  const { data, error } = await supabase.rpc(
    "save_user_study_mvp_state",
    {
      p_state: state,
      p_expected_revision: expectedRevision,
    },
  );

  if (error) {
    if (
      error.code === "40001" ||
      /revision conflict/i.test(error.message)
    ) {
      throw new StudyMvpCloudConflictError(error.message);
    }

    throw new Error(`Could not save Study data to Supabase: ${error.message}`);
  }

  const revision = Number(data);

  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error(
      "Supabase returned an invalid revision after saving Study data.",
    );
  }

  return revision;
}
