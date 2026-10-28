import { describe, expect, it } from "vitest";

import {
  createPlanningDecisionEvents,
  DEFAULT_PLANNER_SETTINGS,
  generateDailyPlan,
  type AssignmentPlanTask,
  type ConsolidationPlanTask,
  type DailyPlannerInput,
  type PlanningQuestion,
  type PlanningTask,
  type ReviewPlanTask,
} from "./dailyPlanner";

import { addCalendarDays } from "./reviewEngine";

import type {
  EntityId,
  TaskEvent,
} from "./types";

const DATE = "2026-10-19"; // Monday

function question(
  id: EntityId,
  minutes = 5,
): PlanningQuestion {
  return {
    id,
    estimatedDurationMin: minutes,
    taskType: "definition",
  };
}

function consolidation(
  id: string,
  minutes: number,
  overrides: Partial<ConsolidationPlanTask> = {},
): ConsolidationPlanTask {
  return {
    id,
    subjectId: id,
    kind: "topic_consolidation",
    topicId: id,
    plannedDate: DATE,
    inLearning: true,
    consolidationEstimatedDurationMin: minutes,
    loggedConsolidationMinutes: 0,
    priority: 2,
    importance: "high",
    ...overrides,
  };
}

function assignment(
  id: string,
  remainingMin: number,
  overrides: Partial<AssignmentPlanTask> = {},
): AssignmentPlanTask {
  return {
    id,
    subjectId: id,
    kind: "assignment",
    dueDate: addCalendarDays(DATE, 3),
    remainingMin,
    maxSessionMin: remainingMin,
    status: "pending",
    priority: 1,
    importance: "high",
    ...overrides,
  };
}

function review(
  id: string,
  priority: 1 | 2 | 3 | 4 | 5,
  minutes: number,
  overrides: Partial<ReviewPlanTask> = {},
): ReviewPlanTask {
  const questions = [
    question(`${id}-q1`, Math.ceil(minutes / 2)),
    question(`${id}-q2`, Math.floor(minutes / 2) || 1),
  ];

  return {
    id,
    subjectId: id,
    reviewEventId: id,
    topicId: `${id}-topic`,
    kind: "review",
    stage: 1,
    eventKind: "scheduled_review",
    status: "pending",
    intendedDueDate: DATE,
    currentDueDate: DATE,
    deferCount: 0,
    selectedQuestions: questions,
    priority,
    importance: "high",
    ...overrides,
  };
}

function makeInput(
  tasks: PlanningTask[],
  overrides: Partial<DailyPlannerInput> = {},
): DailyPlannerInput {
  return {
    date: DATE,
    settings: {
      ...DEFAULT_PLANNER_SETTINGS,
    },
    tasks,
    ...overrides,
  };
}

function totalForKind(
  plan: ReturnType<typeof generateDailyPlan>,
  kind: PlanningTask["kind"],
): number {
  return plan.items
    .filter((item) => item.kind === kind)
    .reduce(
      (total, item) => total + item.allocated_minutes,
      0,
    );
}

function item(
  plan: ReturnType<typeof generateDailyPlan>,
  id: string,
) {
  const found = plan.items.find(
    (candidate) => candidate.id === id,
  );

  if (!found) {
    throw new Error(`Missing plan item: ${id}`);
  }

  return found;
}

