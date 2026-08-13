/**
 * Septian calendar date utilities.
 */

export type DatePrecision = 'day' | 'month' | 'year';

export interface EventDate {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
}

const MONTHS = [
  { name: 'January', length: 31 },
  { name: 'February', length: 28 },
  { name: 'March', length: 31 },
  { name: 'April', length: 30 },
  { name: 'May', length: 31 },
  { name: 'June', length: 30 },
  { name: 'July', length: 31 },
  { name: 'August', length: 31 },
  { name: 'September', length: 30 },
  { name: 'October', length: 31 },
  { name: 'November', length: 30 },
  { name: 'December', length: 31 },
];

export function daysInMonth(month: number): number {
  return MONTHS[month - 1].length;
}

/**
 * 1-indexed day-of-year (Jan 1 = 1).
 */
export function dayOfYear(month: number, day: number): number {
  let total = day;

  for (let m = 1; m < month; m++) {
    total += daysInMonth(m);
  }

  return total;
}

/**
 * Produces a single sortable/positionable number for any EventDate,
 * regardless of precision. Partial dates resolve to the start of the
 * known range (year-only -> Jan 1; month-only -> the 1st) so ordering
 * is always well-defined even when exact days aren't known.
 */
export function sortKey(date: EventDate): number {
  const month = date.month ?? 1;
  const day = date.day ?? 1;

  return date.year * 365 + dayOfYear(month, day);
}

export function compareDates(a: EventDate, b: EventDate): number {
  return sortKey(a) - sortKey(b);
}

/**
 * Formatting while respecting precision so a year-only event
 * doesn't get a fabricated "the 1st of January" attached to it.
 */
export function formatDate(date: EventDate): string {
  const { year, month, day, precision } = date;

  if (precision === 'year' || month === undefined) {
    return `S.${year}`;
  }

  const monthName = MONTHS[month - 1].name;

  if (precision === 'month' || day === undefined) {
    return `${monthName}, S.${year}`;
  }

  return `S.${year}, the ${ordinal(day)} of ${monthName}`;
}

function ordinal(n: number): string {
  const rem100 = n % 100;

  if (rem100 >= 11 && rem100 <= 13) {
    return `${n}th`;
  }

  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Maps a set of EventDates onto a [0, 1] normalized range for positioning
 */
export function normalizedPosition(date: EventDate, minKey: number, maxKey: number): number {
  const key = sortKey(date);

  if (maxKey === minKey) {
    return 0;
  }

  return (key - minKey) / (maxKey - minKey);
}