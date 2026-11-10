<script setup lang="ts">
import type { ReceivedEvent } from '../api/events';

defineProps<{ events: ReceivedEvent[] }>();
</script>

<template>
  <p v-if="events.length === 0" :class="$style.empty">(none yet)</p>
  <ul v-else :class="$style.list">
    <li v-for="(e, i) in events" :key="i" :class="$style.item">
      <time :class="$style.time">{{ e.receivedAt }}</time>
      <pre :class="$style.json">{{ JSON.stringify(e.envelope, null, 2) }}</pre>
    </li>
  </ul>
</template>

<style module>
.empty {
  color: #6b7280;
}
.list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 1rem;
}
.item {
  min-width: 0;
}
.time {
  font-size: 0.8rem;
  color: #6b7280;
}
.json {
  margin: 0.25rem 0 0;
  padding: 1rem;
  background: #111;
  color: #9f9;
  overflow: auto;
  border-radius: 6px;
}
</style>
