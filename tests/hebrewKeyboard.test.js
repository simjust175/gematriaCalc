import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ISRAELI_HEBREW_KEYBOARD,
  applyAutomaticHebrewInput,
  getMappedHebrewCharacter,
  insertAtSelection,
} from '../src/utils/hebrewKeyboard.js';

function keyboardEvent(overrides = {}) {
  return {
    code: 'KeyT',
    key: 't',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...overrides,
  };
}

test('standard Israeli mapping includes every normal Hebrew and final letter position', () => {
  assert.deepEqual(ISRAELI_HEBREW_KEYBOARD, {
    KeyQ: '/', KeyW: '\'', KeyE: 'ק', KeyR: 'ר', KeyT: 'א', KeyY: 'ט', KeyU: 'ו', KeyI: 'ן', KeyO: 'ם', KeyP: 'פ',
    BracketLeft: ']', BracketRight: '[',
    KeyA: 'ש', KeyS: 'ד', KeyD: 'ג', KeyF: 'כ', KeyG: 'ע', KeyH: 'י', KeyJ: 'ח', KeyK: 'ל', KeyL: 'ך', Semicolon: 'ף', Quote: ',',
    KeyZ: 'ז', KeyX: 'ס', KeyC: 'ב', KeyV: 'ה', KeyB: 'נ', KeyN: 'מ', KeyM: 'צ', Comma: 'ת', Period: 'ץ', Slash: '.',
  });
});

test('physical English letter and Hebrew punctuation positions map to Hebrew', () => {
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyT', key: 't' })), 'א');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyI', key: 'i' })), 'ן');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyL', key: 'l' })), 'ך');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Semicolon', key: ';' })), 'ף');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Comma', key: ',' })), 'ת');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Period', key: '.' })), 'ץ');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Slash', key: '/' })), '.');
});

test('shifted letter keys retain their Hebrew mapping', () => {
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyT', key: 'T', shiftKey: true })), 'א');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyL', key: 'L', shiftKey: true })), 'ך');
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Semicolon', key: ':', shiftKey: true })), null);
});

test('normal editing, Hebrew input, composition, shortcuts, and unidentified virtual keys remain native', () => {
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Space', key: ' ' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Digit1', key: '1' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Backspace', key: 'Backspace' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Delete', key: 'Delete' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Enter', key: 'Enter' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'ArrowLeft', key: 'ArrowLeft' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Home', key: 'Home' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'End', key: 'End' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'KeyT', key: 'א' })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ isComposing: true })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ ctrlKey: true })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ metaKey: true })), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent(), { enabled: false }), null);
  assert.equal(getMappedHebrewCharacter(keyboardEvent({ code: 'Unidentified', key: 'j' })), null);
});

test('mapped input inserts at a caret and replaces the selected range', () => {
  assert.deepEqual(insertAtSelection('שלום', 2, 2, 'כ'), {
    value: 'שלכום', selectionStart: 3, selectionEnd: 3,
  });
  assert.deepEqual(insertAtSelection('שלום', 1, 3, 'א'), {
    value: 'שאם', selectionStart: 2, selectionEnd: 2,
  });
});

test('shared DOM fallback replaces selection, restores caret, and emits one input event', () => {
  const previousDocument = globalThis.document;
  const previousInputEvent = globalThis.InputEvent;
  let prevented = false;
  let emitted = null;
  const input = {
    value: 'שלום',
    selectionStart: 1,
    selectionEnd: 3,
    setRangeText(text, start, end) {
      this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    dispatchEvent(event) {
      emitted = event;
    },
  };

  try {
    globalThis.document = { execCommand: () => false };
    globalThis.InputEvent = class {
      constructor(type, init) {
        this.type = type;
        Object.assign(this, init);
      }
    };
    const consumed = applyAutomaticHebrewInput({
      ...keyboardEvent({ code: 'KeyT', key: 't' }),
      currentTarget: input,
      preventDefault() { prevented = true; },
    });

    assert.equal(consumed, true);
    assert.equal(prevented, true);
    assert.equal(input.value, 'שאם');
    assert.deepEqual([input.selectionStart, input.selectionEnd], [2, 2]);
    assert.equal(emitted.type, 'input');
    assert.equal(emitted.inputType, 'insertText');
    assert.equal(emitted.data, 'א');
    assert.equal(emitted.bubbles, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.InputEvent = previousInputEvent;
  }
});