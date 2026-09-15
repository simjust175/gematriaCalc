import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PostgresStore = connectPgSimple(session);
const LEGACY_PREFIX = 'legacy:';
const MULTI_USER_PREFIX = 'multi:';

function unavailableError() {
  const error = new Error('Multi-user database is unavailable');
  error.code = 'MULTI_USER_DATABASE_UNAVAILABLE';
  return error;
}

export class RoleRoutedSessionStore extends session.Store {
  constructor({ legacyPool, multiUserPool }) {
    super();
    this.legacyStore = new PostgresStore({
      pool: legacyPool,
      createTableIfMissing: true,
    });
    this.multiUserStore = multiUserPool
      ? new PostgresStore({
        pool: multiUserPool,
        createTableIfMissing: true,
      })
      : null;
  }

  storeForSessionId(sid) {
    if (sid?.startsWith(MULTI_USER_PREFIX)) {
      if (!this.multiUserStore) throw unavailableError();
      return this.multiUserStore;
    }
    return this.legacyStore;
  }

  storeForSession(sessionData, sid) {
    if (sessionData?.databaseRole === 'multi-user' || sid?.startsWith(MULTI_USER_PREFIX)) {
      if (!this.multiUserStore) throw unavailableError();
      return this.multiUserStore;
    }
    return this.legacyStore;
  }

  get(sid, callback) {
    try {
      this.storeForSessionId(sid).get(sid, callback);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sessionData, callback) {
    try {
      this.storeForSession(sessionData, sid).set(sid, sessionData, callback);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.storeForSessionId(sid).destroy(sid, callback);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sessionData, callback) {
    try {
      this.storeForSession(sessionData, sid).touch(sid, sessionData, callback);
    } catch (error) {
      callback(error);
    }
  }
}

export { LEGACY_PREFIX, MULTI_USER_PREFIX };