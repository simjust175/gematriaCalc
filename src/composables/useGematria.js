/**
 * Gematria calculation engine — pure JS, no framework dependencies.
 * Standard values: final letters use their standard (non-enlarged) values.
 */

export const LETTER_VALUES = {
  א: 1,  ב: 2,  ג: 3,  ד: 4,  ה: 5,  ו: 6,  ז: 7,  ח: 8,  ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

// Values from 20 upward are composed greedily; 15 and 16 are handled only
// when they are the final remainder so they cannot become reusable chunks.
const HEBREW_NUMBER_MAP = [
  [400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'],
  [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'],
  [40, 'מ'], [30, 'ל'], [20, 'כ'],
  [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'],
  [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א'],
];

/**
 * Strip niqqud (U+05B0–U+05C7), cantillation (U+0591–U+05AF), punctuation,
 * and every non-Hebrew character. Preserves spaces for word splitting.
 */
export function normalize(text) {
  return text
    .replace(/[\u0591-\u05C7]/g, '')       // niqqud + cantillation
    .replace(/[^\u05D0-\u05EA\s]/g, '')    // keep Hebrew letters + spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sum gematria of a string; spaces and unknown chars contribute 0. */
export function calcGematria(text) {
  let total = 0;
  for (const char of text) total += LETTER_VALUES[char] || 0;
  return total;
}

/**
 * Convert positive integer to Hebrew letter representation.
 * Examples: 21→כא, 310→שי, 951→תתקנא
 */
export function toHebrewNumber(n) {
  if (!n || n <= 0) return '';
  let result = '';
  let rem = n;
  for (const [val, letters] of HEBREW_NUMBER_MAP) {
    if (val < 20) break;
    while (rem >= val) { result += letters; rem -= val; }
    if (rem === 0) break;
  }
  // Avoid the divine-name spellings יה and יו only for the final 15/16.
  // They must not be treated as general chunks: 17 is יז, not טזא.
  if (rem === 15) return result + 'טו';
  if (rem === 16) return result + 'טז';
  for (const [val, letters] of HEBREW_NUMBER_MAP) {
    if (val >= 20) continue;
    while (rem >= val) { result += letters; rem -= val; }
    if (rem === 0) break;
  }
  return result;
}

/** First Hebrew letter of each whitespace-separated word. */
export function getInitials(text) {
  const norm = normalize(text);
  return norm
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('');
}

/** Per-word breakdown with per-letter detail. */
export function getWordBreakdown(text) {
  const norm = normalize(text);
  return norm
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const gematria = calcGematria(word);
      const letters = [...word]
        .filter(c => LETTER_VALUES[c])
        .map(c => ({ letter: c, value: LETTER_VALUES[c] }));
      return { word, gematria, hebrewNumber: toHebrewNumber(gematria), letters, position: i };
    });
}

/** Compute the full result object for any input string. Returns null if empty/zero. */
export function computeAll(text) {
  if (!text || !text.trim()) return null;
  const norm = normalize(text);
  if (!norm) return null;

  const fullGematria = calcGematria(norm);
  if (fullGematria === 0) return null;

  const initials = getInitials(norm);
  const initialsGematria = calcGematria(initials);
  const words = getWordBreakdown(norm);

  return {
    normalizedText: norm,
    fullGematria,
    fullHebrewNumber: toHebrewNumber(fullGematria),
    initials,
    initialsGematria,
    initialsHebrewNumber: toHebrewNumber(initialsGematria),
    words,
  };
}
