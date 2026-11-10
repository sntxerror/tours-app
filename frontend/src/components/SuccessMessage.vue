<script setup lang="ts">
defineProps<{ message: string | null | undefined }>();
</script>

<template>
  <div role="status" aria-live="polite">
    <p v-if="message" :class="$style.success">{{ message }}</p>
  </div>
</template>

<style module>
.success {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-success);
  border-radius: var(--radius);
  background: var(--color-success-soft);
  color: var(--color-success);
}
</style>
