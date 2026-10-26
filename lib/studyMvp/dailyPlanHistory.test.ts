import { describe, expect, it } from "vitest";
import { buildStudyDailyPlan } from "./dashboard";
import { appendDailyPlanSnapshot } from "./dailyPlanHistory";
import { createEmptyStudyState } from "./storage";

const SAVED_AT = "2026-10-26T08:00:00.000+03:00";

function fixtureState() {
  return createEmptyStudyState({
    now: SAVED_AT,
    timezone: "Africa/Nairobi",
  });
}

describe("saved daily plan snapshots", () => {
  it("appends sequential versions for an explicitly replanned day", () => {
    const state = fixtureState();
    const plan = buildStudyDailyPlan(state, "2026-10-26").plan;
    const first = appendDailyPlanSnapshot(state, plan, SAVED_AT);
    const second = appendDailyPlanSnapshot(
      first.state,
      plan,
      "2026-10-26T09:00:00.000+03:00",
    );

    expect(first.snapshot).toMatchObject({
      id: "daily-plan-2026-10-26-v1",
      date: "2026-10-26",
      version: 1,
    });
    expect(second.snapshot).toMatchObject({
      id: "daily-plan-2026-10-26-v2",
      date: "2026-10-26",
      version: 2,
    });
    expect(second.state.daily_plan_history).toHaveLength(2);
    expect(second.state.daily_plan_history?.[0]).toEqual(first.snapshot);
    expect(state.daily_plan_history).toEqual([]);
  });

  it("starts version 1 for a new Study day", () => {
    const state = fixtureState();
    const firstPlan = buildStudyDailyPlan(state, "2026-10-26").plan;
    const nextPlan = buildStudyDailyPlan(state, "2026-10-27").plan;
    const first = appendDailyPlanSnapshot(state, firstPlan, SAVED_AT);
    const nextDay = appendDailyPlanSnapshot(
      first.state,
      nextPlan,
      "2026-10-27T08:00:00.000+03:00",
    );

    expect(nextDay.snapshot.version).toBe(1);
    expect(nextDay.snapshot.date).toBe("2026-10-27");
    expect(nextDay.state.daily_plan_history).toHaveLength(2);
  });

  it("supports a rest-day snapshot with no work items", () => {
    const state = fixtureState();
    const restPlan = buildStudyDailyPlan(state, "2026-10-25").plan;

    expect(restPlan.items).toHaveLength(0);
    const result = appendDailyPlanSnapshot(state, restPlan, SAVED_AT);
    expect(result.snapshot.plan.items).toHaveLength(0);
  });
});
