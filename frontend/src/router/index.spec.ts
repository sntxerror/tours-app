import { describe, expect, it } from 'vitest';
import { router } from './index';

describe('router', () => {
  it('sends an anonymous visitor on an unknown path to the login page', async () => {
    await router.push('/does-not-exist');
    expect(router.currentRoute.value.name).toBe('login');
  });
});
