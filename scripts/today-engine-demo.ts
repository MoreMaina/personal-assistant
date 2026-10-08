import {
  getFreeWindows,
  getTodayRecommendation,
  type FixedEvent,
  type TodayTask,
} from "../lib/today-engine";

const now = new Date();
now.setHours(10, 0, 0, 0);

const classes: FixedEvent[] = [
  {
    id: "class-1",
    title: "Economics",
    startAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      11,
      0,
    ),
    endAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12,
      0,
    ),
  },
  {
    id: "class-2",
    title: "Accounting",
    startAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      14,
      0,
    ),
    endAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      15,
      0,
    ),
  },
];

const tasks: TodayTask[] = [
  {
    id: "study-1",
    title: "ECON Lecture 4",
    type: "study",
    durationMinutes: 30,
    priority: 4,
    dueAt: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      9,
      0,
    ),
  },
  {
    id: "reading-1",
    title: "Second pass — essay",
    type: "reading",
    durationMinutes: 20,
    priority: 3,
  },
  {
    id: "project-1",
    title: "Literature review",
    type: "project",
    durationMinutes: 60,
    priority: 5,
  },
];

console.log(
  "FREE WINDOWS:",
  getFreeWindows(classes, now),
);

console.log(
  "RECOMMENDATION:",
  getTodayRecommendation(
    classes,
    tasks,
    now,
  ),
);