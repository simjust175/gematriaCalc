import { onBeforeUnmount, onMounted, ref } from 'vue';
import { APP_RELEASE } from '@/config/appRelease.js';
import {
  cleanUpdateUrl, compareVersions, deferRelease, initializeAcknowledgement,
  readAcknowledgedVersion, shouldOfferRelease, UPDATE_KEYS,
} from '@/updates/release.js';
import { applyAppUpdate, fetchLatestRelease } from '@/updates/applyUpdate.js';

function browserStorage(name) {
  try { return window[name]; } catch { return undefined; }
}

export function useAppUpdates() {
  const release = ref(APP_RELEASE);
  const open = ref(false);
  const updating = ref(false);
  const error = ref('');
  const local = browserStorage('localStorage');
  const session = browserStorage('sessionStorage');
  const state = initializeAcknowledgement(APP_RELEASE.version, local, session);
  let checking = false;
  let disposed = false;
  let interval;

  function syncAcknowledgement() {
    const acknowledged = readAcknowledgedVersion(local);
    if (acknowledged && compareVersions(acknowledged, state.acknowledged) > 0) {
      state.acknowledged = acknowledged;
      open.value = shouldOfferRelease(release.value, state.acknowledged, state.deferred, APP_RELEASE.version);
    }
  }

  function onStorage(event) {
    if (event.key === UPDATE_KEYS.acknowledged) syncAcknowledgement();
  }

  async function checkForUpdate() {
    if (checking || updating.value || disposed || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      syncAcknowledgement();
      const latest = await fetchLatestRelease();
      if (disposed) return;
      release.value = latest;
      open.value = shouldOfferRelease(latest, state.acknowledged, state.deferred, APP_RELEASE.version);
    } catch (failure) {
      // Offline checks don't obstruct ordinary app use; an existing critical prompt stays open.
      console.warn('App release check unavailable:', failure.message);
    } finally {
      checking = false;
    }
  }

  function defer() {
    if (updating.value || !deferRelease(release.value, session)) return;
    state.deferred = release.value.version;
    open.value = false;
    error.value = '';
  }

  async function update() {
    if (updating.value) return;
    updating.value = true;
    error.value = '';
    try {
      if (!session) throw new Error('לא ניתן לשמור את מצב העדכון בדפדפן. בדקו את הגדרות האחסון.');
      await applyAppUpdate({ release: release.value, session });
    } catch (failure) {
      error.value = /[\u0590-\u05ff]/.test(failure.message)
        ? failure.message : 'העדכון לא הושלם. בדקו את החיבור ונסו שוב.';
      updating.value = false;
    }
  }

  onMounted(() => {
    cleanUpdateUrl(window.location, window.history);
    checkForUpdate();
    interval = setInterval(checkForUpdate, 90000);
    window.addEventListener('focus', checkForUpdate);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', checkForUpdate);
  });
  onBeforeUnmount(() => {
    disposed = true;
    clearInterval(interval);
    window.removeEventListener('focus', checkForUpdate);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', checkForUpdate);
  });
  return { release, open, updating, error, defer, update };
}
