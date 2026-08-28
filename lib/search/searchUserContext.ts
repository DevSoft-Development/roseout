import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

type SearchUserContext = { userId: string | null };

const storage = new AsyncLocalStorage<SearchUserContext>();

export function withSearchUserContext<T>(userId: string | null | undefined, callback: () => T): T {
  return storage.run({ userId: userId ? String(userId) : null }, callback);
}

export function currentSearchUserId() {
  return storage.getStore()?.userId ?? null;
}
