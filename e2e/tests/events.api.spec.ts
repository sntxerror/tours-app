import { expect, test } from '@playwright/test';
import { USERS, futureRange, login, newRequestId, waitForEvent } from '../support/api';

/**
 * Business actions publish lifecycle events (EventBridge -> SQS). The dev-only /api/test/events
 * endpoint exposes what the worker consumed, which is what a real consumer would see.
 */
test.describe('lifecycle events', () => {
  test('submitting publishes vacation-request.submitted with the full envelope', async ({
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

    const event = await waitForEvent(request, (e) => e.data.requestId === created.id);
    expect(event).toMatchObject({
      type: 'travel.vacation-request.submitted',
      schemaVersion: 1,
      correlationId: requestId,
      actor: { type: 'user', role: 'Requester', id: created.userId },
      data: { userId: created.userId, ...range, status: 'Pending' },
    });
    expect(event.eventId).toBeTruthy();
    expect(new Date(event.occurredAt).getTime()).not.toBeNaN();
    expect(JSON.stringify(event)).not.toContain('private reason');
  });

  test('editing publishes updated with the changed dates', async ({ request }) => {
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

    const event = await waitForEvent(
      request,
      (e) => e.type === 'travel.vacation-request.updated' && e.data.requestId === created.id,
    );
    expect(event.data).toMatchObject({
      endDate: newEnd,
      changes: { endDate: { from: range.endDate, to: newEnd } },
      reasonChanged: false,
    });
    expect(event.data.changes).not.toHaveProperty('startDate');
  });

  test('cancelling publishes cancelled', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();

    const res = await request.delete(`/api/vacation-requests/${created.id}`, {
      headers: alice.headers,
    });
    expect(res.status()).toBe(204);

    const event = await waitForEvent(
      request,
      (e) => e.type === 'travel.vacation-request.cancelled' && e.data.requestId === created.id,
    );
    expect(event.actor).toMatchObject({ type: 'user', role: 'Requester' });
  });

  test('approving publishes approved with who, when and the comment', async ({ request }) => {
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

    const event = await waitForEvent(
      request,
      (e) => e.type === 'travel.vacation-request.approved' && e.data.requestId === created.id,
    );
    expect(event.actor).toMatchObject({ type: 'user', role: 'Validator' });
    expect(event.actor.id).not.toBe(created.userId);
    expect(event.data).toMatchObject({ status: 'Approved', comment: 'Enjoy!' });
    expect(new Date(event.data.decidedAt as string).getTime()).not.toBeNaN();
  });

  test('rejecting publishes rejected with the rejection comment', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const carol = await login(request, USERS.carol);
    const created = await (
      await request.post('/api/vacation-requests', { headers: alice.headers, data: futureRange() })
    ).json();

    await request.post(`/api/vacation-requests/${created.id}/reject`, {
      headers: carol.headers,
      data: { comment: 'Understaffed' },
    });

    const event = await waitForEvent(
      request,
      (e) => e.type === 'travel.vacation-request.rejected' && e.data.requestId === created.id,
    );
    expect(event.data).toMatchObject({ status: 'Rejected', comment: 'Understaffed' });
    expect(event.actor).toMatchObject({ type: 'user', role: 'Validator' });
  });

  test('a refused action publishes nothing', async ({ request }) => {
    const alice = await login(request, USERS.alice);
    const requestId = newRequestId();
    const { startDate } = futureRange();

    const res = await request.post('/api/vacation-requests', {
      headers: { ...alice.headers, 'x-request-id': requestId },
      data: { startDate, endDate: startDate }, // single day: rejected by the business rules
    });
    expect(res.status()).toBe(400);

    // Give the pipeline time to deliver anything that was wrongly published.
    await new Promise((r) => setTimeout(r, 2_000));
    const received: { envelope: { detail: { correlationId: string } } }[] = await (
      await request.get('/api/test/events')
    ).json();
    expect(received.filter((r) => r.envelope.detail.correlationId === requestId)).toEqual([]);
  });
});

test.describe('login events', () => {
  test('a successful login publishes auth.login-succeeded', async ({ request }) => {
    const requestId = newRequestId();
    const res = await request.post('/api/auth/login', {
      headers: { 'x-request-id': requestId },
      data: { email: USERS.alice, password: 'Password123!' },
    });
    const { user } = await res.json();

    const event = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(event).toMatchObject({
      type: 'travel.auth.login-succeeded',
      actor: { type: 'user', id: user.id, role: 'Requester' },
      data: { userId: user.id, role: 'Requester' },
    });
  });

  test('a failed login publishes auth.login-failed without the password', async ({ request }) => {
    const requestId = newRequestId();
    const res = await request.post('/api/auth/login', {
      headers: { 'x-request-id': requestId },
      data: { email: 'Alice@Example.com', password: 'definitely-wrong-password' },
    });
    expect(res.status()).toBe(401);

    const event = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(event).toMatchObject({
      type: 'travel.auth.login-failed',
      actor: { type: 'anonymous' },
      data: { email: 'alice@example.com', reason: 'wrong-password' },
    });
    expect(JSON.stringify(event)).not.toContain('definitely-wrong-password');
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

    const event = await waitForEvent(request, (e) => e.correlationId === requestId);
    expect(event.data).toMatchObject({ reason: 'unknown-email' });
  });
});
