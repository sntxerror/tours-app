import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  correlationId: string;
  ip?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithRequestContext = <T>(context: RequestContext, work: () => T): T =>
  storage.run(context, work);

export const getRequestContext = (): RequestContext | undefined => storage.getStore();
