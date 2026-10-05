import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanUpdateUrl, compareVersions, deferRelease, initializeAcknowledgement,
  shouldOfferRelease, UPDATE_KEYS, UPDATE_QUERY, validateRelease,
} from '../src/updates/release.js';
import {
  activateWaitingWorker, applyAppUpdate, fetchLatestRelease,
} from '../src/updates/applyUpdate.js';
import { appReleasePlugin } from '../build/appReleasePlugin.js';
import { APP_RELEASE } from '../src/config/appRelease.js';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const release = (version = '2.0.0', critical = false) => ({ version, notes: [], critical });

test('versions compare numerically, not lexically, including calendar versions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0', '10.0'), -1);
  assert.equal(compareVersions('v1.0', '1.0.0+build42'), 0);
  assert.equal(compareVersions('2026.10.05.2', '2026.10.05.1'), 1);
});

test('prereleases precede final releases and compare numeric identifiers correctly', () => {
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.2'), 1);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1);
});

test('invalid versions, notes and critical flags are rejected', () => {
  for (const version of ['', 'latest', '1..2', '1/2', undefined]) {
    assert.throws(() => compareVersions(version, '1.0.0'));
  }
  assert.throws(() => validateRelease({ version: '1.0', critical: 'true' }));
  assert.throws(() => validateRelease({ ...release(), notes: [null] }));
  assert.deepEqual(validateRelease({ version: '1.0', critical: false }), release('1.0'));
});

test('first visit establishes the loaded version without an unnecessary update prompt', () => {
  const local = new MemoryStorage({ 'unrelated-setting': 'keep' });
  const state = initializeAcknowledgement('1.0.0', local, new MemoryStorage());
  assert.equal(state.acknowledged, '1.0.0');
  assert.equal(shouldOfferRelease(release('1.0.0'), state.acknowledged, null, '1.0.0'), false);
  assert.equal(local.getItem('unrelated-setting'), 'keep');
});

test('newer deployed releases prompt; equal, older and rolled-back releases do not', () => {
  assert.equal(shouldOfferRelease(release(), '1.0.0', null, '1.0.0'), true);
  assert.equal(shouldOfferRelease(release(), '2.0.0', null, '1.0.0'), false);
  assert.equal(shouldOfferRelease(release('1.0.0'), '2.0.0', null, '1.0.0'), false);
  assert.equal(shouldOfferRelease(release('1.5.0'), '1.0.0', null, '2.0.0'), false);
});

test('non-critical defer is session-only and never permanently acknowledges a release', () => {
  const local = new MemoryStorage({ [UPDATE_KEYS.acknowledged]: '1.0.0' });
  const session = new MemoryStorage({ unrelated: 'keep' });
  assert.equal(deferRelease(release(), session), true);
  const state = initializeAcknowledgement('1.0.0', local, session);
  assert.equal(shouldOfferRelease(release(), state.acknowledged, state.deferred, '1.0.0'), false);
  const nextVisit = initializeAcknowledgement('1.0.0', local, new MemoryStorage());
  assert.equal(shouldOfferRelease(release(), nextVisit.acknowledged, nextVisit.deferred, '1.0.0'), true);
  assert.equal(local.getItem(UPDATE_KEYS.acknowledged), '1.0.0');
  assert.equal(session.getItem('unrelated'), 'keep');
});

test('critical updates cannot be deferred and override a prior non-critical deferral', () => {
  const session = new MemoryStorage({ [UPDATE_KEYS.deferred]: '2.0.0' });
  assert.equal(deferRelease(release('2.0.0', true), session), false);
  assert.equal(shouldOfferRelease(release('2.0.0', true), '1.0.0', '2.0.0', '1.0.0'), true);
});

test('a new release is offered even when an earlier release was deferred', () => {
  assert.equal(shouldOfferRelease(release('2.1.0'), '1.0.0', '2.0.0', '1.0.0'), true);
});

test('a pending update is acknowledged only once the new bundle actually boots', () => {
  const local = new MemoryStorage({ [UPDATE_KEYS.acknowledged]: '1.0.0', saved: 'keep' });
  const session = new MemoryStorage({
    [UPDATE_KEYS.pending]: '2.0.0', [UPDATE_KEYS.deferred]: '2.0.0', other: 'keep',
  });
  initializeAcknowledgement('1.0.0', local, session);
  assert.equal(local.getItem(UPDATE_KEYS.acknowledged), '1.0.0');
  assert.equal(session.getItem(UPDATE_KEYS.pending), '2.0.0');
  initializeAcknowledgement('2.0.0', local, session);
  assert.equal(local.getItem(UPDATE_KEYS.acknowledged), '2.0.0');
  assert.equal(session.getItem(UPDATE_KEYS.pending), null);
  assert.equal(session.getItem(UPDATE_KEYS.deferred), null);
  assert.equal(local.getItem('saved'), 'keep');
  assert.equal(session.getItem('other'), 'keep');
});

test('invalid stored versions recover without breaking the app or downgrading valid acknowledgements', () => {
  assert.equal(initializeAcknowledgement('1.0.0',
    new MemoryStorage({ [UPDATE_KEYS.acknowledged]: 'invalid' }), new MemoryStorage()).acknowledged, '1.0.0');
  const local = new MemoryStorage({ [UPDATE_KEYS.acknowledged]: '3.0.0' });
  initializeAcknowledgement('2.0.0', local, new MemoryStorage({ [UPDATE_KEYS.pending]: '2.0.0' }));
  assert.equal(local.getItem(UPDATE_KEYS.acknowledged), '3.0.0');
});

