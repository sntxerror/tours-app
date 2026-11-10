/** API shapes shared by the store, views and components (mirrors the backend responses). */

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
  /** `YYYY-MM-DD` */
  startDate: string;
  /** `YYYY-MM-DD`, strictly after `startDate`, inclusive. */
  endDate: string;
  reason: string | null;
  status: VacationStatus;
  /** Validator comment; always set on rejected requests. */
  comments: string | null;
  /** Set when the request was still pending after its start date. */
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

/** Approved vacation as exposed to the whole team (no reason or comments). */
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
