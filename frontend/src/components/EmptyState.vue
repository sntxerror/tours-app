<template>
  <p :class="$style.empty"><slot /></p>
</template>

<style module>
.empty {
  margin: 0;
  padding: var(--space-5);
  text-align: center;
  color: var(--color-muted);
}
</style>
