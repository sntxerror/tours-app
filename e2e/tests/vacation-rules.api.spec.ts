import { expect, test } from '@playwright/test';
import { USERS, daysFromToday, expectError, futureRange, login } from '../support/api';

test.describe('vacation business rules', () => {
  test('submits a valid request as Pending', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    const range = futureRange();
    const res = await request.post('/api/vacation-requests', {
      headers,
      data: { ...range, reason: 'e2e' },
    });
    expect(res.status()).toBe(201);
    expect(await res.json()).toMatchObject({ ...range, status: 'Pending' });
  });

  test('rejects a single-day request (end must be after start)', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    const { startDate } = futureRange();
    await expectError(
      await request.post('/api/vacation-requests', {
        headers,
        data: { startDate, endDate: startDate },
      }),
      400,
      /after start date/i,
    );
  });

  test('rejects an end date before the start date', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    const { startDate, endDate } = futureRange();
    await expectError(
      await request.post('/api/vacation-requests', {
        headers,
        data: { startDate: endDate, endDate: startDate },
      }),
      400,
      /after start date/i,
    );
  });

  test('rejects requests in the past', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    await expectError(
      await request.post('/api/vacation-requests', {
        headers,
        data: { startDate: daysFromToday(-10), endDate: daysFromToday(-5) },
      }),
      400,
      /past/i,
    );
  });

  test('rejects overlapping requests for the same user, allows other users', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const bob = await login(request, USERS.bob);
    const range = futureRange(5);

    const first = await request.post('/api/vacation-requests', {
      headers: alice.headers,
      data: range,
    });
    expect(first.status()).toBe(201);

    await expectError(
      await request.post('/api/vacation-requests', { headers: alice.headers, data: range }),
      409,
    );
    const other = await request.post('/api/vacation-requests', {
      headers: bob.headers,
      data: range,
    });
    expect(other.status()).toBe(201);
  });

  test('a rejection needs a comment; only validators decide', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await request.post('/api/vacation-requests', {
      headers: alice.headers,
      data: futureRange(),
    });
    const { id } = await created.json();

    await expectError(
      await request.post(`/api/vacation-requests/${id}/approve`, { headers: alice.headers }),
      403,
    );
    await expectError(
      await request.post(`/api/vacation-requests/${id}/reject`, {
        headers: carol.headers,
        data: {},
      }),
      400,
    );
    const rejected = await request.post(`/api/vacation-requests/${id}/reject`, {
      headers: carol.headers,
      data: { comment: 'Team is understaffed' },
    });
    expect(rejected.ok()).toBeTruthy();
    expect(await rejected.json()).toMatchObject({
      status: 'Rejected',
      comments: 'Team is understaffed',
    });
  });

  test('approved requests cannot be modified or cancelled', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await request.post('/api/vacation-requests', {
      headers: alice.headers,
      data: futureRange(),
    });
    const { id } = await created.json();
    const approved = await request.post(`/api/vacation-requests/${id}/approve`, {
      headers: carol.headers,
    });
    expect(approved.ok()).toBeTruthy();

    await expectError(
      await request.patch(`/api/vacation-requests/${id}`, {
        headers: alice.headers,
        data: { reason: 'changed' },
      }),
      409,
    );
    await expectError(
      await request.delete(`/api/vacation-requests/${id}`, { headers: alice.headers }),
      409,
    );
  });
});
