export type Role = 'Requester' | 'Validator';

export type VacationStatus = 'Pending' | 'Approved' | 'Rejected';

export const VACATION_STATUSES: readonly VacationStatus[] = ['Pending', 'Approved', 'Rejected'];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface VacationRequest {
  id: string;
  userId: string;
  user: User;
  startDate: string;
  endDate: string;
  reason: string | null;
  status: VacationStatus;
  comments: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface TeamVacation {
  id: string;
  startDate: string;
  endDate: string;
  user: { id: string; name: string };
}

export interface VacationRequestInput {
  startDate: string;
  endDate: string;
  reason?: string;
}
