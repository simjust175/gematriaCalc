import test from 'node:test';
import assert from 'node:assert/strict';
import { calcGematria } from '../src/composables/useGematria.js';
import {
  CANONICAL_HAVAYAH_MILUI,
  MILUI_DEFAULT_MAPPING,
  calculateMilui,
  cloneMiluiMapping,
  containsStandaloneHavayah,
} from '../src/utils/milui.js';

test('canonical מילויי הוי״ה spellings have their fixed traditional values', () => {
  assert.deepEqual(
    CANONICAL_HAVAYAH_MILUI.map(({ label, value, spelling }) => ({
      label,
      value,
      calculated: calcGematria(spelling),
    })),
    [
      { label: 'ע״ב', value: 72, calculated: 72 },
      { label: 'ס״ג', value: 63, calculated: 63 },
      { label: 'מ״ה', value: 45, calculated: 45 },
      { label: 'ב״ן', value: 52, calculated: 52 },
    ]
  );
});

test('canonical presets stay independent from editable מילוי רגיל mappings', () => {
  const custom = cloneMiluiMapping(MILUI_DEFAULT_MAPPING);
  custom.ו = 'ויו';
  const ordinaryDefault = calculateMilui('יהוה', MILUI_DEFAULT_MAPPING);
  const ordinaryCustom = calculateMilui('יהוה', custom);

  assert.notEqual(ordinaryCustom.fullGematria, ordinaryDefault.fullGematria);
  assert.deepEqual(
    CANONICAL_HAVAYAH_MILUI.map(({ value }) => value),
    [72, 63, 45, 52]
  );
});

test('standalone שם הוי״ה detection is mark-tolerant and token-safe', () => {
  const matches = [
    'יהוה',
    'יְהֹוָה',
    'ברוך אתה יהוה',
    'י־ה־ו־ה',
    'י-ה-ו-ה',
    'י.ה.ו.ה',
    'י,ה,ו,ה',
    'י״ה״ו״ה',
    'אל־יהוה',
    'יהוה יהוה',
  ];
  const misses = [
    '',
    'שלום',
    'אביהוה',
    'יהוהא',
    'אביהוהגד',
    'י ה ו ה',
  ];

  for (const value of matches) {
    assert.equal(containsStandaloneHavayah(value), true, value);
  }
  for (const value of misses) {
    assert.equal(containsStandaloneHavayah(value), false, value);
  }
});