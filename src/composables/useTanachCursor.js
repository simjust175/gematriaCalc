import { LETTER_VALUES } from './useGematria.js';

const HEBREW_LETTER = /[\u05D0-\u05EA]/;

/**
 * Creates a Unicode-preserving, letter-addressable model of a verse.
 * Indices exposed by this module always refer to countable Hebrew letters,
 * never UTF-16 offsets, so cursor navigation safely skips vowels and accents.
 */
export function createTanachCursor(displayText = '') {
  const characters = [...displayText];
  const letters = [];
  const characterToLetter = new Map();
  const tokens = [];
  const prefixes = [0];
  let wordIndex = 0;
  let inWord = false;

  characters.forEach((character, displayIndex) => {
    if (HEBREW_LETTER.test(character)) {
      letters.push({
        character,
        value: LETTER_VALUES[character] || 0,
        displayIndex,
        wordIndex,
      });
      characterToLetter.set(displayIndex, letters.length - 1);
      tokens.push({ text: character, letterIndex: letters.length - 1 });
      prefixes.push(prefixes[prefixes.length - 1] + (LETTER_VALUES[character] || 0));
      inWord = true;
    } else if (/[\u0591-\u05C7]/.test(character) && tokens.at(-1)?.letterIndex != null) {
      tokens[tokens.length - 1].text += character;
    } else if (inWord && /\s/.test(character)) {
      tokens.push({ text: character, letterIndex: null });
      wordIndex += 1;
      inWord = false;
    } else {
      tokens.push({ text: character, letterIndex: null });
    }
  });
  let previousLetterIndex = null;
  for (const token of tokens) {
    token.previousLetterIndex = previousLetterIndex;
    if (token.letterIndex != null) previousLetterIndex = token.letterIndex;
  }
  let nextLetterIndex = null;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    token.nextLetterIndex = nextLetterIndex;
    if (token.letterIndex != null) nextLetterIndex = token.letterIndex;
  }

  return {
    displayText,
    letters,
    tokens,
    count: letters.length,
    prefixes,
    characterToLetter,
    clamp(index) {
      return Math.max(0, Math.min(Number(index) || 0, Math.max(0, letters.length - 1)));
    },
    range(start, end) {
      if (!letters.length) return { start: 0, end: 0, text: '', gematria: 0, letters: [] };
      const first = Math.min(this.clamp(start), this.clamp(end));
      const last = Math.max(this.clamp(start), this.clamp(end));
      const selected = letters.slice(first, last + 1);
      const firstDisplay = selected[0].displayIndex;
      const lastDisplay = selected[selected.length - 1].displayIndex;
      return {
        start: first,
        end: last,
        text: characters.slice(firstDisplay, lastDisplay + 1).join(''),
        gematria: prefixes[last + 1] - prefixes[first],
        letters: selected,
      };
    },
    letterAtDisplayIndex(displayIndex) {
      return characterToLetter.get(displayIndex) ?? null;
    },
  };
}

export function tanachRangeText(displayText, start, end) {
  return createTanachCursor(displayText).range(start, end).text;
}

export function normalizeTanachSelection(anchor, focus) {
  return {
    start: Math.min(anchor, focus),
    end: Math.max(anchor, focus),
  };
}