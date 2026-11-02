/**
 * Shared activity contracts.
 *
 * These are coordination types only. They do not replace the
 * feature-specific Study, Reading, Project, or Personal records.
 */

export const ACTIVITY_KINDS = {
  study: [
    "topic",
    "retrieval_task",
    "review",
    "gate_attempt",
    "assignment",
    "corrective_task",
    "recovery_task",
    "initial_learning",
    "topic_consolidation",
    "mixed_practice",
    "sampler",
    "exam",
  ],
  reading: [
    "book",
    "essay",
  ],
  project: [
    "project",
    "milestone",
    "task",
  ],
  personal: [
    "task",
    "appointment",
    "class",
  ],
} as const;

export type ActivityDomain = keyof typeof ACTIVITY_KINDS;

export type ActivityIdentity = {
  [Domain in ActivityDomain]: {
    domain: Domain;
    kind: (typeof ACTIVITY_KINDS)[Domain][number];
    entityId: string | number;
  };
}[ActivityDomain];

export type ActivityPriority = 1 | 2 | 3 | 4 | 5;

/**
 * A completed session of work against a shared activity identity.
 * Existing feature-specific sessions remain authoritative until
 * explicit adapters are implemented.
 */
export type ActivitySessionSource =
  | "manual"
  | "item_timer"
  | "pomodoro";

export interface ActivitySession {
  id: string;
  activityKey: string;
  startedAt: string;
  endedAt: string;
  actualDurationSeconds: number;
  plannedDurationSeconds?: number | null;
  source: ActivitySessionSource;
  notes?: string;
}

/**
 * Optional shared scheduling metadata.
 * Feature-specific scheduling rules remain in their own models.
 */
export interface ActivitySchedule {
  activityKey: string;
  scheduledStartAt?: string | null;
  dueAt?: string | null;
  estimatedDurationMinutes?: number | null;
  priority?: ActivityPriority | null;
}
