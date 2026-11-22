import { toHebrewNumber } from '../composables/useGematria.js';

// Presentation only: canonical coordinates and calculation rules stay unchanged.
export function formatHebrewNumeral(value) {
  const letters = toHebrewNumber(Number(value));
  if (!letters || letters === '—') return String(value ?? '');
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

export function formatHebrewReference(book, chapter, verse) {
  return `${book} ${formatHebrewNumeral(chapter)}:${formatHebrewNumeral(verse)}`;
}
