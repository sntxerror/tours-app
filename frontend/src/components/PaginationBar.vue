<script setup lang="ts">
import type { PageMeta } from '../types';
import AppButton from './AppButton.vue';

defineProps<{ meta: PageMeta }>();
const emit = defineEmits<{ change: [page: number] }>();
</script>

<template>
  <nav v-if="meta.totalPages > 1" :class="$style.bar" aria-label="Pagination">
    <AppButton small :disabled="meta.page <= 1" @click="emit('change', meta.page - 1)">
      Previous
    </AppButton>
    <span :class="$style.info" aria-live="polite">
      Page {{ meta.page }} of {{ meta.totalPages }} ({{ meta.total }} in total)
    </span>
    <AppButton
      small
      :disabled="meta.page >= meta.totalPages"
      @click="emit('change', meta.page + 1)"
    >
      Next
    </AppButton>
  </nav>
</template>

<style module>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.info {
  font-size: 0.875rem;
  color: var(--color-muted);
}
</style>
