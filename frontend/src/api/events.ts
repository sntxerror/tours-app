import { http } from './http';

export interface ReceivedEvent {
  receivedAt: string;
  commonEventVersion: string;
  envelope: unknown;
}

// Dev-only endpoints (public, enabled by ENABLE_TEST_ENDPOINTS=true) behind the /events-test page.
export const sendTestEvent = () => http.post('/test/publish').then((r) => r.data);
export const fetchReceivedEvents = () =>
  http.get<ReceivedEvent[]>('/test/events').then((r) => r.data);
