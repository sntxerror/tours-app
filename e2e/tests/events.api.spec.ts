import { expect, test } from '@playwright/test';
import {
  USERS,
  futureRange,
  listEvents,
  login,
  newRequestId,
  ofRequest,
  waitForEvent,
} from '../support/api';

/**
 * Business actions record events in the outbox (same transaction as the change); a relay publishes
 * them to EventBridge, SQS delivers them to a consumer that routes them through the framework to its
 * subscribers. Every spec here follows an event across that whole chain to the dev event log.
 */
test.describe('lifecycle events', () => {
  test('submitting records vacation-request.submitted with actor and correlation id', async ({
    request,
  }) => {
    const alice = await login(request, USERS.alice);
    const requestId = newRequestId();
    const range = futureRange();

    const res = await request.post('/api/vacation-requests', {
      headers: { ...alice.headers, 'x-request-id': requestId },
      data: { ...range, reason: 'private reason' },
    });
    expect(res.status()).toBe(201);
    expect(res.headers()['x-request-id']).toBe(requestId);
    const created = await res.json();

    const entry = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(entry).toMatchObject({
      type: 'travel.vacation-request.submitted',
      correlationId: requestId,
      actor: { type: 'user', role: 'Requester', id: created.userId },
      data: { requestId: created.id, userId: created.userId, ...range, status: 'Pending' },
    });
    expect(JSON.stringify(entry)).not.toContain('private reason');
  });

  test('the bus carries the full versioned envelope', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const requestId = newRequestId();
    await request.post('/api/vacation-requests', {
      headers: { ...alice.headers, 'x-request-id': requestId },
      data: futureRange(),
    });

    const event = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(event).toMatchObject({
      type: 'travel.vacation-request.submitted',
      schemaVersion: 1,
      source: 'travel-app.api',
      actor: { type: 'user', role: 'Requester' },
    });
    expect(event.eventId).toBeTruthy();
    expect(new Date(event.occurredAt).getTime()).not.toBeNaN();
  });

  test('editing records updated with the changed dates', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const range = futureRange(3);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: range })
    ).json();

    const newEnd = new Date(Date.parse(range.endDate) + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await request.patch(`/api/vacation-requests/${created.id}`, {
      headers: alice.headers,
      data: { endDate: newEnd },
    });
    expect(res.ok()).toBeTruthy();

    const entry = await waitForEvent(
      request,
      ofRequest(created.id, 'travel.vacation-request.updated'),
    );
    expect(entry.data).toMatchObject({
      endDate: newEnd,
      changes: { endDate: { from: range.endDate, to: newEnd } },
      reasonChanged: false,
    });
    expect(entry.data.changes).not.toHaveProperty('startDate');
  });

  test('cancelling records cancelled', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();

    const res = await request.delete(`/api/vacation-requests/${created.id}`, {
      headers: alice.headers,
    });
    expect(res.status()).toBe(204);

    const entry = await waitForEvent(
      request,
      ofRequest(created.id, 'travel.vacation-request.cancelled'),
    );
    expect(entry.actor).toMatchObject({ type: 'user', role: 'Requester' });
  });

  test('approving records approved with who, when and the comment', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();

    const res = await request.post(`/api/vacation-requests/${created.id}/approve`, {
      headers: carol.headers,
      data: { comment: 'Enjoy!' },
    });
    expect(res.ok()).toBeTruthy();

    const entry = await waitForEvent(
      request,
      ofRequest(created.id, 'travel.vacation-request.approved'),
    );
    expect(entry.actor).toMatchObject({ type: 'user', role: 'Validator' });
    expect(entry.actor.id).not.toBe(created.userId);
    expect(entry.data).toMatchObject({ status: 'Approved', comment: 'Enjoy!' });
    expect(new Date(entry.data.decidedAt as string).getTime()).not.toBeNaN();
  });

  test('rejecting records rejected with the rejection comment', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();

    await request.post(`/api/vacation-requests/${created.id}/reject`, {
      headers: carol.headers,
      data: { comment: 'Understaffed' },
    });

    const entry = await waitForEvent(
      request,
      ofRequest(created.id, 'travel.vacation-request.rejected'),
    );
    expect(entry.data).toMatchObject({ status: 'Rejected', comment: 'Understaffed' });
    expect(entry.actor).toMatchObject({ type: 'user', role: 'Validator' });
  });

  test('the whole life of one request shows up as an ordered trail', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();
    await request.post(`/api/vacation-requests/${created.id}/approve`, { headers: carol.headers });

    await waitForEvent(request, ofRequest(created.id, 'travel.vacation-request.approved'));
    const trail = await listEvents(request, ofRequest(created.id));
    // A standard queue does not guarantee delivery order, so order by when the events happened.
    trail.sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));

    expect(trail.map((e) => e.type)).toEqual([
      'travel.vacation-request.submitted',
      'travel.vacation-request.approved',
    ]);
  });

  test('a refused action records nothing', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const requestId = newRequestId();
    const { startDate } = futureRange();

    const refused = await request.post('/api/vacation-requests', {
      headers: { ...alice.headers, 'x-request-id': requestId },
      data: { startDate, endDate: startDate }, // single day: rejected by the business rules
    });
    expect(refused.status()).toBe(400);

    // A valid action under the SAME correlation id acts as the marker: once its event is in the
    // event log, anything the refused request had wrongly recorded would be there too.
    const accepted = await request.post('/api/vacation-requests', {
      headers: { ...alice.headers, 'x-request-id': requestId },
      data: futureRange(),
    });
    expect(accepted.status()).toBe(201);
    await waitForEvent(request, (e) => e.correlationId === requestId);

    const entries = await listEvents(request, (e) => e.correlationId === requestId);
    expect(entries.map((e) => e.type)).toEqual(['travel.vacation-request.submitted']);
  });
});

test.describe('login events', () => {
  test('a successful login records auth.login-succeeded', async ({ request }) => {
    const requestId = newRequestId();
    const res = await request.post('/api/auth/login', {
      headers: { 'x-request-id': requestId },
      data: { email: USERS.alice, password: 'Password123!' },
    });
    const { user } = await res.json();

    const entry = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(entry).toMatchObject({
      type: 'travel.auth.login-succeeded',
      actor: { type: 'user', id: user.id, role: 'Requester' },
      data: { userId: user.id, role: 'Requester' },
    });
  });

  test('a failed login records auth.login-failed without the password', async ({ request }) => {
    const requestId = newRequestId();
    const res = await request.post('/api/auth/login', {
      headers: { 'x-request-id': requestId },
      data: { email: 'Alice@Example.com', password: 'definitely-wrong-password' },
    });
    expect(res.status()).toBe(401);

    const entry = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(entry).toMatchObject({
      type: 'travel.auth.login-failed',
      actor: { type: 'anonymous' },
      data: { email: 'alice@example.com', reason: 'wrong-password' },
    });
    expect(JSON.stringify(entry)).not.toContain('definitely-wrong-password');
  });

  test('an unknown email is reported as such, but the caller sees the same 401', async ({
    request,
  }) => {
    const requestId = newRequestId();
    const res = await request.post('/api/auth/login', {
      headers: { 'x-request-id': requestId },
      data: { email: 'nobody@example.com', password: 'Password123!' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).message).toBe('Invalid email or password');

    const entry = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(entry.data).toMatchObject({ reason: 'unknown-email' });
  });
});