describe("daily allocation acceptance tests", () => {
  it("H1 — produces the canonical 180-minute allocation", () => {
    const tasks: PlanningTask[] = [
      consolidation("new-1", 45),
      consolidation("new-2", 45),
      assignment("assignment-1", 120, {
        dueDate: addCalendarDays(DATE, 3),
      }),
      review("review-p1", 1, 10),
      {
        id: "mixed-1",
        kind: "mixed_practice",
        due: true,
        priority: 5,
      },
    ];

    const plan = generateDailyPlan(makeInput(tasks));

    expect(plan.allocated_minutes).toBe(180);
    expect(plan.remaining_budget_minutes).toBe(0);

    expect(totalForKind(plan, "topic_consolidation")).toBe(90);
    expect(totalForKind(plan, "assignment")).toBe(70);
    expect(totalForKind(plan, "review")).toBe(10);
    expect(totalForKind(plan, "mixed_practice")).toBe(10);

    expect(item(plan, "new-1").category).toBe("PROTECTED");
    expect(item(plan, "new-2").category).toBe("PROTECTED");
    expect(plan.has_silent_drops).toBe(false);
    expect(plan.has_conflicting_dispositions).toBe(false);
    expect(plan.can_finalize).toBe(true);
  });

  it("H2 — services a review flood without exceeding budget or hiding remaining work", () => {
    const tasks: PlanningTask[] = [
      consolidation("new-1", 45),
      consolidation("new-2", 45),
      assignment("assignment-1", 120),
      ...Array.from(
        { length: 10 },
        (_, index) =>
          review(`review-${index + 1}`, 1, 10),
      ),
      {
        id: "mixed-1",
        kind: "mixed_practice",
        due: true,
        priority: 5,
      },
    ];

    const plan = generateDailyPlan(makeInput(tasks));

    expect(plan.allocated_minutes).toBe(180);
    expect(totalForKind(plan, "topic_consolidation")).toBe(90);
    expect(totalForKind(plan, "assignment")).toBe(30);
    expect(totalForKind(plan, "review")).toBe(50);
    expect(totalForKind(plan, "mixed_practice")).toBe(10);

    expect(plan.initial_review_reserve_minutes).toBe(30);
    expect(plan.initial_mixed_reserve_minutes).toBe(10);

    const unresolvedReviews = plan.items.filter(
      (candidate) =>
        candidate.kind === "review" &&
        candidate.allocated_minutes === 0,
    );

    expect(unresolvedReviews.length).toBeGreaterThan(0);
    expect(
      unresolvedReviews.every(
        (candidate) =>
          candidate.disposition === "DEFER" ||
          candidate.decision_required,
      ),
    ).toBe(true);

    expect(plan.items).toHaveLength(tasks.length);
    expect(plan.has_silent_drops).toBe(false);
  });

  it("H3 — expands mixed practice on an otherwise empty Monday", () => {
    const plan = generateDailyPlan(
      makeInput([
        {
          id: "mixed-1",
          kind: "mixed_practice",
          due: true,
          priority: 5,
        },
      ]),
    );

    expect(plan.allocated_minutes).toBe(30);
    expect(totalForKind(plan, "mixed_practice")).toBe(30);
    expect(plan.items).toHaveLength(1);
    expect(plan.remaining_budget_minutes).toBe(150);
  });

  it("H5 — gives every considered task one disposition or an explicit blocking decision", () => {
    const tasks: PlanningTask[] = [
      consolidation("new-1", 45),
      assignment("assignment-1", 100),
      review("review-1", 1, 10),
      review("review-2", 4, 10, {
        deferCount: 3,
      }),
      review("review-3", 5, 10),
      {
        id: "mixed-1",
        kind: "mixed_practice",
        due: true,
        priority: 5,
      },
    ];

    const plan = generateDailyPlan(
      makeInput(tasks, {
        forcedDecisions: {
          "review-2": {
            disposition: "skip",
            reason: "Low expected value before the examination.",
            re_entry_condition: "upcoming_exam",
          },
        },
      }),
    );

    expect(plan.allocated_minutes).toBeLessThanOrEqual(180);
    expect(new Set(plan.items.map((candidate) => candidate.id)).size).toBe(plan.items.length);

    for (const candidate of plan.items) {
      expect(
        candidate.disposition !== null ||
          candidate.decision_required,
      ).toBe(true);

      if (candidate.category === "PROTECTED") {
        expect(candidate.disposition).toBe("DO");
      }

      if (candidate.disposition === "SKIP") {
        expect(candidate.reason).toBeTruthy();
        expect(candidate.re_entry_condition).toBeTruthy();
        expect(candidate.allocated_minutes).toBe(0);
      }
    }

    expect(item(plan, "review-2").disposition).toBe("SKIP");
    expect(plan.priority_1_3_skip_count).toBe(0);
    expect(plan.has_silent_drops).toBe(false);
    expect(plan.has_conflicting_dispositions).toBe(false);
  });

  it("requires a forced decision when a further deferral would reach the limit", () => {
    const plan = generateDailyPlan(
      makeInput(
        [
          review("review-limit", 4, 10, {
            deferCount: 2,
          }),
        ],
        {
          settings: {
            ...DEFAULT_PLANNER_SETTINGS,
            daily_budget_min: 0,
          },
        },
      ),
    );

    expect(plan.can_finalize).toBe(false);
    expect(plan.unresolved_decisions).toContain("review-limit");
    expect(item(plan, "review-limit").disposition).toBeNull();
    expect(item(plan, "review-limit").decision_required).toBe(true);
  });

  it("requires an explicit reason and re-entry condition for SKIP", () => {
    expect(() =>
      generateDailyPlan(
        makeInput([review("review-skip", 5, 10)], {
          explicitDecisions: {
            "review-skip": {
              disposition: "SKIP",
              reason: "Not needed today.",
            },
          },
        }),
      ),
    ).toThrow(/re-entry condition/);
  });

  it("releases mixed-practice reservation for an approved urgent repair-cap override", () => {
    const tasks: PlanningTask[] = [
      consolidation("new-1", 45),
      consolidation("new-2", 45),
      assignment("assignment-1", 120),
      review("review-p1", 1, 10),
      {
        id: "mixed-1",
        kind: "mixed_practice",
        due: true,
        priority: 5,
      },
      {
        id: "corrective-urgent",
        kind: "corrective",
        estimatedDurationMin: 60,
        priority: 2,
        prerequisiteWithin48Hours: true,
        capOverrideApproved: true,
        capOverrideReason:
          "Repair is required before a foundational topic scheduled tomorrow.",
      },
    ];

    const plan = generateDailyPlan(makeInput(tasks));
    const repair = item(plan, "corrective-urgent");

    expect(plan.allocated_minutes).toBeLessThanOrEqual(180);
    expect(repair.allocated_minutes).toBeGreaterThan(30);
    expect(plan.repair_cap_override_used).toBe(true);
    expect(plan.mixed_minimum_reduced).toBe(true);
    expect(repair.forced_disposition).toBe("relearn");
  });
});

