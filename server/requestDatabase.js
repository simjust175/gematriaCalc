import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function setRequestDatabase(db) {
  storage.enterWith(db);
}

export function getRequestDatabase() {
  return storage.getStore() || null;
}
