import { expect, type Locator, type Page } from '@playwright/test';
import { DEMO_PASSWORD, type Session } from './api';

const TOKEN_KEY = 'vacation-manager.token';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface Range {
  startDate: string;
  endDate: string;
}

// The browser's ICU decides how a month is abbreviated (en-GB prints "Sept" in newer versions),
// so September is matched in both spellings.
const label = (iso: string): string => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]}${month === 9 ? 't?' : ''} ${year}`;
};

/** Regular expression source for a range as the app prints it, e.g. `3 Mar 2027 – 6 Mar 2027`. */
export const rangeSource = ({ startDate, endDate }: Range): string =>
  `${label(startDate)} – ${label(endDate)}`;

/** Matches the text of a range as the app prints it. */
export const rangeLabel = (range: Range): RegExp => new RegExp(rangeSource(range));

/** `2027-03-03` -> `March 2027`, the team calendar heading. */
export const monthLabel = (iso: string): string => {
  const [year, month] = iso.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
};

/** Logs in through the form, the way a user does. */
export async function loginThroughForm(
  page: Page,
  email: string,
  password = DEMO_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/**
 * Starts the browser logged in, without going through the form: stores the token the way the app
 * does (see `store/auth.ts`). Open the page you want afterwards with `page.goto`.
 */
export async function signIn(page: Page, session: Session): Promise<void> {
  await page.goto('/login');
  await page.evaluate(
    ([key, token]) => localStorage.setItem(key, token),
    [TOKEN_KEY, session.token],
  );
}

/** The table row of the request with this period (periods are unique per test). */
export const requestRow = (page: Page, range: Range): Locator =>
  page.getByRole('row').filter({ hasText: rangeLabel(range) });

export async function fillPeriod(
  scope: Page | Locator,
  { startDate, endDate }: Range,
): Promise<void> {
  await scope.getByLabel('Start date').fill(startDate);
  await scope.getByLabel('End date').fill(endDate);
}

export const expectNotice = (page: Page, text: string | RegExp): Promise<void> =>
  expect(page.getByRole('status').filter({ hasText: text })).toBeVisible();
