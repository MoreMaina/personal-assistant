import type { DailyPlan } from "./dailyPlanner";
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
