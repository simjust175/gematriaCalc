export const UPDATE_KEYS = Object.freeze({
  acknowledged: 'gematria-update-acknowledged',
  deferred: 'gematria-update-deferred',
  pending: 'gematria-update-pending',
});
export const UPDATE_QUERY = '__gematria_update';

function parseVersion(version) {
  if (typeof version !== 'string'
      || !/^v?\d+(?:\.\d+){0,3}(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(version)) {
    throw new Error(`Invalid app release version: ${String(version)}`);
  }
  const [core, prerelease] = version.replace(/^v/, '').split('+')[0].split('-');
  return { core: core.split('.').map(BigInt), prerelease: prerelease?.split('.') };
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index += 1) {
    const x = a.core[index] ?? 0n;
    const y = b.core[index] ?? 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  if (!a.prerelease || !b.prerelease) {
    return a.prerelease ? -1 : b.prerelease ? 1 : 0;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const x = a.prerelease[index];
    const y = b.prerelease[index];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) {
      if (BigInt(x) === BigInt(y)) continue;
      return BigInt(x) > BigInt(y) ? 1 : -1;
    }
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

function storedVersion(storage, key) {
  try {
    const value = storage?.getItem(key);
    if (value) parseVersion(value);
    return value || null;
  } catch {
    // Corrupt or unavailable browser storage must not break the application.
    return null;
  }
}

export function validateRelease(value) {
  parseVersion(value?.version);
  if (typeof value.critical !== 'boolean'
      || (value.notes !== undefined && (!Array.isArray(value.notes)
        || value.notes.some(note => typeof note !== 'string' || !note.trim())))) {
    throw new Error('Invalid app release configuration');
  }
  return { version: value.version, notes: value.notes || [], critical: value.critical };
}

export function readAcknowledgedVersion(local) {
  return storedVersion(local, UPDATE_KEYS.acknowledged);
}

export function initializeAcknowledgement(currentVersion, local, session) {
  parseVersion(currentVersion);
  let acknowledged = readAcknowledgedVersion(local);
  const pending = storedVersion(session, UPDATE_KEYS.pending);
  const applied = pending && compareVersions(currentVersion, pending) >= 0;
  // First visits establish a baseline; an update is acknowledged only AFTER its bundle boots.
  if (!acknowledged || applied) {
    const next = acknowledged && compareVersions(acknowledged, currentVersion) > 0
      ? acknowledged : currentVersion;
    try {
      local?.setItem(UPDATE_KEYS.acknowledged, next);
      if (applied) {
        session?.removeItem(UPDATE_KEYS.pending);
        session?.removeItem(UPDATE_KEYS.deferred);
      }
    } catch (error) {
      console.warn('App update acknowledgement could not be persisted:', error.name);
    }
    acknowledged = next;
  }
  return { acknowledged, deferred: storedVersion(session, UPDATE_KEYS.deferred) };
}

export function shouldOfferRelease(release, acknowledged, deferred, currentVersion) {
  return compareVersions(release.version, acknowledged) > 0
    && compareVersions(release.version, currentVersion) >= 0
    && (release.critical || deferred !== release.version);
}

export function deferRelease(release, session) {
  if (release.critical) return false;
  try {
    session?.setItem(UPDATE_KEYS.deferred, release.version);
  } catch (error) {
    console.warn('App update deferral could not be persisted:', error.name);
  }
  return true;
}

export function cleanUpdateUrl(location, history) {
  const url = new URL(location.href);
  if (!url.searchParams.has(UPDATE_QUERY)) return;
  url.searchParams.delete(UPDATE_QUERY);
  history.replaceState(history.state, '', url.href);
}
