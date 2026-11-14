/**
 * Formats stored HH:mm values for display using a 12-hour clock.
 * The saved value remains unchanged for scheduling and persistence.
 */
export function formatTime12Hour(
  value: string | null | undefined,
): string {
  if (!value) return "";

  const match = /^(\d{2}):([0-5]\d)$/.exec(value);
  if (!match) return value;

  const hours = Number(match[1]);
  if (hours > 23) return value;

  const date = new Date(2000, 0, 1, hours, Number(match[2]));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
