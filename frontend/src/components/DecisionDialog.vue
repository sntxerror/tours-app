<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { VacationRequest } from '../types';
import { formatRange } from '../utils/dates';
import AppButton from './AppButton.vue';
import ErrorMessage from './ErrorMessage.vue';
import ModalDialog from './ModalDialog.vue';

const COMMENT_MAX_LENGTH = 1000;

const props = defineProps<{
  mode: 'approve' | 'reject';
  request: VacationRequest;
  busy?: boolean;
  error?: string | null;
}>();
const emit = defineEmits<{ confirm: [comment: string]; close: [] }>();

const commentId = useId();
const hintId = useId();
const comment = ref('');

const isReject = computed(() => props.mode === 'reject');
const missingComment = computed(() => isReject.value && comment.value.trim() === '');

function confirm() {
  if (missingComment.value) return;
  emit('confirm', comment.value.trim());
}
</script>

<template>
  <ModalDialog :title="isReject ? 'Reject request' : 'Approve request'" @close="emit('close')">
    <form :class="$style.form" @submit.prevent="confirm">
      <p :class="$style.summary">
        <strong>{{ request.user.name }}</strong
        >, {{ formatRange(request.startDate, request.endDate) }}
      </p>
      <div>
        <label :for="commentId">
          Comment <span v-if="!isReject" :class="$style.optional">(optional)</span>
        </label>
        <textarea
          :id="commentId"
          v-model="comment"
          rows="4"
          :maxlength="COMMENT_MAX_LENGTH"
          :required="isReject"
          :aria-describedby="missingComment ? hintId : undefined"
        />
        <p v-if="missingComment" :id="hintId" :class="$style.hint">
          A comment is required to reject a request.
        </p>
      </div>
      <ErrorMessage :message="error" />
    </form>
    <template #actions>
      <AppButton :disabled="busy" @click="emit('close')">Cancel</AppButton>
      <AppButton
        :variant="isReject ? 'danger' : 'primary'"
        :disabled="busy || missingComment"
        @click="confirm"
      >
        {{ isReject ? 'Reject' : 'Approve' }}
      </AppButton>
    </template>
  </ModalDialog>
</template>

<style module>
.form {
  display: grid;
  gap: var(--space-4);
}
.summary {
  margin: 0;
}
.optional {
  font-weight: 400;
  color: var(--color-muted);
}
.hint {
  margin: var(--space-1) 0 0;
  font-size: 0.875rem;
  color: var(--color-muted);
}
</style>
