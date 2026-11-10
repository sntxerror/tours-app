import axios from 'axios';

/**
 * The one Axios instance of the app. `/api` is same-origin: the Vite dev server and nginx proxy it
 * to the backend, so there is no CORS and no base URL to configure.
 */
export const http = axios.create({ baseURL: '/api' });

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Called by the auth store; kept here so this module never imports the store (no cycles). */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Runs when a request is rejected with 401, i.e. the session expired. Wired up in `main.ts`. */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

// Login answers 401 for bad credentials and `/auth/me` is only used to restore a session: both
// callers handle the 401 themselves, so they must not trigger the global logout.
const HANDLES_OWN_401 = ['/auth/login', '/auth/me'];

http.interceptors.request.use((config) => {
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
  return config;
});

http.interceptors.response.use(undefined, (error: unknown) => {
  if (
    axios.isAxiosError(error) &&
    error.response?.status === 401 &&
    !HANDLES_OWN_401.includes(error.config?.url ?? '')
  ) {
    unauthorizedHandler?.();
  }
  return Promise.reject(error);
});
