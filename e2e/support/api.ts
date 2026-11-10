import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export const DEMO_PASSWORD = 'Password123!';
export const USERS = {
  alice: 'alice@example.com', // Requester
  bob: 'bob@example.com', // Requester
  // Used by the UI specs only: the API specs make assumptions about alice's and bob's lists.
  dave: 'dave@example.com', // Requester
  erin: 'erin@example.com', // Requester
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

const MAX_OFFSET_DAYS = 2_800_000;
const SLOT_DAYS = 30;
const WORKERS = 16;
const worker = Number(process.env.TEST_PARALLEL_INDEX ?? 0) % WORKERS;
const usedSlots = new Set<number>();

/**
 * A future date range that cannot clash with another range of this run: each worker owns every
 * 16th 30-day slot and never reuses one. Leftovers of earlier runs are deleted by the global setup
 * (e2e/global-setup.ts), which only touches rows at least 400 days out. Keep `lengthDays` below 30.
 */
export function futureRange(lengthDays = 3): { startDate: string; endDate: string } {
  const slotsPerWorker = Math.floor((MAX_OFFSET_DAYS - 400) / SLOT_DAYS / WORKERS);
  let slot: number;
  do {
    slot = Math.floor(Math.random() * slotsPerWorker) * WORKERS + worker;
  } while (usedSlots.has(slot));
  usedSlots.add(slot);
  const start = new Date(Date.now() + (400 + slot * SLOT_DAYS) * DAY_MS);
  return { startDate: iso(start), endDate: iso(new Date(start.getTime() + lengthDays * DAY_MS)) };
}

/**
 * Like `futureRange`, but the lowest still unused slot of this worker (400-880 days out), so a UI
 * test can reach its month with a few clicks. Still collision-free: `futureRange` skips used slots.
 */
export function nearFutureRange(lengthDays = 3): { startDate: string; endDate: string } {
  let slot = worker;
  while (usedSlots.has(slot)) slot += WORKERS;
  usedSlots.add(slot);
  const start = new Date(Date.now() + (400 + slot * SLOT_DAYS) * DAY_MS);
  return { startDate: iso(start), endDate: iso(new Date(start.getTime() + lengthDays * DAY_MS)) };
}

export const daysFromToday = (days: number): string => iso(new Date(Date.now() + days * DAY_MS));

export async function createRequest(
  request: APIRequestContext,
  session: Session,
  data: { startDate: string; endDate: string; reason?: string } = futureRange(),
): Promise<{ id: string; startDate: string; endDate: string }> {
  const res = await request.post('/api/vacation-requests', { headers: session.headers, data });
  expect(res.status(), 'create vacation request').toBe(201);
  return res.json();
}

export async function decide(
  request: APIRequestContext,
  validator: Session,
  id: string,
  decision: 'approve' | 'reject',
  comment?: string,
): Promise<void> {
  const res = await request.post(`/api/vacation-requests/${id}/${decision}`, {
    headers: validator.headers,
    data: comment ? { comment } : {},
  });
  expect(res.status(), `${decision} request`).toBe(200);
}

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

export async function listEvents(
  request: APIRequestContext,
  predicate: (event: ReceivedEnvelope) => boolean = () => true,
): Promise<ReceivedEnvelope[]> {
  const res = await request.get('/api/test/events');
  const received: { envelope: { detail: ReceivedEnvelope } }[] = await res.json();
  return received.map((r) => r.envelope.detail).filter(predicate);
}

/**
 * Waits until the worker has consumed an event matching `predicate` and returns its envelope. This
 * exercises the whole chain: outbox -> relay -> EventBridge -> SQS -> framework routing -> subscriber
 * (the dev-only `/api/test/events` log). Match on ids unique to the test, since other tests run in
 * parallel against the same bus.
 */
export async function waitForEvent(
  request: APIRequestContext,
  predicate: (event: ReceivedEnvelope) => boolean,
): Promise<ReceivedEnvelope> {
  let found: ReceivedEnvelope | undefined;
  await expect
    .poll(async () => (found = (await listEvents(request, predicate))[0]) !== undefined, {
      message: 'event was not delivered to the queue consumer',
      timeout: 15_000,
    })
    .toBe(true);
  return found!;
}

export const ofRequest =
  (requestId: string, type?: string) =>
  (event: ReceivedEnvelope): boolean =>
    event.data.requestId === requestId && (type === undefined || event.type === type);

export const newRequestId = (): string => `e2e-${crypto.randomUUID()}`;
