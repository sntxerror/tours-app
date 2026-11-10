import axios from 'axios';

/** Error body produced by NestJS; validation errors list every problem in `message`. */
interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';

/** Turns any thrown value (usually an Axios error) into text that can be shown to the user. */
export function toErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return GENERIC_MESSAGE;
  if (!error.response) return NETWORK_MESSAGE;

  const message = error.response.data?.message;
  if (Array.isArray(message) && message.length > 0) return message.join('; ');
  if (typeof message === 'string' && message.trim()) return message;
  return GENERIC_MESSAGE;
}

/** HTTP status of a failed request, if the server answered at all. */
export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}
