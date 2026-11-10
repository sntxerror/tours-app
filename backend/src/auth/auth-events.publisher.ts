import { Injectable, Logger } from '@nestjs/common';
import { getRequestContext } from '../common/request-context/request-context';
import { ANONYMOUS_ACTOR, userActor } from '../events/event-envelope';
import { AuthEvent, type LoginFailureReason } from '../events/event-types';
import { OutboxService } from '../events/outbox/outbox.service';
import type { User } from '../users/user.entity';

export { AuthEvent } from '../events/event-types';
export type { LoginFailureReason } from '../events/event-types';

/**
 * Security/audit stream, recorded in the outbox. A login is not a change to stored business data, so
 * if recording itself fails this is logged and the login response is left alone. Passwords are never
 * included; the attempted email is (lower-cased) so repeated failures against one account can be
 * spotted, and the reason is for operators only: the HTTP response is the same for both failures.
 */
@Injectable()
export class AuthEventsPublisher {
  private readonly logger = new Logger(AuthEventsPublisher.name);

  constructor(private readonly outbox: OutboxService) {}

  async loginSucceeded(user: Pick<User, 'id' | 'role'>): Promise<void> {
    await this.safely(AuthEvent.LoginSucceeded, () =>
      this.outbox.record(
        AuthEvent.LoginSucceeded,
        { userId: user.id, role: user.role, ip: getRequestContext()?.ip },
        userActor(user),
      ),
    );
  }

  async loginFailed(email: string, reason: LoginFailureReason): Promise<void> {
    await this.safely(AuthEvent.LoginFailed, () =>
      this.outbox.record(
        AuthEvent.LoginFailed,
        { email: email.trim().toLowerCase(), reason, ip: getRequestContext()?.ip },
        ANONYMOUS_ACTOR,
      ),
    );
  }

  private async safely(type: string, record: () => Promise<void>): Promise<void> {
    try {
      await record();
    } catch (err) {
      this.logger.warn(`Could not record ${type}: ${(err as Error).message}`);
    }
  }
}
