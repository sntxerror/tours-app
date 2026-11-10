<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const dialog = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE = 'input, textarea, select, button:not([data-dialog-close])';

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  dialog.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  previouslyFocused?.focus();
});
</script>

<template>
  <div :class="$style.backdrop" @mousedown.self="emit('close')">
    <div
      ref="dialog"
      :class="$style.dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
    >
      <header :class="$style.header">
        <h2 :id="titleId" :class="$style.title">{{ title }}</h2>
        <button
          type="button"
          data-dialog-close
          :class="$style.close"
          aria-label="Close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>
      <div :class="$style.body"><slot /></div>
      <footer v-if="$slots.actions" :class="$style.actions"><slot name="actions" /></footer>
    </div>
  </div>
</template>

<style module>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgb(16 24 40 / 50%);
}
.dialog {
  width: 100%;
  max-width: 32rem;
  max-height: 100%;
  overflow: auto;
  border-radius: var(--radius);
  background: var(--color-surface);
  box-shadow: var(--shadow);
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-border);
}
.title {
  font-size: 1.125rem;
}
.close {
  border: 0;
  background: none;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--color-muted);
  cursor: pointer;
}
.body {
  padding: var(--space-5);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-border);
}
</style>
