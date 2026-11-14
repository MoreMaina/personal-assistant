"use client";

import { useEffect, useState } from "react";

type TimeParts = {
  hour: string;
  minute: string;
  period: string;
};

type TimeInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

function parseTime(value: string): TimeParts {
  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (!match || Number(match[1]) > 23) {
    return { hour: "", minute: "", period: "" };
  }

  const hour24 = Number(match[1]);
  return {
    hour: String(hour24 % 12 || 12),
    minute: match[2],
    period: hour24 >= 12 ? "PM" : "AM",
  };
}

function toStoredTime(parts: TimeParts): string {
  const hour12 = Number(parts.hour);
  const hour24 = (hour12 % 12) + (parts.period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${parts.minute}`;
}

const controlClassName =
  "min-w-0 w-full rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] px-2 py-2.5 text-sm font-semibold text-[var(--ink)]";

export default function TimeInput({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
}: TimeInputProps) {
  const [parts, setParts] = useState<TimeParts>(() => parseTime(value));

  useEffect(() => {
    setParts(parseTime(value));
  }, [value]);

  function update(next: TimeParts) {
    setParts(next);

    if (!next.hour && !next.minute && !next.period) {
      onChange("");
      return;
    }

    if (next.hour && next.minute && next.period) {
      onChange(toStoredTime(next));
    } else if (
      (parts.hour || parts.minute || parts.period) &&
      (!next.hour || !next.minute || !next.period)
    ) {
      onChange("");
    }
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="sr-only" htmlFor={`${id}-hour`}>Hour</label>
      <select
        id={`${id}-hour`}
        aria-label="Hour"
        className={controlClassName}
        value={parts.hour}
        required={required}
        disabled={disabled}
        onChange={(event) => update({ ...parts, hour: event.target.value })}
      >
        <option value="">Hour</option>
        {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
          <option key={hour} value={hour}>{hour}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`${id}-minute`}>Minute</label>
      <select
        id={`${id}-minute`}
        aria-label="Minute"
        className={controlClassName}
        value={parts.minute}
        required={required}
        disabled={disabled}
        onChange={(event) => update({ ...parts, minute: event.target.value })}
      >
        <option value="">Minute</option>
        {Array.from({ length: 60 }, (_, minute) =>
          String(minute).padStart(2, "0"),
        ).map((minute) => (
          <option key={minute} value={minute}>{minute}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`${id}-period`}>AM or PM</label>
      <select
        id={`${id}-period`}
        aria-label="AM or PM"
        className={controlClassName}
        value={parts.period}
        required={required}
        disabled={disabled}
        onChange={(event) => update({ ...parts, period: event.target.value })}
      >
        <option value="">AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
