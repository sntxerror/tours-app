import type { Page, VacationRequest, VacationRequestInput, VacationStatus } from '../types';
import { http } from './http';

export interface ListMineParams {
  status?: VacationStatus;
  page?: number;
  limit?: number;
}

export interface ListAllParams extends ListMineParams {
  userId?: string;
}

// ---- Requester

export const listMine = (params: ListMineParams = {}) =>
  http.get<Page<VacationRequest>>('/vacation-requests/me', { params }).then((r) => r.data);

export const create = (input: VacationRequestInput) =>
  http.post<VacationRequest>('/vacation-requests', input).then((r) => r.data);

export const update = (id: string, changes: Partial<VacationRequestInput>) =>
  http.patch<VacationRequest>(`/vacation-requests/${id}`, changes).then((r) => r.data);

export const cancel = (id: string) => http.delete<void>(`/vacation-requests/${id}`).then(() => {});

// ---- Validator

export const listAll = (params: ListAllParams = {}) =>
  http.get<Page<VacationRequest>>('/vacation-requests', { params }).then((r) => r.data);

export const approve = (id: string, comment?: string) =>
  http.post<VacationRequest>(`/vacation-requests/${id}/approve`, { comment }).then((r) => r.data);

export const reject = (id: string, comment: string) =>
  http.post<VacationRequest>(`/vacation-requests/${id}/reject`, { comment }).then((r) => r.data);
