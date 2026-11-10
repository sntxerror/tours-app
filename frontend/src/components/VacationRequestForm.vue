<script setup lang="ts">
import { computed, reactive, ref, useId } from 'vue';
import type { VacationRequestInput } from '../types';
import { validatePeriod } from '../utils/vacationRules';
import AppButton from './AppButton.vue';
import DateRangeFields from './DateRangeFields.vue';
import ErrorMessage from './ErrorMessage.vue';

const REASON_MAX_LENGTH = 1000;

const props = defineProps<{
  initial?: { startDate: string; endDate: string; reason: string | null };
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ submit: [input: VacationRequestInput] }>();

const reasonId = useId();
const form = reactive({
  start: props.initial?.startDate ?? '',
  end: props.initial?.endDate ?? '',
  reason: props.initial?.reason ?? '',
});
const submitted = ref(false);

// A started pending request may keep its dates (the API only checks the past when they change).
const periodChanged = computed(
  () => form.start !== props.initial?.startDate || form.end !== props.initial?.endDate,
);
const errors = computed(() =>
  validatePeriod(form.start, form.end, { checkPast: !props.initial || periodChanged.value }),
);

function onSubmit() {
  submitted.value = true;
  if (errors.value.start || errors.value.end) return;
  const reason = form.reason.trim();
  emit('submit', {
    startDate: form.start,
    endDate: form.end,
    ...(reason || props.initial ? { reason } : {}),
  });
}

function reset() {
  form.start = '';
  form.end = '';
  form.reason = '';
  submitted.value = false;
}

defineExpose({ reset });
</script>

<template>
  <form :class="$style.form" novalidate @submit.prevent="onSubmit">
    <DateRangeFields
      v-model:start="form.start"
      v-model:end="form.end"
      :start-error="submitted ? errors.start : undefined"
      :end-error="submitted ? errors.end : undefined"
    />
    <div>
      <label :for="reasonId">Reason <span :class="$style.optional">(optional)</span></label>
      <textarea :id="reasonId" v-model="form.reason" rows="3" :maxlength="REASON_MAX_LENGTH" />
      <p :class="$style.counter">{{ form.reason.length }} / {{ REASON_MAX_LENGTH }}</p>
    </div>
    <ErrorMessage :message="error" />
    <div :class="$style.actions">
      <AppButton type="submit" variant="primary" :disabled="busy">{{ submitLabel }}</AppButton>
    </div>
  </form>
</template>

<style module>
.form {
  display: grid;
  gap: var(--space-4);
}
.optional {
  font-weight: 400;
  color: var(--color-muted);
}
.counter {
  margin: var(--space-1) 0 0;
  font-size: 0.8125rem;
  text-align: right;
  color: var(--color-muted);
}
.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
