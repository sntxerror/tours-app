<script setup lang="ts">
import SendEventButton from '../components/SendEventButton.vue';
import ReceivedEventList from '../components/ReceivedEventList.vue';
import { useReceivedEvents } from '../useReceivedEvents';

const { events, refresh } = useReceivedEvents();
</script>

<template>
  <main :class="$style.page">
    <h1>EventBridge → SQS (LocalStack)</h1>
    <SendEventButton @sent="refresh" />
    <h2>Received by worker</h2>
    <ReceivedEventList :events="events" />
  </main>
</template>

<style module>
.page {
  max-width: 60rem;
  margin: 2rem auto;
  padding: 0 1rem;
  font-family: system-ui, sans-serif;
}
</style>
