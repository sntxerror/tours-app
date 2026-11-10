import type { TeamVacation } from '../types';
import { http } from './http';

/** Approved vacations overlapping `[from, to]` (`YYYY-MM-DD`, at most 366 days apart). */
export const listTeamVacations = (params: { from: string; to: string }) =>
  http.get<TeamVacation[]>('/team/vacations', { params }).then((r) => r.data);
