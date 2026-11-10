import type { EventPublisherService } from '../events/event-publisher.service';
import { runWithRequestContext } from '../common/request-context/request-context';
import { AuthEvent, AuthEventsPublisher } from './auth-events.publisher';

function setup() {
  const publishBestEffort = jest.fn().mockResolvedValue(undefined);
  const events = new AuthEventsPublisher({ publishBestEffort } as unknown as EventPublisherService);
  return { events, publishBestEffort };
}

describe('AuthEventsPublisher', () => {
  it('loginSucceeded: user id, role and ip, acted by the user', async () => {
    const { events, publishBestEffort } = setup();
    await runWithRequestContext({ correlationId: 'c', ip: '10.0.0.7' }, () =>
      events.loginSucceeded({ id: 'u-1', role: 'Validator' as never }),
    );
    expect(publishBestEffort).toHaveBeenCalledWith(
      AuthEvent.LoginSucceeded,
      { userId: 'u-1', role: 'Validator', ip: '10.0.0.7' },
      { actor: { type: 'user', id: 'u-1', role: 'Validator' } },
    );
  });

  it('loginFailed: anonymous actor, normalised email, reason, never a password', async () => {
    const { events, publishBestEffort } = setup();
    await events.loginFailed('  Alice@Example.COM ', 'wrong-password');

    expect(publishBestEffort).toHaveBeenCalledWith(
      AuthEvent.LoginFailed,
      { email: 'alice@example.com', reason: 'wrong-password', ip: undefined },
      { actor: { type: 'anonymous' } },
    );
    expect(JSON.stringify(publishBestEffort.mock.calls[0])).not.toMatch(/password":/i);
  });
});
