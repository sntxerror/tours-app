import { expect, test } from '@playwright/test';
import { USERS, expectError, futureRange, login } from '../support/api';

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * 864e5).toISOString().slice(0, 10);

test.describe('team calendar', () => {
  test('shows approved vacations only, without private fields, to every role', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const bob = await login(request, USERS.bob);
    const carol = await login(request, USERS.carol);
    const range = futureRange(3);
    const other = futureRange(3);

    const approved = await (
      await request.post('/api/vacation-requests', {
        headers: alice.headers,
        data: { ...range, reason: 'private' },
      })
    ).json();
    const pending = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: other })
    ).json();
    await request.post(`/api/vacation-requests/${approved.id}/approve`, {
      headers: carol.headers,
      data: { comment: 'validator note' },
    });

    for (const viewer of [alice, bob, carol]) {
      const res = await request.get(
        `/api/team/vacations?from=${range.startDate}&to=${range.endDate}`,
        { headers: viewer.headers },
      );
      expect(res.status()).toBe(200);
      const items: Array<Record<string, any>> = await res.json();
      const mine = items.find((i) => i.id === approved.id);
      expect(mine).toEqual({
        id: approved.id,
        startDate: range.startDate,
        endDate: range.endDate,
        user: { id: approved.userId, name: expect.any(String) },
      });
      expect(items.map((i) => i.id)).not.toContain(pending.id);
      expect(JSON.stringify(items)).not.toMatch(/private|validator note|@example\.com/);
    }
  });

  test('includes vacations overlapping the window edges and excludes outside ones', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const range = futureRange(4);
    const { id } = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: range })
    ).json();
    await request.post(`/api/vacation-requests/${id}/approve`, { headers: carol.headers });

    const ids = async (from: string, to: string) =>
      (
        (await (
          await request.get(`/api/team/vacations?from=${from}&to=${to}`, { headers: alice.headers })
        ).json()) as { id: string }[]
      ).map((i) => i.id);

    // Window ends on the first day / starts on the last day: still overlapping.
    expect(await ids(addDays(range.startDate, -10), range.startDate)).toContain(id);
    expect(await ids(range.endDate, addDays(range.endDate, 10))).toContain(id);
    // Windows entirely before / after.
    expect(await ids(addDays(range.startDate, -10), addDays(range.startDate, -1))).not.toContain(
      id,
    );
    expect(await ids(addDays(range.endDate, 1), addDays(range.endDate, 10))).not.toContain(id);
  });

  test('defaults to the current month', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    const res = await request.get('/api/team/vacations', { headers });
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('validates the window', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    await expectError(
      await request.get('/api/team/vacations?from=2030-02-01&to=2030-01-01', { headers }),
      400,
      /must not be before/i,
    );
    await expectError(
      await request.get('/api/team/vacations?from=2030-01-01&to=2031-01-03', { headers }),
      400,
      /366/,
    );
    await expectError(await request.get('/api/team/vacations?from=2030-02-30', { headers }), 400);
    await expectError(await request.get('/api/team/vacations?from=yesterday', { headers }), 400);
  });

  test('requires authentication', async ({ request }) => {
    await expectError(await request.get('/api/team/vacations'), 401);
  });
});

test.describe('users', () => {
  test('a validator lists users ordered by name, without password hashes', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    const res = await request.get('/api/users', { headers });
    expect(res.status()).toBe(200);
    const users: Array<Record<string, any>> = await res.json();
    expect(users.map((u) => u.email)).toEqual(expect.arrayContaining(Object.values(USERS)));
    const names = users.map((u) => u.name as string);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    for (const u of users) expect(u).not.toHaveProperty('password');
  });

  test('filters by role', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    const validators: Array<{ role: string; email: string }> = await (
      await request.get('/api/users?role=Validator', { headers })
    ).json();
    expect(validators.length).toBeGreaterThan(0);
    expect(validators.every((u) => u.role === 'Validator')).toBe(true);
    expect(validators.map((u) => u.email)).toContain(USERS.carol);
  });

  test('rejects an unknown role or query parameter', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    await expectError(await request.get('/api/users?role=Admin', { headers }), 400);
    await expectError(await request.get('/api/users?foo=bar', { headers }), 400);
  });
});
