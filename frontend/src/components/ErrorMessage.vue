<script setup lang="ts">
defineProps<{ message: string | null | undefined }>();
</script>

<template>
  <!-- The live region stays in the DOM so screen readers announce a message when it appears. -->
  <div role="alert" aria-live="assertive">
    <p v-if="message" :class="$style.error">{{ message }}</p>
  </div>
</template>

<style module>
.error {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
</style>
