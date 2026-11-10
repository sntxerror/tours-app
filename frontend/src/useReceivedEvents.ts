import { onBeforeUnmount, onMounted, ref } from 'vue';
import { fetchReceivedEvents, type ReceivedEvent } from './api/events';

const POLL_MS = 2000;

export function useReceivedEvents() {
  const events = ref<ReceivedEvent[]>([]);
  let timer: number | undefined;

  const refresh = async () => {
    try {
      events.value = await fetchReceivedEvents();
    } catch {
      /* backend still booting; next tick retries */
    }
  };

  onMounted(() => {
    void refresh();
    timer = window.setInterval(refresh, POLL_MS);
  });
  onBeforeUnmount(() => window.clearInterval(timer));

  return { events, refresh };
}
