"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cancelClass,
  getCancelledClassIds,
  getClasses,
  restoreClass,
} from "@/lib/classStorage";
import { ClassItem } from "@/lib/classes";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;

  return `${displayHour}:${mins
    .toString()
    .padStart(2, "0")} ${period}`;
}

function Donut({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const safeValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative grid h-20 w-20 place-items-center rounded-full"
        style={{
          background: `conic-gradient(#0f172a ${safeValue}%, #e2e8f0 ${safeValue}% 100%)`,
        }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-white">
          <span className="text-sm font-semibold">
            {safeValue}%
          </span>
        </div>
      </div>

      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-slate-500">
          of the school day is available
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [allClasses, setAllClasses] = useState<ClassItem[]>([]);
  const [cancelledIds, setCancelledIds] = useState<number[]>([]);
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
    setAllClasses(getClasses());
    setCancelledIds(getCancelledClassIds());
}, []);

const todayName = today
  ? WEEKDAYS[today.getDay()]
  : "";

const dateLabel = today
  ? today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  : "Today";


  const todaysClasses = useMemo(() => {
    return allClasses
      .filter((item) => item.day === todayName)
      .sort(
        (a, b) =>
          timeToMinutes(a.start) -
          timeToMinutes(b.start),
      );
  }, [allClasses, todayName]);

  const activeClasses = todaysClasses.filter(
    (item) => !cancelledIds.includes(item.id),
  );

  const availableWindows = useMemo(() => {
    const windows: {
      start: string;
      end: string;
      minutes: number;
    }[] = [];

    let cursor = 7 * 60;
    const schoolEnd = 17 * 60;

    for (const item of activeClasses) {
      const classStart = timeToMinutes(item.start);
      const classEnd = timeToMinutes(item.end);

      if (classStart > cursor) {
        windows.push({
          start: minutesToLabel(cursor),
          end: minutesToLabel(classStart),
          minutes: classStart - cursor,
        });
      }

      cursor = Math.max(cursor, classEnd);
    }

    if (cursor < schoolEnd) {
      windows.push({
        start: minutesToLabel(cursor),
        end: minutesToLabel(schoolEnd),
        minutes: schoolEnd - cursor,
      });
    }

    return windows;
  }, [activeClasses]);

  const totalAvailableMinutes = availableWindows.reduce(
    (total, window) => total + window.minutes,
    0,
  );

  const availabilityPercentage = Math.round(
    (totalAvailableMinutes / (10 * 60)) * 100,
  );

  const cancelTodayClass = (id: number) => {
    cancelClass(id);

    setCancelledIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  };

  const restoreTodayClass = (id: number) => {
    restoreClass(id);

    setCancelledIds((current) =>
      current.filter((item) => item !== id),
    );
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <header className="mb-8">
          <p className="text-sm font-medium text-slate-500">
            {dateLabel}
          </p>

          <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Good morning
              </h1>

              <p className="mt-2 text-slate-600">
                Here&apos;s what your day looks like.
              </p>
            </div>

            <div className="rounded-full bg-white px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-slate-200">
              School day
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
          <p className="text-sm font-medium text-slate-400">
            TODAY
          </p>

          {activeClasses.length > 0 ? (
            <>
              <h2 className="mt-2 text-2xl font-semibold">
                {activeClasses.length} class
                {activeClasses.length === 1 ? "" : "es"} scheduled
              </h2>

              <p className="mt-2 text-slate-300">
                You have {totalAvailableMinutes} minutes of open
                time during the school day.
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-2 text-2xl font-semibold">
                No classes today
              </h2>

              <p className="mt-2 text-slate-300">
                This could be a useful day for study, reading,
                projects, or rest.
              </p>
            </>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Today&apos;s classes
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {todayName}
                </p>
              </div>

              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium">
                {todaysClasses.length}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {todaysClasses.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  No classes are scheduled for today.
                </p>
              ) : (
                todaysClasses.map((item) => {
                  const cancelled =
                    cancelledIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 ${
                        cancelled
                          ? "border-dashed border-slate-300 bg-slate-50"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p
                              className={`font-medium ${
                                cancelled
                                  ? "text-slate-400 line-through"
                                  : ""
                              }`}
                            >
                              {item.name}
                            </p>

                            {cancelled && (
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                                Cancelled
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            {item.type} · {item.start}–
                            {item.end}
                          </p>
                        </div>

                        {cancelled ? (
                          <button
                            onClick={() =>
                              restoreTodayClass(item.id)
                            }
                            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              cancelTodayClass(item.id)
                            }
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-semibold">
              Available time
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Your exact open windows today.
            </p>

            <div className="mt-6">
              <Donut
                value={availabilityPercentage}
                label={`${totalAvailableMinutes} minutes available`}
              />
            </div>

            <div className="mt-6 space-y-3">
              {availableWindows.length > 0 ? (
                availableWindows.map((window) => (
                  <div
                    key={`${window.start}-${window.end}`}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                  >
                    <span className="font-medium">
                      {window.start}–{window.end}
                    </span>

                    <span className="text-sm text-slate-500">
                      {window.minutes} min
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  No open time during school hours.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reading</h2>

              <span className="text-sm text-slate-500">
                Coming next
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              We&apos;ll build your reading system next so the
              app can track what you read, when you read, and how
              much you read.
            </p>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Projects</h2>

              <span className="text-sm text-slate-500">
                Coming later
              </span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-500">
              Your projects will eventually feed into the same
              daily picture as your classes, study, and reading.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}