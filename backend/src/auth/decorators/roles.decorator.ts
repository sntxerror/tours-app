import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../users/user-role.enum';

export const ROLES_KEY = 'roles';

/** Restricts a route (or controller) to the given roles. Without it any authenticated user may call it. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
