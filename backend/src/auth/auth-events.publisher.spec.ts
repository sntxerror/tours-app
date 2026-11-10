import { Logger } from '@nestjs/common';
import { runWithRequestContext } from '../common/request-context/request-context';
import type { OutboxService } from '../events/outbox/outbox.service';
import { AuthEvent } from '../events/event-types';
import { AuthEventsPublisher } from './auth-events.publisher';

function setup() {
  const record = jest.fn().mockResolvedValue(undefined);
  const events = new AuthEventsPublisher({ record } as unknown as OutboxService);
  return { events, record };
}

describe('AuthEventsPublisher (records into the outbox)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loginSucceeded: user id, role and ip, acted by the user', async () => {
    const { events, record } = setup();
    await runWithRequestContext({ correlationId: 'c', ip: '10.0.0.7' }, () =>
      events.loginSucceeded({ id: 'u-1', role: 'Validator' as never }),
    );
    expect(record).toHaveBeenCalledWith(
      AuthEvent.LoginSucceeded,
      { userId: 'u-1', role: 'Validator', ip: '10.0.0.7' },
      { type: 'user', id: 'u-1', role: 'Validator' },
    );
  });

  it('loginFailed: anonymous actor, normalised email, reason, never a password', async () => {
    const { events, record } = setup();
    await events.loginFailed('  Alice@Example.COM ', 'wrong-password');

    expect(record).toHaveBeenCalledWith(
      AuthEvent.LoginFailed,
      { email: 'alice@example.com', reason: 'wrong-password', ip: undefined },
      { type: 'anonymous' },
    );
    expect(JSON.stringify(record.mock.calls[0])).not.toMatch(/password":/i);
  });

  it.each([
    [
      'loginSucceeded',
      (e: AuthEventsPublisher) => e.loginSucceeded({ id: 'u', role: 'Requester' as never }),
    ],
    ['loginFailed', (e: AuthEventsPublisher) => e.loginFailed('a@b.c', 'unknown-email')],
  ])('%s never fails the login when the event cannot be recorded', async (_name, act) => {
    const { events, record } = setup();
    record.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(act(events)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });
});
