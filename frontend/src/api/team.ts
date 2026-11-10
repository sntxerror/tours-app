import type { TeamVacation } from '../types';
import { http } from './http';

export const listTeamVacations = (params: { from: string; to: string }) =>
  http.get<TeamVacation[]>('/team/vacations', { params }).then((r) => r.data);
