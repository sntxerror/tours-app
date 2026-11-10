<template>
  <p :class="$style.loading" role="status">Loading…</p>
</template>

<style module>
.loading {
  margin: 0;
  padding: var(--space-5);
  text-align: center;
  color: var(--color-muted);
}
</style>