test('release discovery bypasses HTTP cache and retains same-origin credentials', async () => {
  const result = await fetchLatestRelease(async (url, options) => {
    assert.equal(url, '/app-release.json?check=123');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'same-origin');
    return { ok: true, json: async () => release() };
  }, () => 123);
  assert.deepEqual(result, release());
});

test('failed release discovery does not invent a release', async () => {
  await assert.rejects(fetchLatestRelease(async () => ({ ok: false })));
});

test('waiting worker is activated before refresh proceeds', async () => {
  const worker = new EventTarget();
  worker.state = 'installed';
  worker.postMessage = message => {
    assert.equal(message, 'SKIP_WAITING');
    queueMicrotask(() => { worker.state = 'activated'; worker.dispatchEvent(new Event('statechange')); });
  };
  await activateWaitingWorker({ waiting: worker });
  assert.equal(worker.state, 'activated');
});

test('worker timeout and installation failure are explicit, rather than refreshing stale assets', async () => {
  const worker = new EventTarget();
  worker.state = 'installing';
  await assert.rejects(activateWaitingWorker({ installing: worker }, 5));
  worker.state = 'redundant';
  await assert.rejects(activateWaitingWorker({ installing: worker }, 5));
});

function updateFixture({ htmlVersion = '2.0.0', manifestVersion = '2.0.0' } = {}) {
  const session = new MemoryStorage({ untouched: 'keep' });
  const events = [];
  const location = {
    href: 'https://example.test/?view=prayer#section',
    replace: url => events.push(['reload', url]),
  };
  return {
    session, events, location,
    fetchImpl: async (url, options) => {
      assert.equal(options.cache, 'no-store');
      assert.equal(options.credentials, 'same-origin');
      events.push(['fetch', url]);
      return String(url).startsWith('/app-release.json')
        ? { ok: true, json: async () => release(manifestVersion) }
        : { ok: true, text: async () => `<html><head><meta name="gematria-release" content="${htmlVersion}"></head></html>` };
    },
  };
}

test('update flow checks worker and newest release, verifies fresh HTML, and navigates without clearing data', async () => {
  const fixture = updateFixture();
  await applyAppUpdate({
    ...fixture, release: release('1.1.0'), now: () => 123,
    serviceWorker: { getRegistration: async () => ({
      update: async () => fixture.events.push(['worker-update']),
    }) },
  });
  assert.equal(fixture.events[0][0], 'worker-update');
  const navigation = new URL(fixture.events.at(-1)[1]);
  assert.equal(navigation.searchParams.get('view'), 'prayer');
  assert.equal(navigation.hash, '#section');
  assert.equal(navigation.searchParams.get(UPDATE_QUERY), '2.0.0-123');
  assert.equal(fixture.session.getItem(UPDATE_KEYS.pending), '2.0.0');
  assert.equal(fixture.session.getItem('untouched'), 'keep');
  assert.equal(fixture.session.getItem(UPDATE_KEYS.acknowledged), null);
});

test('update also works without an installed service worker', async () => {
  const fixture = updateFixture();
  await applyAppUpdate({ ...fixture, release: release(), serviceWorker: null });
  assert.equal(fixture.events.at(-1)[0], 'reload');
});

test('stale HTML does not reload or acknowledge an update', async () => {
  const fixture = updateFixture({ htmlVersion: '1.0.0' });
  await assert.rejects(applyAppUpdate({ ...fixture, release: release(), serviceWorker: null }));
  assert.equal(fixture.events.some(([event]) => event === 'reload'), false);
  assert.equal(fixture.session.getItem(UPDATE_KEYS.pending), null);
});

test('a rolled-back manifest is not treated as a successfully applied newer update', async () => {
  const fixture = updateFixture({ manifestVersion: '1.0.0' });
  await assert.rejects(applyAppUpdate({ ...fixture, release: release(), serviceWorker: null }));
  assert.equal(fixture.events.some(([event]) => event === 'reload'), false);
});

test('worker update failure preserves state and does not navigate', async () => {
  const fixture = updateFixture();
  await assert.rejects(applyAppUpdate({
    ...fixture, release: release(),
    serviceWorker: { getRegistration: async () => ({ update: async () => { throw new Error('offline'); } }) },
  }));
  assert.equal(fixture.events.length, 0);
  assert.equal(fixture.session.getItem('untouched'), 'keep');
});

test('cache-busting URL cleanup preserves unrelated URL state', () => {
  let replacement;
  const history = { state: { keep: true }, replaceState: (...args) => { replacement = args; } };
  cleanUpdateUrl({ href: 'https://example.test/?view=prayer&__gematria_update=2.0-123#section' }, history);
  assert.deepEqual(replacement, [{ keep: true }, '', 'https://example.test/?view=prayer#section']);
});

test('build metadata and static manifest come from the single release configuration', () => {
  const plugin = appReleasePlugin();
  assert.equal(plugin.transformIndexHtml()[0].attrs.content, APP_RELEASE.version);
  let emitted;
  plugin.generateBundle.call({ emitFile: value => { emitted = value; } });
  assert.equal(emitted.fileName, 'app-release.json');
  assert.deepEqual(JSON.parse(emitted.source), validateRelease(APP_RELEASE));
});
