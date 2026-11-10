<script setup lang="ts">
import { useId } from 'vue';
import { VACATION_STATUSES, type VacationStatus } from '../types';

const model = defineModel<VacationStatus | null>({ required: true });
const id = useId();

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  model.value = value === '' ? null : (value as VacationStatus);
}
</script>

<template>
  <div>
    <label :for="id">Status</label>
    <select :id="id" :value="model ?? ''" @change="onChange">
      <option value="">All</option>
      <option v-for="status in VACATION_STATUSES" :key="status" :value="status">
        {{ status }}
      </option>
    </select>
  </div>
</template>
