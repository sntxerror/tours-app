import { expect, test, type APIRequestContext } from '@playwright/test';
import { USERS, expectError, futureRange, login, type Session } from '../support/api';

const BASE = '/api/vacation-requests';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function create(
  request: APIRequestContext,
  session: Session,
  data: Record<string, unknown> = futureRange(),
) {
  const res = await request.post(BASE, { headers: session.headers, data });
  expect(res.status(), 'create vacation request').toBe(201);
  return res.json();
}

test.describe('creating requests', () => {
  test('trims the reason and returns the owner', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const created = await create(request, alice, { ...futureRange(), reason: '  family trip  ' });
    expect(created).toMatchObject({ reason: 'family trip', status: 'Pending', comments: null });
    expect(created.userId).toBeTruthy();
  });

  test('a blank reason is stored as null', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const created = await create(request, alice, { ...futureRange(), reason: '   ' });
    expect(created.reason).toBeNull();
  });

  test('validators cannot submit requests', async ({ request }) => {
    const carol = await login(request, USERS.carol);
    await expectError(
      await request.post(BASE, { headers: carol.headers, data: futureRange() }),
      403,
    );
  });

  test('requires authentication', async ({ request }) => {
    await expectError(await request.post(BASE, { data: futureRange() }), 401);
  });

  for (const [name, data] of Object.entries({
    'missing dates': {},
    'malformed date': { startDate: '01/02/2099', endDate: '2099-02-05' },
    'impossible date': { startDate: '2099-02-30', endDate: '2099-03-05' },
    'non-string reason': { ...futureRange(), reason: 42 },
    'over-long reason': { ...futureRange(), reason: 'x'.repeat(1001) },
    'unknown property': { ...futureRange(), status: 'Approved' },
  })) {
    test(`rejects ${name} with 400`, async ({ request }) => {
      const alice = await login(request, USERS.alice);
      await expectError(await request.post(BASE, { headers: alice.headers, data }), 400);
    });
  }

  test('a rejected request frees its dates for a new one', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const range = futureRange(4);
    const first = await create(request, alice, range);
    await request.post(`${BASE}/${first.id}/reject`, {
      headers: carol.headers,
      data: { comment: 'not now' },
    });
    const again = await request.post(BASE, { headers: alice.headers, data: range });
    expect(again.status()).toBe(201);
  });

  test('a partially overlapping range conflicts with a pending one', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const { startDate, endDate } = futureRange(5);
    await create(request, alice, { startDate, endDate });
    const res = await request.post(BASE, {
      headers: alice.headers,
      data: {
        startDate: endDate,
        endDate: new Date(Date.parse(endDate) + 3 * 864e5).toISOString().slice(0, 10),
      },
    });
    await expectError(res, 409, /overlap/i);
  });
});

