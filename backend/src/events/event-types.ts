import type { UserRole } from '../users/user-role.enum';
import type { VacationStatus } from '../vacation-requests/vacation-status.enum';

export const VacationEvent = {
  Submitted: 'travel.vacation-request.submitted',
  Updated: 'travel.vacation-request.updated',
  Cancelled: 'travel.vacation-request.cancelled',
  Approved: 'travel.vacation-request.approved',
  Rejected: 'travel.vacation-request.rejected',
  Expired: 'travel.vacation-request.expired',
} as const;

export const AuthEvent = {
  LoginSucceeded: 'travel.auth.login-succeeded',
  LoginFailed: 'travel.auth.login-failed',
} as const;

export const DevEvent = {
  Ping: 'travel.test.ping',
} as const;

export interface VacationSnapshot {
  requestId: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: VacationStatus;
}

export interface DateChange {
  from: string;
  to: string;
}

export type LoginFailureReason = 'unknown-email' | 'wrong-password';

export interface EventPayloads {
  [VacationEvent.Submitted]: VacationSnapshot;
  [VacationEvent.Updated]: VacationSnapshot & {
    changes: { startDate?: DateChange; endDate?: DateChange };
    reasonChanged: boolean;
  };
  [VacationEvent.Cancelled]: VacationSnapshot;
  [VacationEvent.Approved]: VacationSnapshot & { decidedAt: string; comment: string | null };
  [VacationEvent.Rejected]: VacationSnapshot & { decidedAt: string; comment: string | null };
  [VacationEvent.Expired]: VacationSnapshot & { expiredAt: string };
  [AuthEvent.LoginSucceeded]: { userId: string; role: UserRole; ip?: string };
  [AuthEvent.LoginFailed]: { email: string; reason: LoginFailureReason; ip?: string };
  [DevEvent.Ping]: { message: string };
}

export type EventType = keyof EventPayloads;

/**
 * Route prefix `commoneventframework` matches on: an event of type `T` is routed as `PUT /events/T`.
 * (The framework reads the route from a `path` field in the SQS message body.)
 */
export const EVENT_ROUTE_PREFIX = '/events/';

type BusinessEventType =
  (typeof VacationEvent)[keyof typeof VacationEvent] | (typeof AuthEvent)[keyof typeof AuthEvent];

export const ALL_EVENT_TYPES: readonly BusinessEventType[] = [
  ...Object.values(VacationEvent),
  ...Object.values(AuthEvent),
];

// Compile-time guard: a payload added to EventPayloads must also be listed above (or be the dev ping).
const exhaustive: Exclude<EventType, BusinessEventType | typeof DevEvent.Ping> extends never
  ? true
  : never = true;
void exhaustive;
