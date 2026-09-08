import { calcGematria, normalize } from '../src/composables/useGematria.js';

const FINAL_TO_STANDARD = Object.freeze({
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
});

export function normalizeDerivedLetters(value, kind) {
  const letters = [...normalize(String(value || '')).replace(/\s+/g, '')];
  return kind === 'finals'
    ? letters.map(letter => FINAL_TO_STANDARD[letter] || letter).join('')
    : letters.join('');
}

export function createDerivedLetterProfile(value, kind) {
  const normalized = normalizeDerivedLetters(value, kind);
  const counts = new Map();
  for (const letter of normalized) {
    counts.set(letter, (counts.get(letter) || 0) + 1);
  }
  return {
    normalized,
    length: normalized.length,
    gematria: calcGematria(normalized),
    counts,
  };
}

export function derivedLetterProfilesMatch(left, right) {
  if (!left.normalized || left.length !== right.length || left.counts.size !== right.counts.size) {
    return false;
  }
  for (const [letter, count] of left.counts) {
    if (right.counts.get(letter) !== count) return false;
  }
  return true;
}

export function matchesAnyDerivedLetterProfile(value, profiles, kind) {
  const candidate = createDerivedLetterProfile(value, kind);
  return profiles.some(profile => derivedLetterProfilesMatch(profile, candidate));
}