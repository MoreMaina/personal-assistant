"use client";

import { FormEvent, useState } from "react";
import {
  addClass,
  getClasses,
} from "@/lib/classStorage";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const types = [
  "Lecture",
  "Tutorial",
  "Practical",
  "Seminar",
  "Other",
];

export default function ClassesPage() {
  const [classList, setClassList] = useState(getClasses);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState("Lecture");
  const [day, setDay] = useState("Monday");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Please enter a class name.");
      return;
    }

    if (!start || !end) {
      setError("Please enter both a start and end time.");
      return;
    }

    if (end <= start) {
      setError("The end time must be later than the start time.");
      return;
    }

    const createdClass = addClass({
      name: name.trim(),
      type,
      day,
      start,
      end,
    });

    setClassList((current) => [...current, createdClass]);

    setName("");
    setType("Lecture");
    setDay("Monday");
    setStart("");
    setEnd("");
    setShowForm(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
        <div className="mb-8">
          <p className="text-sm font-medium text-slate-500">
            Your timetable
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Classes
          </h1>

          <p className="mt-2 text-slate-600">
            Manage the classes that shape your school days.
          </p>
        </div>

        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Current semester
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Add your classes when your new timetable is available.
            </p>
          </div>

          <button
  type="button"
  onClick={() => setShowForm(true)}
  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
>
  + Add class
</button>

        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
          >
            <h2 className="text-lg font-semibold">
              Add a class
            </h2>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">
                  Class name
                </label>

                <input
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="e.g. Economics"
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  Type
                </label>

                <select
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  {types.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Day
                </label>

                <select
                  value={day}
                  onChange={(event) =>
                    setDay(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                >
                  {days.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Start time
                </label>

                <input
                  type="time"
                  value={start}
                  onChange={(event) =>
                    setStart(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium">
                  End time
                </label>

                <input
                  type="time"
                  value={end}
                  onChange={(event) =>
                    setEnd(event.target.value)
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="mt-4 text-sm font-medium text-red-600">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Add class
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {classList.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">
                    {item.name}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    {item.type} · {item.day}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-medium">
                    {item.start}–{item.end}
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Scheduled class
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}