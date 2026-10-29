import type {
  DailyPlan,
} from "./dailyPlanner";
import { assertStudyStateIntegrity } from "./storage";
import type {
  SavedDailyPlanSnapshot,
  StudyMvpState,
} from "./types";

export interface AppendDailyPlanSnapshotResult {
  state: StudyMvpState;
  snapshot: SavedDailyPlanSnapshot;
}

/**
 * Append a versioned daily plan snapshot. Replanning creates a new version;
 * the earlier snapshot is never edited or removed.
 */
export function appendDailyPlanSnapshot(
  state: StudyMvpState,
  plan: DailyPlan,
  savedAt: string = new Date().toISOString(),
): AppendDailyPlanSnapshotResult {
  if (
    !plan.can_finalize ||
    plan.has_silent_drops ||
    plan.has_conflicting_dispositions
  ) {
    throw new Error("Only a fully resolved daily plan can be saved.");
  }

  const history = state.daily_plan_history ?? [];
  const version =
    history
      .filter((snapshot) => snapshot.date === plan.date)
      .reduce((maximum, snapshot) => Math.max(maximum, snapshot.version), 0) +
    1;

  const snapshot: SavedDailyPlanSnapshot = {
    id: `daily-plan-${plan.date}-v${version}`,
    date: plan.date,
    version,
    saved_at: savedAt,
    plan: JSON.parse(JSON.stringify(plan)) as DailyPlan,
  };

  const nextState: StudyMvpState = {
    ...state,
    daily_plan_history: [...history, snapshot],
  };
  assertStudyStateIntegrity(nextState);

  return { state: nextState, snapshot };
}

export function completeDailyPlanSection(
  state: StudyMvpState,
  planSnapshotId: string,
  sectionId: StudySessionID,
  updatedAt: string = new Date().toISOString(),
): StudyMvpState {
  const snapshot = (
    state.daily_plan_history ?? []
  ).find((entry) => entry.id === planSnapshotId);

  if (!snapshot) {
    throw new Error("The saved daily plan could not be found.");
  }

  const validSectionIds = new Set<StudySessionSectionId>(
    snapshot.plan.items.map((item): StudySessionSectionId => {
      switch (item.kind) {
        case "initial_learning":
          return "initial_learning";
        case "gate":
          return "topic_gate";
        case "review":
          return "reviews";
        case "topic_consolidation":
          return "topic_consolidation";
        case "assignment":
          return "assignments";
        case "corrective":
          return "corrective";
        case "recovery":
          return "recovery";
        case "mixed_practice":
          return "mixed_practice";
        case "sampler":
          return "sampler";
      }
    }),
  );

  if (!validSectionIds.has(sectionId)) {
    throw new Error(
      "This section does not belong to the saved plan.",
    );
  }

  const executions = state.daily_plan_executions ?? [];
  const existing = executions.find(
    (entry) => entry.plan_snapshot_id === planSnapshotId,
  );

  if (existing?.completed_section_ids.includes(sectionId)) {
    return state;
  }

  const updatedExecution = existing
    ? {
        ...existing,
        completed_section_ids: [
          ...existing.completed_section_ids,
          sectionId,
        ],
        updated_at: updatedAt,
      }
    : {
        id: `daily-plan-execution-${planSnapshotId}`,
        date: snapshot.date,
        plan_snapshot_id: planSnapshotId,
        completed_section_ids: [sectionId],
        updated_at: updatedAt,
      };

  const nextState: StudyMvpState = {
    ...state,
    daily_plan_executions: existing
      ? executions.map((entry) =>
          entry.plan_snapshot_id === planSnapshotId
            ? updatedExecution
            : entry,
        )
      : [...executions, updatedExecution],
  };

  assertStudyStateIntegrity(nextState);

  return nextState;
}