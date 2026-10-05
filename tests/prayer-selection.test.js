import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAll } from '../src/composables/useGematria.js';
import { calculatePrayerSelection, positionSelectionPopover, readPrayerSelection } from '../src/utils/prayerSelection.js';
import { useBaseWords } from '../src/composables/useBaseWords.js';
import { effectScope } from 'vue';
import { readFileSync } from 'node:fs';

for (const text of ['שמע', 'שמע ישראל', 'שְׁמַע יִשְׂרָאֵל,', 'שְׁמַ', 'ראל', ' ה׳ אֱלֹהֵינוּ! ', 'ברוך־שם', 'ברוך\nשם', 'ךםןףץ']) {
  test(`prayer calculation reuses the exact calculator result: ${JSON.stringify(text)}`, () => {
    assert.deepEqual(calculatePrayerSelection(text), computeAll(text));
  });
}
test('full, initials and finals have canonical values, without conflating כולל', () => {
  const result = calculatePrayerSelection('שמע ישראל');
  assert.equal(result.fullGematria, 951);
  assert.equal(result.initials, 'שי');
  assert.equal(result.initialsGematria, 310);
  assert.equal(result.finals, 'על');
  assert.equal(result.finalsGematria, 100);
});
test('whitespace, marks, punctuation, non-Hebrew and numeric-only selections are rejected', () => {
  for (const text of ['', ' \n ', '123', 'abc!', ',.׳', '\u05B0', null]) assert.equal(calculatePrayerSelection(text), null);
  assert.equal(readPrayerSelection(null, null), null);
  assert.equal(readPrayerSelection({ isConnected: true }, { isCollapsed: true }), null);
});
const rectangle = (top = 300, left = 100) => ({ top, bottom: top + 24, left, right: left + 150, width: 150, height: 24 });
const viewport = { width: 390, height: 844 };
test('desktop action uses space above its selection', () => {
  const position = positionSelectionPopover([rectangle()], { width: 150, height: 40 }, viewport);
  assert.deepEqual(position, { left: 100, top: 250 });
});
test('near-top selection places the result below', () => {
  const position = positionSelectionPopover([rectangle(20)], { width: 340, height: 300 }, viewport);
  assert.equal(position.top, 54);
  assert.equal(position.left, 12);
});
test('touch action stays below the native selection handles where space permits', () => {
  const position = positionSelectionPopover([rectangle()], { width: 150, height: 40 }, viewport, true);
  assert.equal(position.top, 356);
});
test('RTL edges and zoomed visual viewports clamp the result inside visible bounds', () => {
  const view = { left: 20, top: 50, width: 320, height: 500 };
  const position = positionSelectionPopover([rectangle(510, 310)], { width: 290, height: 260 }, view, true);
  assert.ok(position.left >= 32 && position.left + 290 <= 328);
  assert.ok(position.top >= 62 && position.top + 260 <= 538);
});
test('offscreen and empty rect lists cannot create detached floating controls', () => {
  assert.equal(positionSelectionPopover([], { width: 100, height: 40 }, viewport), null);
  assert.equal(positionSelectionPopover([rectangle(900)], { width: 100, height: 40 }, viewport), null);
});

test('shared Yesod persistence optionally preserves exact selected text without changing ordinary callers', async () => {
  const originalFetch = globalThis.fetch;
  const scope = effectScope();
  let payload;
  let status = 200;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/base-words');
    payload = JSON.parse(options.body);
    return { status, ok: status === 200, json: async () => ({ item: { id: 7, originalText: payload.originalText } }) };
  };
  try {
    const selected = scope.run(() => useBaseWords(0, false, { preserveOriginalText: true }));
    const ordinary = scope.run(() => useBaseWords(0, false));
    const exact = '  שְׁמַע, ישראל!  ';
    assert.equal((await selected.save(exact)).ok, true);
    assert.deepEqual(payload, { originalText: exact });
    assert.equal(selected.items.value[0].originalText, exact);
    await ordinary.save(exact, 'calculator');
    assert.deepEqual(payload, { originalText: exact.trim(), sourceType: 'calculator' });
    status = 409;
    assert.equal((await selected.save(exact)).duplicate, true);
    assert.equal(selected.items.value.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    scope.stop();
  }
});

test('prayer controller uses canonical Milui and saved settings rather than another engine', () => {
  const controller = readFileSync(new URL('../src/components/PrayerSelectionCalculator.vue', import.meta.url), 'utf8');
  assert.match(controller, /calculateMilui\(snapshot\.value\.text, miluiMapping\.value\)/);
  assert.match(controller, /getCommonMiluiForms\(snapshot\.value\.text, miluiMapping\.value\)/);
  assert.match(controller, /normalizeMiluiMapping\(payload\.mapping\)/);
  assert.match(controller, /\/api\/settings\/milui/);
  assert.doesNotMatch(controller, /MILUI_DEFAULT_MAPPING|LETTER_VALUES/);
});
