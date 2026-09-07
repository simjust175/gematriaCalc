import { ref, watch } from 'vue';
import { applyAutomaticHebrewInput } from '@/utils/hebrewKeyboard.js';

export const AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE = 'gimatria.automatic-hebrew-keyboard';

function readPreference() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE) !== 'false';
  } catch {
    return true;
  }
}

const automaticHebrewKeyboard = ref(readPreference());

watch(automaticHebrewKeyboard, enabled => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE, String(enabled));
  } catch {
    // Text entry remains usable when browser storage is unavailable.
  }
});

export function useAutomaticHebrewKeyboard() {
  function onHebrewKeydown(event) {
    applyAutomaticHebrewInput(event, {
      enabled: automaticHebrewKeyboard.value,
    });
  }

  return {
    automaticHebrewKeyboard,
    onHebrewKeydown,
  };
}