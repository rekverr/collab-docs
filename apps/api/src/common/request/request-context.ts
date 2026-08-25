import { AsyncLocalStorage } from "node:async_hooks";

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestId(requestId: string, callback: () => void): void {
  storage.run({ requestId }, callback);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
