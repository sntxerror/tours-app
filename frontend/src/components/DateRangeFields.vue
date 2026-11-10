<script setup lang="ts">
import { computed, useId } from 'vue';
import { addDays, todayIso } from '../utils/dates';

const start = defineModel<string>('start', { required: true });
const end = defineModel<string>('end', { required: true });

defineProps<{ startError?: string; endError?: string }>();

const startId = useId();
const endId = useId();

// The backend rejects past dates and single-day periods, so the pickers do not offer them.
const minStart = computed(() => todayIso());
const minEnd = computed(() => (start.value ? addDays(start.value, 1) : addDays(minStart.value, 1)));
</script>

<template>
  <div :class="$style.fields">
    <div>
      <label :for="startId">Start date</label>
      <input
        :id="startId"
        v-model="start"
        type="date"
        required
        :min="minStart"
        :aria-invalid="Boolean(startError)"
        :aria-describedby="startError ? `${startId}-error` : undefined"
      />
      <p v-if="startError" :id="`${startId}-error`" :class="$style.error" role="alert">
        {{ startError }}
      </p>
    </div>
    <div>
      <label :for="endId">End date</label>
      <input
        :id="endId"
        v-model="end"
        type="date"
        required
        :min="minEnd"
        :aria-invalid="Boolean(endError)"
        :aria-describedby="endError ? `${endId}-error` : undefined"
      />
      <p v-if="endError" :id="`${endId}-error`" :class="$style.error" role="alert">
        {{ endError }}
      </p>
    </div>
  </div>
</template>

<style module>
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--space-4);
}
.error {
  margin: var(--space-1) 0 0;
  font-size: 0.875rem;
  color: var(--color-danger);
}
</style>
