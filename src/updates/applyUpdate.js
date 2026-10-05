import { compareVersions, UPDATE_KEYS, UPDATE_QUERY, validateRelease } from './release.js';

async function timedFetch(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetchImpl(url, {
      cache: 'no-store', credentials: 'same-origin', ...options, signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function timedWorkerUpdate(registration) {
  let timer;
  try {
    await Promise.race([
      registration.update(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('עדכון הדפדפן מתעכב. נסו שוב.')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLatestRelease(fetchImpl = fetch, now = Date.now) {
  const response = await timedFetch(fetchImpl, `/app-release.json?check=${now()}`);
  if (!response.ok) throw new Error('לא ניתן לבדוק את העדכון כרגע.');
  return validateRelease(await response.json());
}

export async function activateWaitingWorker(registration, timeout = 15000) {
  const worker = registration.waiting || registration.installing;
  if (!worker || worker.state === 'activated') return;
  await new Promise((resolve, reject) => {
    let timer;
    function finish(error) {
      clearTimeout(timer);
      worker.removeEventListener('statechange', onStateChange);
      error ? reject(error) : resolve();
    }
    function onStateChange() {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('העדכון לא הושלם. נסו שוב.'));
      else if (worker.state === 'installed') worker.postMessage('SKIP_WAITING');
    }
    worker.addEventListener('statechange', onStateChange);
    timer = setTimeout(() => finish(new Error('העדכון מתעכב. נסו שוב.')), timeout);
    onStateChange();
  });
}

function htmlRelease(html) {
  const meta = html.match(/<meta\b[^>]*\bname=["']gematria-release["'][^>]*>/i)?.[0];
  return meta?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
}

export async function applyAppUpdate({
  release,
  fetchImpl = fetch,
  serviceWorker = navigator.serviceWorker,
  session = sessionStorage,
  location = window.location,
  now = Date.now,
}) {
  // No unregistering, cache deletion, cookie changes, or clearing application storage.
  if (serviceWorker?.getRegistration) {
    const registration = await serviceWorker.getRegistration();
    if (registration) {
      await timedWorkerUpdate(registration);
      await activateWaitingWorker(registration);
    }
  }
  const latest = await fetchLatestRelease(fetchImpl, now);
  if (compareVersions(latest.version, release.version) < 0) {
    throw new Error('העדכון עדיין אינו זמין. נסו שוב בעוד רגע.');
  }
  const url = new URL(location.href);
  url.searchParams.set(UPDATE_QUERY, `${latest.version}-${now()}`);
  const response = await timedFetch(fetchImpl, url.href);
  if (!response.ok) throw new Error('לא ניתן לטעון את העדכון. בדקו את החיבור ונסו שוב.');
  const version = htmlRelease(await response.text());
  if (!version || compareVersions(version, latest.version) < 0) {
    throw new Error('העדכון עדיין נטען בשרת. נסו שוב בעוד רגע.');
  }
  // A cache-busted navigation loads fresh HTML and its content-hashed Vite assets.
  // The next bundle confirms this pending version before permanently acknowledging it.
  try {
    session.setItem(UPDATE_KEYS.pending, latest.version);
  } catch {
    throw new Error('לא ניתן לשמור את מצב העדכון בדפדפן. בדקו את הגדרות האחסון.');
  }
  location.replace(url.href);
}
