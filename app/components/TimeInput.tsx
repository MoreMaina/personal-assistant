"use client";

type TimeInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
};

export default function TimeInput({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
}: TimeInputProps) {
  // Native time inputs use HH:mm, matching the existing storage format.
  const normalizedValue = /^\d{2}:\d{2}$/.test(value) ? value : "";

  return (
    <input
      id={id}
      type="time"
      step={60}
      value={normalizedValue}
      required={required}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)]"
    />
  );
}
