<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'secondary' | 'primary' | 'danger';
    small?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'secondary', type: 'button' },
);
</script>

<template>
  <button :type="type" :class="[$style.button, $style[variant], { [$style.small]: small }]">
    <slot />
  </button>
</template>

<style module>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.secondary:hover:not(:disabled) {
  background: var(--color-bg);
}
.primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}
.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.danger {
  border-color: var(--color-danger);
  background: var(--color-danger);
  color: #fff;
}
.danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
}
.small {
  padding: var(--space-1) var(--space-3);
  font-size: 0.875rem;
}
</style>
