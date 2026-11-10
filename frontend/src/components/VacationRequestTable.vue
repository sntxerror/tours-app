<script setup lang="ts">
import type { VacationRequest } from '../types';
import { daysInclusive, formatRange, formatTimestamp } from '../utils/dates';
import StatusBadge from './StatusBadge.vue';

defineProps<{
  items: VacationRequest[];
  showUser?: boolean;
}>();

const dayLabel = (request: VacationRequest) => {
  const days = daysInclusive(request.startDate, request.endDate);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};
</script>

<template>
  <div :class="$style.wrapper">
    <table :class="$style.table">
      <thead>
        <tr>
          <th v-if="showUser" scope="col">Requester</th>
          <th scope="col">Dates</th>
          <th scope="col">Reason</th>
          <th scope="col">Status</th>
          <th scope="col">Comment</th>
          <th scope="col">Submitted</th>
          <th v-if="$slots.actions" scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="request in items" :key="request.id">
          <td v-if="showUser" data-label="Requester">{{ request.user.name }}</td>
          <td data-label="Dates">
            {{ formatRange(request.startDate, request.endDate) }}
            <span :class="$style.days">{{ dayLabel(request) }}</span>
          </td>
          <td data-label="Reason">{{ request.reason ?? '–' }}</td>
          <td data-label="Status">
            <StatusBadge :status="request.status" :expired-at="request.expiredAt" />
          </td>
          <td data-label="Comment">{{ request.comments ?? '–' }}</td>
          <td data-label="Submitted">{{ formatTimestamp(request.createdAt) }}</td>
          <td v-if="$slots.actions">
            <div :class="$style.actions"><slot name="actions" :request="request" /></div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style module>
.wrapper {
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9375rem;
}
.table th,
.table td {
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}
.table tbody tr:last-child td {
  border-bottom: 0;
}
.table th {
  font-size: 0.8125rem;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.days {
  display: block;
  font-size: 0.8125rem;
  color: var(--color-muted);
}
.actions {
  display: flex;
  gap: var(--space-2);
}

@media (max-width: 640px) {
  .table thead {
    display: none;
  }
  .table,
  .table tbody,
  .table tr,
  .table td {
    display: block;
  }
  .table tr {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .table tbody tr:last-child {
    border-bottom: 0;
  }
  .table td {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-1) var(--space-3);
    border: 0;
    text-align: right;
  }
  .table td[data-label]::before {
    content: attr(data-label);
    flex: none;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-muted);
    text-align: left;
  }
  .actions {
    justify-content: flex-end;
    width: 100%;
  }
}
</style>
