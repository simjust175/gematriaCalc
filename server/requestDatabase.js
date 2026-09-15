import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithRequestDatabase(db, callback) {
  return storage.run(db, callback);
}

export function getRequestDatabase() {
  return storage.getStore() || null;
}
