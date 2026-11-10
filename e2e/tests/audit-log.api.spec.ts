import { expect, test } from '@playwright/test';
import {
  USERS,
  expectError,
  futureRange,
  login,
  newRequestId,
  waitForAuditEntry,
} from '../support/api';

test.describe('GET /audit-log', () => {
  test('is for validators only', async ({ request }) => {
    expect((await request.get('/api/audit-log')).status()).toBe(401);
    const alice = await login(request, USERS.alice);
    await expectError(await request.get('/api/audit-log', { headers: alice.headers }), 403);
  });

  test('returns a newest-first page with the pagination meta', async ({ request }) => {
    const carol = await login(request, USERS.carol);
    const res = await request.get('/api/audit-log?limit=3', { headers: carol.headers });
    expect(res.ok()).toBeTruthy();

    const page = await res.json();
    expect(page.items.length).toBeLessThanOrEqual(3);
    expect(page.meta).toMatchObject({ page: 1, limit: 3 });
    const times = page.items.map((e: { occurredAt: string }) => Date.parse(e.occurredAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test('filters by type, correlation id and vacation request', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const correlationId = newRequestId();
    const created = await (
      await request.post('/api/vacation-requests', {
        headers: { ...alice.headers, 'x-request-id': correlationId },
        data: futureRange(),
      })
    ).json();
    await waitForAuditEntry(request, { correlationId });

    const get = async (query: string) =>
      (await (await request.get(`/api/audit-log?${query}`, { headers: carol.headers })).json())
        .items;

    const byCorrelation = await get(`correlationId=${correlationId}`);
    expect(byCorrelation).toHaveLength(1);
    expect(byCorrelation[0].data.requestId).toBe(created.id);

    const byRequest = await get(`requestId=${created.id}`);
    expect(byRequest.map((e: { type: string }) => e.type)).toEqual([
      'travel.vacation-request.submitted',
    ]);

    const byType = await get(
      `type=travel.vacation-request.submitted&correlationId=${correlationId}`,
    );
    expect(byType).toHaveLength(1);
    const wrongType = await get(
      `type=travel.vacation-request.approved&correlationId=${correlationId}`,
    );
    expect(wrongType).toHaveLength(0);
  });

  test.describe('rejects bad filters with 400', () => {
    for (const query of [
      'type=not.an.event',
      'requestId=nope',
      'correlationId=has%20space',
      'limit=1000',
    ]) {
      test(query, async ({ request }) => {
        const carol = await login(request, USERS.carol);
        await expectError(
          await request.get(`/api/audit-log?${query}`, { headers: carol.headers }),
          400,
        );
      });
    }
  });
});
