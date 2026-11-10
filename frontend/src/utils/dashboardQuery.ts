import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { DashboardFilters } from '../store/dashboard';
import { VACATION_STATUSES, type VacationStatus } from '../types';

/** `?status=` value meaning "no status filter"; a missing parameter means the default (Pending). */
const ALL_STATUSES = 'all';

const first = (value: LocationQuery[string]) => (Array.isArray(value) ? value[0] : value);

export function parseDashboardQuery(query: LocationQuery): {
  filters: DashboardFilters;
  pageNum: number;
} {
  const status = first(query.status);
  const userId = first(query.userId);
  const page = Number(first(query.page));

  return {
    filters: {
      status:
        status === ALL_STATUSES
          ? null
          : VACATION_STATUSES.includes(status as VacationStatus)
            ? (status as VacationStatus)
            : 'Pending',
      userId: userId || null,
    },
    pageNum: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function toDashboardQuery(filters: DashboardFilters, pageNum: number): LocationQueryRaw {
  return {
    status: filters.status === 'Pending' ? undefined : (filters.status ?? ALL_STATUSES),
    userId: filters.userId ?? undefined,
    page: pageNum > 1 ? String(pageNum) : undefined,
  };
}