describe("planning decision logging", () => {
  it("does not duplicate the same deferral event when planning is rerun", () => {
    const plan = generateDailyPlan(
      makeInput(
        [review("review-capacity", 4, 10)],
        {
          settings: {
            ...DEFAULT_PLANNER_SETTINGS,
            daily_budget_min: 0,
          },
        },
      ),
    );

    expect(item(plan, "review-capacity").disposition).toBe("DEFER");

    const first = createPlanningDecisionEvents(plan, []);
    expect(first).toHaveLength(1);
    expect(first[0].event_type).toBe("defer");
    expect(first[0].actual_duration_min).toBe(0);
    expect(first[0].result).toBeNull();

    const second = createPlanningDecisionEvents(plan, first);
    expect(second).toHaveLength(0);

    const third = createPlanningDecisionEvents(
      plan,
      [...first, ...second],
    );
    expect(third).toHaveLength(0);
  });

  it("preserves earlier decisions when the user later chooses a different disposition", () => {
    const initialPlan = generateDailyPlan(
      makeInput(
        [review("review-changing", 4, 10)],
        {
          settings: {
            ...DEFAULT_PLANNER_SETTINGS,
            daily_budget_min: 0,
          },
        },
      ),
    );

    const firstEvents = createPlanningDecisionEvents(
      initialPlan,
      [],
    );

    const changedPlan = generateDailyPlan(
      makeInput(
        [review("review-changing", 4, 10)],
        {
          settings: {
            ...DEFAULT_PLANNER_SETTINGS,
            daily_budget_min: 0,
          },
          explicitDecisions: {
            "review-changing": {
              disposition: "DEFER",
              reason: "The user confirmed this deferral after reviewing the plan.",
            },
          },
        },
      ),
    );

    const newEvents = createPlanningDecisionEvents(
      changedPlan,
      firstEvents,
    );

    expect(firstEvents).toHaveLength(1);
    expect(newEvents).toHaveLength(1);
    expect(newEvents[0].id).not.toBe(firstEvents[0].id);

    const combined: TaskEvent[] = [
      ...firstEvents,
      ...newEvents,
    ];

    expect(combined).toHaveLength(2);
  });
});

