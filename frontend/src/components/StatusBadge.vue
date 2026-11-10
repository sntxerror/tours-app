<script setup lang="ts">
import { computed } from 'vue';
import type { VacationStatus } from '../types';

const props = defineProps<{
  status: VacationStatus;
  /** `expiredAt` of the request: a pending request whose start date has passed. */
  expiredAt?: string | null;
}>();

const expired = computed(() => props.status === 'Pending' && Boolean(props.expiredAt));
</script>

<template>
  <span :class="[$style.badge, $style[status.toLowerCase()]]">{{ status }}</span>
  <span v-if="expired" :class="$style.expired" title="The start date has passed without a decision">
    Expired
  </span>
</template>

<style module>
.badge {
  display: inline-block;
  padding: 0 var(--space-2);
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
}
.pending {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}
.approved {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.rejected {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.expired {
  margin-left: var(--space-1);
  font-size: 0.75rem;
  color: var(--color-muted);
}
</style>
