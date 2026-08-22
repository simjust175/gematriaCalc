/**
 * Standard Israeli Hebrew keyboard layout (SI-1452).
 * Keys are identified by their physical KeyboardEvent.code values, not by
 * transliterated character names.
 */
export const ISRAELI_HEBREW_KEYBOARD = Object.freeze({
  KeyQ: '/',
  KeyW: '\'',
  KeyE: 'ק',
  KeyR: 'ר',
  KeyT: 'א',
  KeyY: 'ט',
  KeyU: 'ו',
  KeyI: 'ן',
  KeyO: 'ם',
  KeyP: 'פ',
  BracketLeft: ']',
  BracketRight: '[',
  KeyA: 'ש',
  KeyS: 'ד',
  KeyD: 'ג',
  KeyF: 'כ',
  KeyG: 'ע',
  KeyH: 'י',
  KeyJ: 'ח',
  KeyK: 'ל',
  KeyL: 'ך',
  Semicolon: 'ף',
  Quote: ',',
  KeyZ: 'ז',
  KeyX: 'ס',
  KeyC: 'ב',
  KeyV: 'ה',
  KeyB: 'נ',
  KeyN: 'מ',
  KeyM: 'צ',
  Comma: 'ת',
  Period: 'ץ',
  Slash: '.',
});

const US_PUNCTUATION_BY_CODE = Object.freeze({
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
});

const HEBREW_CHARACTER = /[\u0590-\u05FF]/u;

/**
 * Gets the character for an eligible physical English-keyboard event.
 * Returns null for native editing, shortcuts, composition, Hebrew input,
 * non-English physical character values, and virtual/unreliable keyboards.
 */
export function getMappedHebrewCharacter(event, {
  enabled = true,
} = {}) {
  if (
    !enabled
    || event.isComposing
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || !event.code
    || event.code === 'Unidentified'
    || HEBREW_CHARACTER.test(event.key || '')
  ) {
    return null;
  }

  const mappedCharacter = ISRAELI_HEBREW_KEYBOARD[event.code];
  if (!mappedCharacter) return null;

  if (event.code.startsWith('Key')) {
    return /^[a-z]$/i.test(event.key || '') ? mappedCharacter : null;
  }

  // Shifted punctuation is intentionally left to the browser. The unshifted
  // positions below are the ones that carry letters/final letters in SI-1452.
  if (event.shiftKey) return null;
  return US_PUNCTUATION_BY_CODE[event.code] === event.key ? mappedCharacter : null;
}

/** Return a value and caret placement for replacing a textarea selection. */
export function insertAtSelection(value, selectionStart, selectionEnd, text) {
  const start = Math.max(0, Math.min(Number(selectionStart) || 0, value.length));
  const end = Math.max(start, Math.min(Number(selectionEnd) || start, value.length));
  const nextValue = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const caret = start + text.length;
  return { value: nextValue, selectionStart: caret, selectionEnd: caret };
}
