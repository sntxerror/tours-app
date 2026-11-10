import type { Request } from 'express';
import type { UserRole } from '../users/user-role.enum';

/** What we put in the JWT and expose to handlers as `request.user`. */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
