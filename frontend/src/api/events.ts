import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

export interface ReceivedEvent {
  receivedAt: string;
  commonEventVersion: string;
  envelope: unknown;
}

export const sendTestEvent = () => http.post('/test/publish').then((r) => r.data);
export const fetchReceivedEvents = () =>
  http.get<ReceivedEvent[]>('/test/events').then((r) => r.data);
