import test from 'node:test';
import assert from 'node:assert/strict';
import { calcGematria } from '../src/composables/useGematria.js';
import {
  CANONICAL_HAVAYAH_MILUI,
  MILUI_DEFAULT_MAPPING,
  MILUI_VARIANT_REGISTRY,
  calculateMiluiVariant,
  calculateMilui,
  cloneMiluiMapping,
  containsStandaloneHavayah,
  getCommonMiluiForms,
  getMiluiVariantOccurrences,
} from '../src/utils/milui.js';

test('canonical מילויי הוי״ה spellings have their fixed traditional values', () => {
  assert.deepEqual(
    CANONICAL_HAVAYAH_MILUI.map(({ label, value, spelling }) => ({
      label,
      value,
      calculated: calcGematria(spelling),
    })),
    [
      { label: 'מילוי יודי״ן', value: 72, calculated: 72 },
      { label: 'מילוי יודי״ן־אל״ף', value: 63, calculated: 63 },
      { label: 'מילוי אלפי״ן', value: 45, calculated: 45 },
      { label: 'מילוי ההי״ן', value: 52, calculated: 52 },
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

test('variant registry contains only the confirmed ה and ו spellings', () => {
  assert.deepEqual(MILUI_VARIANT_REGISTRY, {
    ה: ['הא', 'הי', 'הה'],
    ו: ['וו', 'ואו', 'ויו'],
  });
  assert.equal(getMiluiVariantOccurrences('אב', MILUI_DEFAULT_MAPPING).length, 0);
  assert.deepEqual(
    getMiluiVariantOccurrences('הו', MILUI_DEFAULT_MAPPING).map(item => item.defaultSpelling),
    ['הא', 'ואו']
  );
});

test('repeated ambiguous letters retain independent occurrence-level choices', () => {
  const occurrences = getMiluiVariantOccurrences('ההו', MILUI_DEFAULT_MAPPING);
  const selections = occurrences.map((occurrence, index) => ({
    ...occurrence,
    selectedSpelling: ['הי', 'הה', 'וו'][index],
  }));
  const calculation = calculateMiluiVariant('ההו', MILUI_DEFAULT_MAPPING, selections);

  assert.deepEqual(
    calculation.selections.map(item => [item.sourceIndex, item.letter, item.selectedSpelling]),
    [[0, 'ה', 'הי'], [1, 'ה', 'הה'], [2, 'ו', 'וו']]
  );
  assert.equal(calculation.expandedText, 'הי הה וו');
  assert.equal(calculation.fullGematria, calcGematria('הי הה וו'));
  assert.equal(calculation.words.length, 1);
});

test('common forms keep one primary result and three traditional companion forms', () => {
  const forms = getCommonMiluiForms('יהוה', MILUI_DEFAULT_MAPPING);
  assert.deepEqual(forms.map(form => form.id), ['primary', 'av', 'sag', 'ban']);
  assert.deepEqual(
    forms.map(form => form.calculation.fullGematria),
    [45, 72, 63, 52]
  );
  assert.deepEqual(
    forms.slice(1).map(form => form.calculation.expandedText),
    ['יוד הי ויו הי', 'יוד הי ואו הי', 'יוד הה וו הה']
  );
});