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

/** Latest start offset that still formats as a four-digit year (the API only accepts YYYY-MM-DD). */
const MAX_OFFSET_DAYS = 2_800_000;
const SLOT_DAYS = 30;
/** Slots are partitioned by Playwright worker, so parallel workers can never pick the same one. */
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

export interface AuditEntry {
  eventId: string;
  type: string;
  occurredAt: string;
  correlationId: string;
  actor: { type: string; id?: string; role?: string };
  data: Record<string, unknown>;
}

/**
 * Waits until the audit-log consumer has recorded an event for the given filters and returns it.
 * This exercises the whole chain: outbox -> relay -> EventBridge -> SQS -> framework routing ->
 * subscriber -> database -> API. Filter on something unique to the test (its `X-Request-Id`, or the
 * vacation request id), since other tests run in parallel.
 */
export async function waitForAuditEntry(
  request: APIRequestContext,
  filters: { correlationId?: string; requestId?: string; type?: string },
  predicate: (entry: AuditEntry) => boolean = () => true,
): Promise<AuditEntry> {
  const { headers } = await login(request, USERS.carol);
  const query = new URLSearchParams({ limit: '100', ...filters });
  let found: AuditEntry | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(`/api/audit-log?${query}`, { headers });
        const page: { items: AuditEntry[] } = await res.json();
        found = page.items.find(predicate);
        return found !== undefined;
      },
      { message: `no audit entry for ${query}`, timeout: 15_000 },
    )
    .toBe(true);
  return found!;
}

/** Every audit entry currently recorded for the filters (no waiting). */
export async function listAuditEntries(
  request: APIRequestContext,
  filters: { correlationId?: string; requestId?: string; type?: string },
): Promise<AuditEntry[]> {
  const { headers } = await login(request, USERS.carol);
  const query = new URLSearchParams({ limit: '100', ...filters });
  const res = await request.get(`/api/audit-log?${query}`, { headers });
  return (await res.json()).items;
}
