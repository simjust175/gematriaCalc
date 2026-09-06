import {
  LETTER_VALUES,
  normalize,
  calcGematria,
  toHebrewNumber,
} from '../composables/useGematria.js';

export const MILUI_PRESET_NAME = 'מילוי רגיל';

export const CANONICAL_HAVAYAH_MILUI = Object.freeze([
  Object.freeze({
    id: 'av',
    label: 'ע״ב',
    value: 72,
    spelling: 'יו״ד ה״י וי״ו ה״י',
  }),
  Object.freeze({
    id: 'sag',
    label: 'ס״ג',
    value: 63,
    spelling: 'יו״ד ה״י וא״ו ה״י',
  }),
  Object.freeze({
    id: 'mah',
    label: 'מ״ה',
    value: 45,
    spelling: 'יו״ד ה״א וא״ו ה״א',
  }),
  Object.freeze({
    id: 'ban',
    label: 'ב״ן',
    value: 52,
    spelling: 'יו״ד ה״ה ו״ו ה״ה',
  }),
]);

const HEBREW_MARKS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
const HEBREW_QUOTES = /['"\u05F3\u05F4]/g;
const HAVAYAH_TOKEN = /(^|[^\u05D0-\u05EA])י[^\u05D0-\u05EA\s]*ה[^\u05D0-\u05EA\s]*ו[^\u05D0-\u05EA\s]*ה(?=$|[^\u05D0-\u05EA])/;

export function containsStandaloneHavayah(text) {
  const unmarked = String(text || '')
    .replace(HEBREW_MARKS, '')
    .replace(HEBREW_QUOTES, '');
  return HAVAYAH_TOKEN.test(unmarked);
}

export const MILUI_BASE_LETTERS = Object.freeze([
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
]);

export const MILUI_FINAL_TO_BASE = Object.freeze({
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
});

export const MILUI_DEFAULT_MAPPING = Object.freeze({
  א: 'אלף',
  ב: 'בית',
  ג: 'גימל',
  ד: 'דלת',
  ה: 'הא',
  ו: 'ואו',
  ז: 'זין',
  ח: 'חית',
  ט: 'טית',
  י: 'יוד',
  כ: 'כף',
  ל: 'למד',
  מ: 'מם',
  נ: 'נון',
  ס: 'סמך',
  ע: 'עין',
  פ: 'פא',
  צ: 'צדי',
  ק: 'קוף',
  ר: 'ריש',
  ש: 'שין',
  ת: 'תו',
});

function baseLetter(letter) {
  return MILUI_FINAL_TO_BASE[letter] || letter;
}

export function cloneMiluiMapping(mapping = MILUI_DEFAULT_MAPPING) {
  return Object.fromEntries(
    MILUI_BASE_LETTERS.map(letter => [letter, mapping[letter] ?? MILUI_DEFAULT_MAPPING[letter]])
  );
}

export function normalizeMiluiMapping(mapping) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    return { valid: false, error: 'יש להזין טבלת מילוי תקינה' };
  }

  const keys = Object.keys(mapping);
  if (
    keys.length !== MILUI_BASE_LETTERS.length
    || keys.some(letter => !MILUI_BASE_LETTERS.includes(letter))
    || MILUI_BASE_LETTERS.some(letter => !Object.hasOwn(mapping, letter))
  ) {
    return { valid: false, error: 'טבלת המילוי חייבת לכלול את 22 האותיות א–ת בלבד' };
  }

  const normalized = {};
  for (const letter of MILUI_BASE_LETTERS) {
    const rawValue = typeof mapping[letter] === 'string' ? mapping[letter].trim() : '';
    const unpointedValue = rawValue.replace(/[\u0591-\u05C7]/g, '');
    if (unpointedValue && !/^[\u05D0-\u05EA]+$/.test(unpointedValue)) {
      return { valid: false, error: `המילוי של ${letter} חייב להכיל אותיות עבריות בלבד`, letter };
    }
    const value = normalize(rawValue).replace(/\s+/g, '');
    if (!value) {
      return { valid: false, error: `המילוי של ${letter} אינו יכול להיות ריק`, letter };
    }
    if (value[0] !== letter) {
      return { valid: false, error: `המילוי של ${letter} חייב להתחיל באות ${letter}`, letter };
    }
    normalized[letter] = value;
  }

  return { valid: true, mapping: normalized };
}

export function isDefaultMiluiMapping(mapping) {
  return MILUI_BASE_LETTERS.every(letter => mapping?.[letter] === MILUI_DEFAULT_MAPPING[letter]);
}

function getLetterDetail(letter, mapping) {
  const base = baseLetter(letter);
  const spelling = mapping[base];
  const fillingOnly = spelling.slice(1);
  return {
    letter,
    baseLetter: base,
    spelling,
    fullValue: calcGematria(spelling),
    fillingOnly,
    fillingOnlyValue: calcGematria(fillingOnly),
  };
}

function getWordResult(word, mapping, position) {
  const letters = [...word].map(letter => getLetterDetail(letter, mapping));
  const expandedText = letters.map(detail => detail.spelling).join(' ');
  const fullGematria = letters.reduce((total, detail) => total + detail.fullValue, 0);
  const fillingOnlyGematria = letters.reduce((total, detail) => total + detail.fillingOnlyValue, 0);
  return {
    word,
    position,
    expandedText,
    fullGematria,
    fullHebrewNumber: toHebrewNumber(fullGematria),
    fillingOnly: letters.map(detail => detail.fillingOnly).join(' '),
    fillingOnlyGematria,
    fillingOnlyHebrewNumber: toHebrewNumber(fillingOnlyGematria),
    letters,
  };
}

export function calculateMilui(text, mapping = MILUI_DEFAULT_MAPPING) {
  const normalizedMapping = normalizeMiluiMapping(mapping);
  if (!normalizedMapping.valid) {
    throw new Error(normalizedMapping.error);
  }

  const normalizedText = normalize(text || '');
  if (!normalizedText) return null;

  const words = normalizedText
    .split(/\s+/)
    .filter(Boolean)
    .map((word, position) => getWordResult(word, normalizedMapping.mapping, position));
  const fullGematria = words.reduce((total, word) => total + word.fullGematria, 0);
  const fillingOnlyGematria = words.reduce((total, word) => total + word.fillingOnlyGematria, 0);

  return {
    normalizedText,
    expandedText: words.map(word => word.expandedText).join(' '),
    fullGematria,
    fullHebrewNumber: toHebrewNumber(fullGematria),
    fillingOnlyGematria,
    fillingOnlyHebrewNumber: toHebrewNumber(fillingOnlyGematria),
    words,
  };
}