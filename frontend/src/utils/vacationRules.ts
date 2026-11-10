import { todayIso } from './dates';

export interface PeriodErrors {
  start?: string;
  end?: string;
}

/**
 * Client-side copy of the backend date rules, for instant feedback (the API still enforces them).
 * `checkPast` is false when editing a request whose period did not change: the backend lets an
 * already started pending request keep its dates (only the reason can then be edited).
 */
export function validatePeriod(
  start: string,
  end: string,
  { checkPast = true, today = todayIso() } = {},
): PeriodErrors {
  const errors: PeriodErrors = {};
  if (!start) errors.start = 'Start date is required.';
  else if (checkPast && start < today) errors.start = 'Start date cannot be in the past.';

  if (!end) errors.end = 'End date is required.';
  else if (start && end <= start) errors.end = 'End date must be after the start date.';

  return errors;
}
