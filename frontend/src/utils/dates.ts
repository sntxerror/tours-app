/**
 * Date helpers for `YYYY-MM-DD` calendar dates and `YYYY-MM` months.
 *
 * Calendar dates are handled as UTC midnights so the user's time zone can never shift a day, and
 * "today" is the UTC date because that is what the backend uses for the "no past dates" rule.
 */

const DAY_MS = 86_400_000;

const toUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
// Timestamps (createdAt...) are real instants, so they are shown in the user's own time zone.
const timestampFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

export const todayIso = (now: Date = new Date()): string => toIso(now);

export function addDays(iso: string, days: number): string {
  const date = toUtcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

/** Number of calendar days covered by `start..end`, both ends included. */
export const daysInclusive = (start: string, end: string): number =>
  Math.round((toUtcDate(end).getTime() - toUtcDate(start).getTime()) / DAY_MS) + 1;

/** `2026-11-10` -> `10 Nov 2026` */
export const formatDate = (iso: string): string => dateFormat.format(toUtcDate(iso));

export const formatRange = (start: string, end: string): string =>
  `${formatDate(start)} – ${formatDate(end)}`;

/** ISO timestamp -> local date, e.g. `10 Nov 2026`. */
export const formatTimestamp = (timestamp: string): string =>
  timestampFormat.format(new Date(timestamp));

export const isWeekend = (iso: string): boolean => [0, 6].includes(toUtcDate(iso).getUTCDay());

// ---- Months (`YYYY-MM`)

export const currentMonth = (now: Date = new Date()): string => todayIso(now).slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return toIso(new Date(Date.UTC(year, monthIndex - 1 + delta, 1))).slice(0, 7);
}

/** First and last day of a month. */
export function monthBounds(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

/** `2026-11` -> `November 2026` */
export const formatMonth = (month: string): string => monthFormat.format(toUtcDate(`${month}-01`));

/** Every date from `from` to `to`, both included. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}
