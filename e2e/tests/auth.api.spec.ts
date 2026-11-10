import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, USERS, expectError, login } from '../support/api';

test.describe('authentication and roles', () => {
  test('logs in a seeded requester and returns the profile', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    const me = await request.get('/api/auth/me', { headers });
    expect(me.ok()).toBeTruthy();
    expect(await me.json()).toMatchObject({ email: USERS.alice, role: 'Requester' });
  });

  test('rejects a wrong password', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: USERS.alice, password: 'wrong-password' },
    });
    expect(res.status()).toBe(401);
  });

  test('protects routes: no token is 401', async ({ request }) => {
    expect((await request.get('/api/vacation-requests/me')).status()).toBe(401);
  });

  test('a requester cannot use validator endpoints', async ({ request }) => {
    const { headers } = await login(request, USERS.alice);
    await expectError(await request.get('/api/vacation-requests', { headers }), 403);
    await expectError(await request.get('/api/users', { headers }), 403);
  });

  test('a validator can list all requests', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    const res = await request.get('/api/vacation-requests', { headers });
    expect(res.ok()).toBeTruthy();
    expect(await res.json()).toHaveProperty('meta.total');
  });

  test('login ignores email case and never returns the password hash', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      data: { email: USERS.alice.toUpperCase(), password: DEMO_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.user).toMatchObject({ email: USERS.alice, role: 'Requester' });
    expect(JSON.stringify(body)).not.toMatch(/password/i);
  });

  test('unknown email and wrong password are indistinguishable', async ({ request }) => {
    const unknown = await request.post('/api/auth/login', {
      data: { email: 'ghost@example.com', password: DEMO_PASSWORD },
    });
    const wrong = await request.post('/api/auth/login', {
      data: { email: USERS.alice, password: 'nope' },
    });
    expect(unknown.status()).toBe(401);
    expect(wrong.status()).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  test('validates the login payload', async ({ request }) => {
    for (const data of [
      {},
      { email: 'not-an-email', password: 'x' },
      { email: USERS.alice },
      { email: USERS.alice, password: '' },
      { email: USERS.alice, password: 'x'.repeat(129) },
      { email: USERS.alice, password: 'x', admin: true },
    ]) {
      await expectError(await request.post('/api/auth/login', { data }), 400);
    }
  });

  test('rejects malformed, tampered and non-bearer credentials', async ({ request }) => {
    const { token } = await login(request, USERS.alice);
    const bad: Record<string, string> = {
      'garbage token': 'Bearer not.a.jwt',
      'tampered signature': `Bearer ${token.slice(0, -4)}AAAA`,
      'wrong scheme': `Basic ${token}`,
      'no token': 'Bearer',
    };
    for (const [name, Authorization] of Object.entries(bad)) {
      const res = await request.get('/api/auth/me', { headers: { Authorization } });
      expect(res.status(), name).toBe(401);
    }
  });

  test('the token identifies a validator correctly', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    expect(await (await request.get('/api/auth/me', { headers })).json()).toMatchObject({
      email: USERS.carol,
      role: 'Validator',
    });
  });

  test('a validator cannot use requester endpoints', async ({ request }) => {
    const { headers } = await login(request, USERS.carol);
    await expectError(await request.get('/api/vacation-requests/me', { headers }), 403);
  });
});
