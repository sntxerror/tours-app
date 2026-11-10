import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request (or per-background-job) facts that events pick up without every caller passing them down. */
export interface RequestContext {
  correlationId: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, work: () => T): T =>
  storage.run(context, work);

export const getRequestContext = (): RequestContext | undefined => storage.getStore();
