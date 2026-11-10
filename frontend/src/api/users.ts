import type { Role, User } from '../types';
import { http } from './http';

/** Validator only; sorted by name. */
export const listUsers = (role?: Role) =>
  http.get<User[]>('/users', { params: { role } }).then((r) => r.data);
