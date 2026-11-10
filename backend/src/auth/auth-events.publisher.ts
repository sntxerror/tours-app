import { Injectable } from '@nestjs/common';
import { getRequestContext } from '../common/request-context/request-context';
import { ANONYMOUS_ACTOR, userActor } from '../events/event-envelope';
import { EventPublisherService } from '../events/event-publisher.service';
import type { User } from '../users/user.entity';

export const AuthEvent = {
  LoginSucceeded: 'travel.auth.login-succeeded',
  LoginFailed: 'travel.auth.login-failed',
} as const;

export type LoginFailureReason = 'unknown-email' | 'wrong-password';

/**
 * Security/audit stream. Best-effort like the other publishers. Passwords are never included; the
 * attempted email is (lower-cased) so repeated failures against one account can be spotted, and the
 * reason is for operators only: the HTTP response stays the same for both failure cases.
 */
@Injectable()
export class AuthEventsPublisher {
  constructor(private readonly publisher: EventPublisherService) {}

  loginSucceeded(user: Pick<User, 'id' | 'role'>): Promise<void> {
    return this.publisher.publishBestEffort(
      AuthEvent.LoginSucceeded,
      { userId: user.id, role: user.role, ip: getRequestContext()?.ip },
      { actor: userActor(user) },
    );
  }

  loginFailed(email: string, reason: LoginFailureReason): Promise<void> {
    return this.publisher.publishBestEffort(
      AuthEvent.LoginFailed,
      { email: email.trim().toLowerCase(), reason, ip: getRequestContext()?.ip },
      { actor: ANONYMOUS_ACTOR },
    );
  }
}
