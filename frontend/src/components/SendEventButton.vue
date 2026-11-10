<script setup lang="ts">
import { ref } from 'vue';
import { sendTestEvent } from '../api/events';

const emit = defineEmits<{ sent: [] }>();
const sending = ref(false);
const error = ref<string | null>(null);

async function send() {
  sending.value = true;
  error.value = null;
  try {
    await sendTestEvent();
    setTimeout(() => emit('sent'), 500);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div>
    <button :class="$style.button" :disabled="sending" @click="send">Send event</button>
    <p v-if="error" :class="$style.error">{{ error }}</p>
  </div>
</template>

<style module>
.button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: 0;
  border-radius: 6px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.error {
  color: #b91c1c;
}
</style>
