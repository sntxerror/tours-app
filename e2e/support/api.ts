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

export interface ReceivedEnvelope {
  eventId: string;
  schemaVersion: number;
  occurredAt: string;
  type: string;
  correlationId: string;
  actor: { type: string; id?: string; role?: string };
  data: Record<string, unknown>;
}

/**
 * Waits until the worker has consumed an event matching `predicate` (EventBridge -> SQS -> the
 * dev-only `/api/test/events` log) and returns its envelope. Match on ids unique to the test, since
 * other tests run in parallel against the same bus.
 */
export async function waitForEvent(
  request: APIRequestContext,
  predicate: (event: ReceivedEnvelope) => boolean,
): Promise<ReceivedEnvelope> {
  let found: ReceivedEnvelope | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get('/api/test/events');
        // The worker stores the EventBridge wrapper; our own envelope is its `detail`.
        const received: { envelope: { detail: ReceivedEnvelope } }[] = await res.json();
        found = received.map((r) => r.envelope.detail).find(predicate);
        return found !== undefined;
      },
      { message: 'event was not delivered to the queue consumer', timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

/** A caller-chosen request id: lets a test find the events caused by exactly its own request. */
export const newRequestId = (): string => `e2e-${crypto.randomUUID()}`;