test.describe('reading requests', () => {
  test('owner and validator can read a request; another requester gets 404', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const bob = await login(request, USERS.bob);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);

    expect((await request.get(`${BASE}/${id}`, { headers: alice.headers })).status()).toBe(200);
    expect((await request.get(`${BASE}/${id}`, { headers: carol.headers })).status()).toBe(200);
    await expectError(await request.get(`${BASE}/${id}`, { headers: bob.headers }), 404);
  });

  test('unknown ids are 404 and malformed ids are 400', async ({ request }) => {
    const carol = await login(request, USERS.carol);
    await expectError(await request.get(`${BASE}/${UNKNOWN_ID}`, { headers: carol.headers }), 404);
    await expectError(await request.get(`${BASE}/not-a-uuid`, { headers: carol.headers }), 400);
  });

  test('"me" lists only my requests, newest first, with pagination meta', async ({ request }) => {
    const bob = await login(request, USERS.bob);
    const a = await create(request, bob);
    const b = await create(request, bob);

    const res = await request.get(`${BASE}/me?limit=2`, { headers: bob.headers });
    expect(res.ok()).toBeTruthy();
    const page = await res.json();
    expect(page.meta).toMatchObject({ page: 1, limit: 2 });
    expect(page.meta.totalPages).toBe(Math.ceil(page.meta.total / 2));
    expect(page.items.map((r: { id: string }) => r.id)).toEqual([b.id, a.id]);
    expect(page.items.every((r: { userId: string }) => r.userId === a.userId)).toBe(true);
  });

  test('"me" filters by status', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    await request.post(`${BASE}/${id}/approve`, { headers: carol.headers });

    const approved = await (
      await request.get(`${BASE}/me?status=Approved&limit=100`, { headers: alice.headers })
    ).json();
    expect(approved.items.length).toBeGreaterThan(0);
    expect(approved.items.every((r: { status: string }) => r.status === 'Approved')).toBe(true);
    expect(approved.items.map((r: { id: string }) => r.id)).toContain(id);
  });

  test('pages do not overlap', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    await create(request, alice);
    await create(request, alice);
    const first = await (
      await request.get(`${BASE}/me?page=1&limit=1`, { headers: alice.headers })
    ).json();
    const second = await (
      await request.get(`${BASE}/me?page=2&limit=1`, { headers: alice.headers })
    ).json();
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0].id).not.toBe(second.items[0].id);
  });

  for (const query of ['page=0', 'page=abc', 'limit=0', 'limit=101', 'status=Done', 'foo=bar']) {
    test(`rejects invalid query "${query}"`, async ({ request }) => {
      const alice = await login(request, USERS.alice);
      await expectError(await request.get(`${BASE}/me?${query}`, { headers: alice.headers }), 400);
    });
  }

  test('past the last page returns no items but keeps the totals', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const res = await request.get(`${BASE}/me?page=99999&limit=100`, { headers: alice.headers });
    const page = await res.json();
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBeGreaterThanOrEqual(0);
  });

  test('validator list filters by status and attaches the user', async ({ request }) => {
    const bob = await login(request, USERS.bob);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, bob);

    const res = await request.get(`${BASE}?status=Pending&limit=100`, { headers: carol.headers });
    expect(res.status()).toBe(200);
    const page = await res.json();
    expect(page.items.length).toBeGreaterThan(0);
    for (const item of page.items) {
      expect(item.status).toBe('Pending');
      expect(item.user).not.toHaveProperty('password');
    }
    const mine = page.items.find((r: { id: string }) => r.id === id);
    if (mine) expect(mine.user.email).toBe(USERS.bob);
    await expectError(await request.get(`${BASE}?userId=nope`, { headers: carol.headers }), 400);
  });

  test('validator list filters by a seeded user id', async ({ request }) => {
    const bob = await login(request, USERS.bob);
    const carol = await login(request, USERS.carol);
    const { id, userId } = await create(request, bob);

    const res = await request.get(`${BASE}?userId=${userId}&limit=100`, { headers: carol.headers });
    expect(res.status()).toBe(200);
    const page = await res.json();
    expect(page.items.map((r: { id: string }) => r.id)).toContain(id);
    expect(page.items.every((r: { userId: string }) => r.userId === userId)).toBe(true);
  });

  test('requesters cannot list all requests', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    await expectError(await request.get(BASE, { headers: alice.headers }), 403);
  });
});