describe("H4 — 10,000-scenario budget fuzz test", () => {
  it(
  "never overallocates, double-counts protected work, or silently drops a considered task",
  { timeout: 30_000 },
  () => {
    let seed = 0x5eed1234;

    function random(): number {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    }

    function integer(min: number, max: number): number {
      return min + Math.floor(random() * (max - min + 1));
    }

    for (let scenario = 0; scenario < 10_000; scenario += 1) {
      const budget = integer(0, 180);
      const tasks: PlanningTask[] = [];
      const id = (kind: string, index: number) =>
        `s${scenario}-${kind}-${index}`;

      const consolidationCount = integer(0, 3);

      for (let index = 0; index < consolidationCount; index += 1) {
        const estimate = integer(10, 90);
        const logged = integer(0, Math.floor(estimate / 2));

        tasks.push(
          consolidation(
            id("consolidation", index),
            estimate,
            {
              plannedDate: DATE,
              consolidationEstimatedDurationMin: estimate,
              loggedConsolidationMinutes: logged,
            },
          ),
        );
      }

      const assignmentCount = integer(0, 3);

      for (let index = 0; index < assignmentCount; index += 1) {
        tasks.push(
          assignment(
            id("assignment", index),
            integer(1, 240),
            {
              dueDate: addCalendarDays(
                DATE,
                integer(-3, 7),
              ),
              maxSessionMin: integer(10, 120),
              priority: integer(1, 5) as 1 | 2 | 3 | 4 | 5,
              importance: (
                ["low", "medium", "high", "critical"] as const
              )[integer(0, 3)],
            },
          ),
        );
      }

      const reviewCount = integer(0, 10);

      for (let index = 0; index < reviewCount; index += 1) {
        const reviewId = id("review", index);
        const questionCount = integer(2, 3);

        const questions = Array.from(
          { length: questionCount },
          (_, questionIndex) =>
            question(
              `${reviewId}-q${questionIndex}`,
              integer(1, 15),
            ),
        );

        tasks.push(
          review(
            reviewId,
            integer(1, 5) as 1 | 2 | 3 | 4 | 5,
            questions.reduce(
              (total, current) =>
                total + current.estimatedDurationMin,
              0,
            ),
            {
              currentDueDate: addCalendarDays(
                DATE,
                integer(-5, 0),
              ),
              intendedDueDate: addCalendarDays(
                DATE,
                integer(-5, 0),
              ),
              selectedQuestions: questions,
              deferCount: integer(0, 4),
              weaknessFlag: random() > 0.5,
              prerequisiteWithin48Hours: random() > 0.8,
              overdueDays: integer(0, 10),
            },
          ),
        );
      }

      const repairCount = integer(0, 3);

      for (let index = 0; index < repairCount; index += 1) {
        const isCorrective = random() > 0.35;
        const hasUrgentPrerequisite = random() > 0.75;
        const approvedOverride = hasUrgentPrerequisite && random() > 0.5;

        tasks.push({
          id: id("repair", index),
          kind: isCorrective ? "corrective" : "recovery",
          estimatedDurationMin: integer(5, 90),
          priority: hasUrgentPrerequisite ? 2 : 3,
          prerequisiteWithin48Hours: hasUrgentPrerequisite,
          capOverrideApproved: approvedOverride,
          capOverrideReason: approvedOverride
            ? "Fuzz-test urgent prerequisite override."
            : undefined,
        });
      }

      if (random() > 0.25) {
        tasks.push({
          id: id("mixed", 0),
          kind: "mixed_practice",
          due: true,
          priority: 5,
        });
      }

      const forcedDecisions: Record<
        string,
        {
          disposition:
            | "complete"
            | "split"
            | "relearn"
            | "skip"
            | "override_defer";
          reason: string;
          re_entry_condition?:
            | "later_failure"
            | "upcoming_exam"
            | "time_available"
            | "never";
        }
      > = {};

      for (const task of tasks) {
        if (
          task.kind === "review" &&
          task.deferCount >= 3 &&
          random() > 0.15
        ) {
          const choices = [
            "complete",
            "split",
            "relearn",
            "skip",
            "override_defer",
          ] as const;

          const disposition = choices[integer(0, choices.length - 1)];

          forcedDecisions[task.id] = {
            disposition,
            reason: `Fuzz scenario ${scenario}: explicit forced disposition.`,
            ...(disposition === "skip"
              ? {
                  re_entry_condition:
                    "upcoming_exam" as const,
                }
              : {}),
          };
        }
      }

      const plan = generateDailyPlan(
        makeInput(tasks, {
          settings: {
            ...DEFAULT_PLANNER_SETTINGS,
            daily_budget_min: budget,
          },
          forcedDecisions,
        }),
      );

      expect(plan.allocated_minutes).toBeLessThanOrEqual(budget);
      expect(plan.remaining_budget_minutes).toBeGreaterThanOrEqual(0);
      expect(plan.has_silent_drops).toBe(false);
      expect(plan.has_conflicting_dispositions).toBe(false);

      const ids = plan.items.map((candidate) => candidate.id);
      expect(new Set(ids).size).toBe(ids.length);

      const sum = plan.items.reduce(
        (total, candidate) =>
          total + candidate.allocated_minutes,
        0,
      );

      expect(sum).toBe(plan.allocated_minutes);

      for (const candidate of plan.items) {
        expect(candidate.allocated_minutes).toBeGreaterThanOrEqual(0);

        expect(
          candidate.disposition !== null ||
            candidate.decision_required,
        ).toBe(true);

        if (candidate.category === "PROTECTED") {
          expect(candidate.disposition).toBe("DO");
        }

        if (candidate.disposition === "SKIP") {
          expect(candidate.allocated_minutes).toBe(0);
          expect(candidate.reason).toBeTruthy();
          expect(candidate.re_entry_condition).toBeTruthy();
        }
      }
    }
  });
});

