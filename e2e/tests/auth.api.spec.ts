import { expect, test } from '@playwright/test';
import { USERS, expectError, login } from '../support/api';

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
});
