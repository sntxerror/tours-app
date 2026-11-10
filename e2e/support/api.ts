import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/** Seeded by the database init script (db/init/02-seed.sql). */
export const DEMO_PASSWORD = 'Password123!';
export const USERS = {
  alice: 'alice@example.com', // Requester
  bob: 'bob@example.com', // Requester
  carol: 'carol@example.com', // Validator
} as const;

export interface Session {
  token: string;
  headers: { Authorization: string };
}

export async function login(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD,
): Promise<Session> {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.status(), `login as ${email}`).toBe(200);
  const { accessToken } = await res.json();
  return { token: accessToken, headers: { Authorization: `Bearer ${accessToken}` } };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * A future date range with a random start 1 to ~100 years out, so repeated runs (and parallel
 * tests) against the same database never overlap. Approved requests cannot be deleted, hence
 * the random offset rather than cleanup.
 */
export function futureRange(lengthDays = 3): { startDate: string; endDate: string } {
  const offset = 400 + Math.floor(Math.random() * 36_000);
  const start = new Date(Date.now() + offset * DAY_MS);
  return { startDate: iso(start), endDate: iso(new Date(start.getTime() + lengthDays * DAY_MS)) };
}

export const daysFromToday = (days: number): string => iso(new Date(Date.now() + days * DAY_MS));

export async function expectError(
  res: APIResponse,
  status: number,
  message?: RegExp,
): Promise<void> {
  expect(res.status()).toBe(status);
  if (message) expect(JSON.stringify((await res.json()).message)).toMatch(message);
}