describe("unfinished consolidation", () => {
  it("subtracts only logged consolidation work and keeps an overdue topic in the learning queue", () => {
    const task = consolidation("topic-overdue", 45, {
      plannedDate: "2026-10-15",
      loggedConsolidationMinutes: 20,
    });

    const plan = generateDailyPlan(
      makeInput([task]),
    );

    const planned = item(plan, "topic-overdue");

    expect(planned.estimated_minutes).toBe(25);
    expect(planned.allocated_minutes).toBe(25);
    expect(planned.disposition).toBe("DO");
    expect(planned.category).toBe("PROTECTED");
    expect(planned.remaining_minutes).toBe(0);
  });

  it("does not treat the passage of the planned date as gate completion", () => {
    const task = consolidation("topic-still-learning", 45, {
      plannedDate: "2026-10-15",
      loggedConsolidationMinutes: 45,
    });

    const plan = generateDailyPlan(
      makeInput([task], {
        tasks: [
          {
            ...task,
            considered: false,
          },
        ],
      }),
    );

    expect(plan.items).toHaveLength(0);
  });
});

describe("incomplete review planning", () => {
  it("keeps the original review and selected question set while carrying only remaining questions", () => {
    const original = review("review-incomplete", 2, 15, {
      status: "in_progress",
      selectedQuestions: [
        question("q1", 5),
        question("q2", 5),
        question("q3", 5),
      ],
      remainingQuestionIds: ["q2", "q3"],
    });

    const plan = generateDailyPlan(
      makeInput([original], {
        settings: {
          ...DEFAULT_PLANNER_SETTINGS,
          daily_budget_min: 5,
          review_reserve_min: 0,
          min_mixed_practice_min: 0,
        },
      }),
    );

    const planned = item(plan, "review-incomplete");

    expect(planned.review_event_id).toBe("review-incomplete");
    expect(planned.selected_question_ids).toEqual(["q1", "q2", "q3"]);
    expect(planned.allocated_question_ids).toHaveLength(1);
    expect(planned.remaining_question_ids).toHaveLength(1);
    expect(planned.disposition).toBe("DO");
    expect(planned.reason).toContain("same ReviewEvent");
  });
});

describe("rest day and stable budgeting", () => {
  it("does not allocate study activities on Sunday", () => {
    const plan = generateDailyPlan({
      date: "2026-10-25",
      settings: DEFAULT_PLANNER_SETTINGS,
      tasks: [
        consolidation("sunday-topic", 45, {
          plannedDate: "2026-10-24",
        }),
      ],
    });

    expect(plan.allocated_minutes).toBe(0);
    expect(plan.items).toHaveLength(0);
    expect(plan.can_finalize).toBe(true);
  });

  it("rejects duplicate considered task IDs", () => {
    expect(() =>
      generateDailyPlan(
        makeInput([
          consolidation("duplicate", 45),
          consolidation("duplicate", 35),
        ]),
      ),
    ).toThrow(/unique/);
  });
});


describe("Saturday sampler allocation limits", () => {
  const samplerTask = {
    id: "sampler-budget-test",
    kind: "sampler" as const,
    due: true,
    priority: 4 as const,
    targetDurationMin: 80,
    analysisMaxMin: 10,
  };

  it("allocates the core sampler and analysis within the available daily budget", () => {
    const plan = generateDailyPlan({
      date: "2026-10-24",
      settings: {
        ...DEFAULT_PLANNER_SETTINGS,
        daily_budget_min: 45,
        review_reserve_min: 0,
        min_mixed_practice_min: 0,
      },
      tasks: [samplerTask],
    });

    expect(plan.allocated_minutes).toBeLessThanOrEqual(45);
    expect(plan.allocated_minutes).toBe(45);
    expect(totalForKind(plan, "sampler")).toBe(45);
    expect(item(plan, "sampler-budget-test").analysis_minutes).toBe(0);
    expect(plan.remaining_budget_minutes).toBe(0);
  });

  it("allocates the full 80-minute sampler plus 10-minute analysis when capacity permits", () => {
    const plan = generateDailyPlan({
      date: "2026-10-24",
      settings: DEFAULT_PLANNER_SETTINGS,
      tasks: [samplerTask],
    });

    expect(plan.allocated_minutes).toBe(90);
    expect(totalForKind(plan, "sampler")).toBe(90);
    expect(item(plan, "sampler-budget-test").analysis_minutes).toBe(10);
    expect(plan.allocated_minutes).toBeLessThanOrEqual(
      DEFAULT_PLANNER_SETTINGS.daily_budget_min,
    );
  });
});