test.describe('modifying requests', () => {
  test('updates dates and reason of a pending request', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const range = futureRange(3);
    const { id } = await create(request, alice, range);
    const newEnd = new Date(Date.parse(range.endDate) + 2 * 864e5).toISOString().slice(0, 10);

    const res = await request.patch(`${BASE}/${id}`, {
      headers: alice.headers,
      data: { endDate: newEnd, reason: 'extended' },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({
      id,
      startDate: range.startDate,
      endDate: newEnd,
      reason: 'extended',
      status: 'Pending',
    });
  });

  test('an empty patch changes nothing', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const created = await create(request, alice, { ...futureRange(), reason: 'keep' });
    const res = await request.patch(`${BASE}/${created.id}`, { headers: alice.headers, data: {} });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ reason: 'keep', startDate: created.startDate });
  });

  test('a patch cannot make the period invalid or move it to the past', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const range = futureRange();
    const { id } = await create(request, alice, range);
    await expectError(
      await request.patch(`${BASE}/${id}`, {
        headers: alice.headers,
        data: { endDate: range.startDate },
      }),
      400,
      /after start date/i,
    );
    await expectError(
      await request.patch(`${BASE}/${id}`, {
        headers: alice.headers,
        data: { startDate: '2000-01-01', endDate: '2000-01-05' },
      }),
      400,
      /past/i,
    );
  });

  test('a patch cannot overlap another of my requests, but may keep its own dates', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const a = futureRange(3);
    const b = {
      startDate: new Date(Date.parse(a.startDate) + 20 * 864e5).toISOString().slice(0, 10),
      endDate: new Date(Date.parse(a.endDate) + 20 * 864e5).toISOString().slice(0, 10),
    };
    const first = await create(request, alice, a);
    const second = await create(request, alice, b);

    await expectError(
      await request.patch(`${BASE}/${second.id}`, { headers: alice.headers, data: a }),
      409,
      /overlap/i,
    );
    const same = await request.patch(`${BASE}/${first.id}`, { headers: alice.headers, data: a });
    expect(same.status()).toBe(200);
  });

  test("cannot touch someone else's request", async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const bob = await login(request, USERS.bob);
    const { id } = await create(request, alice);
    await expectError(
      await request.patch(`${BASE}/${id}`, { headers: bob.headers, data: { reason: 'hax' } }),
      404,
    );
    await expectError(await request.delete(`${BASE}/${id}`, { headers: bob.headers }), 404);
  });

  test('validators cannot edit or cancel', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    await expectError(
      await request.patch(`${BASE}/${id}`, { headers: carol.headers, data: { reason: 'x' } }),
      403,
    );
    await expectError(await request.delete(`${BASE}/${id}`, { headers: carol.headers }), 403);
  });

  test('rejects an unknown property and a malformed id', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const { id } = await create(request, alice);
    await expectError(
      await request.patch(`${BASE}/${id}`, {
        headers: alice.headers,
        data: { status: 'Approved' },
      }),
      400,
    );
    await expectError(
      await request.patch(`${BASE}/nope`, { headers: alice.headers, data: {} }),
      400,
    );
  });

  test('rejected requests are final', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    await request.post(`${BASE}/${id}/reject`, { headers: carol.headers, data: { comment: 'no' } });

    await expectError(
      await request.patch(`${BASE}/${id}`, { headers: alice.headers, data: { reason: 'x' } }),
      409,
      /rejected/i,
    );
    await expectError(await request.delete(`${BASE}/${id}`, { headers: alice.headers }), 409);
  });

  test('cancelling a pending request deletes it and frees the dates', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const range = futureRange();
    const { id } = await create(request, alice, range);

    const del = await request.delete(`${BASE}/${id}`, { headers: alice.headers });
    expect(del.status()).toBe(204);
    await expectError(await request.get(`${BASE}/${id}`, { headers: alice.headers }), 404);
    await expectError(await request.delete(`${BASE}/${id}`, { headers: alice.headers }), 404);
    await create(request, alice, range);
  });
});

test.describe('validator decisions', () => {
  test('approves with an optional trimmed comment', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    const res = await request.post(`${BASE}/${id}/approve`, {
      headers: carol.headers,
      data: { comment: '  enjoy  ' },
    });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'Approved', comments: 'enjoy' });
  });

  test('approves without a body', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    const res = await request.post(`${BASE}/${id}/approve`, { headers: carol.headers });
    expect(await res.json()).toMatchObject({ status: 'Approved', comments: null });
  });

  test('rejecting needs a non-blank comment of at most 1000 characters', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    for (const comment of ['', '   ', 'x'.repeat(1001)]) {
      await expectError(
        await request.post(`${BASE}/${id}/reject`, { headers: carol.headers, data: { comment } }),
        400,
      );
    }
    const still = await (await request.get(`${BASE}/${id}`, { headers: carol.headers })).json();
    expect(still.status).toBe('Pending');
  });

  test('a decided request cannot be decided again', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    await request.post(`${BASE}/${id}/approve`, { headers: carol.headers });

    await expectError(
      await request.post(`${BASE}/${id}/approve`, { headers: carol.headers }),
      409,
      /already approved/i,
    );
    await expectError(
      await request.post(`${BASE}/${id}/reject`, {
        headers: carol.headers,
        data: { comment: 'late' },
      }),
      409,
      /already approved/i,
    );
  });

  test('two simultaneous decisions: exactly one wins', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const { id } = await create(request, alice);
    const [a, b] = await Promise.all([
      request.post(`${BASE}/${id}/approve`, { headers: carol.headers }),
      request.post(`${BASE}/${id}/reject`, { headers: carol.headers, data: { comment: 'race' } }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 409]);
  });

  test('unknown or malformed ids', async ({ request }) => {
    const carol = await login(request, USERS.carol);
    await expectError(
      await request.post(`${BASE}/${UNKNOWN_ID}/approve`, { headers: carol.headers }),
      404,
    );
    await expectError(await request.post(`${BASE}/nope/approve`, { headers: carol.headers }), 400);
  });

  test('requesters cannot decide, even on their own request', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const { id } = await create(request, alice);
    await expectError(await request.post(`${BASE}/${id}/approve`, { headers: alice.headers }), 403);
    await expectError(
      await request.post(`${BASE}/${id}/reject`, {
        headers: alice.headers,
        data: { comment: 'x' },
      }),
      403,
    );
  });
});
