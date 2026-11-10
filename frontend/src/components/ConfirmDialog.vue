<script setup lang="ts">
import AppButton from './AppButton.vue';
import ErrorMessage from './ErrorMessage.vue';
import ModalDialog from './ModalDialog.vue';

withDefaults(
  defineProps<{
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
    busy?: boolean;
    error?: string | null;
  }>(),
  { cancelLabel: 'Keep it', error: null },
);
const emit = defineEmits<{ confirm: []; close: [] }>();
</script>

<template>
  <ModalDialog :title="title" @close="emit('close')">
    <slot />
    <ErrorMessage :message="error" />
    <template #actions>
      <AppButton :disabled="busy" @click="emit('close')">{{ cancelLabel }}</AppButton>
      <AppButton variant="danger" :disabled="busy" @click="emit('confirm')">
        {{ confirmLabel }}
      </AppButton>
    </template>
  </ModalDialog>
</template>
