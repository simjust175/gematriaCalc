<template>
  <div class="milui-overlay" role="presentation" @click.self="emit('close')">
    <section
      class="milui-dialog"
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="milui-settings-title"
      aria-describedby="milui-settings-description"
      dir="rtl"
      tabindex="-1"
    >
      <div class="milui-dialog__header">
        <div>
          <div class="milui-dialog__eyebrow">מילוי</div>
          <h2 id="milui-settings-title">הגדרות מילוי</h2>
          <p id="milui-settings-description">התאם את אופן כתיבת שמות האותיות.</p>
        </div>
        <button class="milui-close" type="button" aria-label="סגור הגדרות מילוי" @click="emit('close')">
          <span class="mdi mdi-close" aria-hidden="true"></span>
        </button>
      </div>

      <div class="milui-dialog__body">
        <div class="milui-preset-note">הטבלה הנוכחית: <strong>מילוי רגיל</strong></div>
        <div class="milui-table" role="list" aria-label="טבלת מילוי">
          <div v-for="letter in MILUI_BASE_LETTERS" :key="letter" class="milui-row" role="listitem">
            <label :for="`milui-${letter}`" class="milui-row__letter">{{ letter }}</label>
            <input
              :id="`milui-${letter}`"
              v-model="draft[letter]"
              class="milui-row__input"
              type="text"
              dir="rtl"
              autocomplete="off"
              spellcheck="false"
              @keydown="onHebrewKeydown"
              :aria-invalid="fieldError?.letter === letter ? 'true' : 'false'"
              :aria-describedby="fieldError?.letter === letter ? `milui-error-${letter}` : undefined"
            />
            <span v-if="fieldError?.letter === letter" :id="`milui-error-${letter}`" class="milui-row__error">
              {{ fieldError.error }}
            </span>
          </div>
        </div>
        <p v-if="formError" class="milui-form-error" role="alert">{{ formError }}</p>
        <p v-if="success" class="milui-form-success" role="status">{{ success }}</p>
      </div>

      <div class="milui-dialog__footer">
        <button class="milui-reset" type="button" :disabled="saving" @click="resetToDefault">
          החזר לברירת מחדל
        </button>
        <div class="milui-footer-actions">
          <button class="milui-cancel" type="button" :disabled="saving" @click="emit('close')">ביטול</button>
          <button class="milui-save" type="button" :disabled="saving" @click="save">
            <span v-if="saving" class="mdi mdi-loading mdi-spin" aria-hidden="true"></span>
            שמור שינויים
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  MILUI_BASE_LETTERS,
  MILUI_DEFAULT_MAPPING,
  cloneMiluiMapping,
  isDefaultMiluiMapping,
  normalizeMiluiMapping,
} from '@/utils/milui.js';
import { useAutomaticHebrewKeyboard } from '@/composables/useAutomaticHebrewKeyboard.js';

const props = defineProps({
  mapping: { type: Object, required: true },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' },
  success: { type: String, default: '' },
});

const emit = defineEmits(['close', 'save']);
const { onHebrewKeydown } = useAutomaticHebrewKeyboard();
const draft = ref(cloneMiluiMapping(props.mapping));
const formError = ref('');
const fieldError = ref(null);
const dialogRef = ref(null);
let previouslyFocused = null;

watch(() => props.mapping, value => {
  draft.value = cloneMiluiMapping(value);
}, { deep: true });

watch(() => props.error, value => {
  formError.value = value || '';
}, { immediate: true });

const customized = computed(() => !isDefaultMiluiMapping(draft.value));

function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key !== 'Tab' || !dialogRef.value) return;
  const focusable = [...dialogRef.value.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement;
  document.addEventListener('keydown', onDialogKeydown);
  await nextTick();
  dialogRef.value?.querySelector('button:not(:disabled), input:not(:disabled)')?.focus();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDialogKeydown);
  previouslyFocused?.focus?.();
});

function save() {
  formError.value = '';
  fieldError.value = null;
  const checked = normalizeMiluiMapping(draft.value);
  if (!checked.valid) {
    fieldError.value = checked.letter ? { letter: checked.letter, error: checked.error } : null;
    formError.value = checked.letter ? '' : checked.error;
    return;
  }
  emit('save', checked.mapping);
}

function resetToDefault() {
  if (customized.value && !window.confirm('להחזיר את טבלת המילוי לברירת המחדל?')) return;
  formError.value = '';
  fieldError.value = null;
  emit('save', cloneMiluiMapping(MILUI_DEFAULT_MAPPING));
}
</script>

<style scoped>
.milui-overlay {
  align-items: center;
  background: rgba(21, 32, 56, .34);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 20;
}

.milui-dialog {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 14px 46px rgba(26, 39, 68, .2);
  display: flex;
  flex-direction: column;
  max-height: min(760px, calc(100vh - 40px));
  max-width: 620px;
  overflow: hidden;
  width: 100%;
}

.milui-dialog__header {
  align-items: flex-start;
  border-bottom: 1px solid var(--border);
  display: flex;
  gap: 18px;
  justify-content: space-between;
  padding: 22px 24px 17px;
}

.milui-dialog__eyebrow {
  color: var(--gold);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .08em;
}

.milui-dialog h2 {
  color: var(--navy);
  font-size: 1.35rem;
  margin: 4px 0 2px;
}

.milui-dialog p {
  color: var(--text-secondary);
  font-size: .82rem;
}

.milui-close {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1.15rem;
  padding: 3px;
}

.milui-close:hover {
  color: var(--navy);
}

.milui-dialog__body {
  min-height: 0;
  overflow: auto;
  padding: 15px 24px 22px;
}

.milui-preset-note {
  color: var(--text-secondary);
  font-size: .76rem;
  margin-bottom: 10px;
  text-align: right;
}

.milui-preset-note strong {
  color: var(--navy);
}

.milui-table {
  display: grid;
  gap: 7px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.milui-row {
  align-items: center;
  display: grid;
  gap: 9px;
  grid-template-columns: 26px minmax(0, 1fr);
  min-width: 0;
  position: relative;
}

.milui-row__letter {
  color: var(--navy);
  font-size: 1.05rem;
  font-weight: 700;
  text-align: center;
}

.milui-row__input {
  background: #fdfbf7;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--navy);
  font: 600 .98rem "Noto Serif Hebrew", "Times New Roman", serif;
  min-width: 0;
  outline: none;
  padding: 8px 10px;
  width: 100%;
}

.milui-row__input:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 2px rgba(192, 152, 64, .12);
}

.milui-row__error,
.milui-form-error {
  color: #c62828;
  font-size: .72rem;
}

.milui-row__error {
  grid-column: 1 / -1;
  margin-top: -3px;
}

.milui-form-error {
  margin-top: 12px;
}

.milui-form-success {
  color: var(--gold);
  font-size: .76rem;
  font-weight: 600;
  margin-top: 12px;
}

.milui-dialog__footer {
  align-items: center;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 14px 24px;
}

.milui-footer-actions {
  display: flex;
  gap: 8px;
}

.milui-reset,
.milui-cancel,
.milui-save {
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  font-size: .82rem;
  font-weight: 600;
  padding: 8px 13px;
}

.milui-reset,
.milui-cancel {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

.milui-reset:hover:not(:disabled),
.milui-cancel:hover:not(:disabled) {
  border-color: var(--gold);
  color: var(--navy);
}

.milui-save {
  background: var(--gold);
  border: 1px solid var(--gold);
  color: #fff;
}

.milui-save:hover:not(:disabled) {
  background: #a07c2e;
  border-color: #a07c2e;
}

.milui-reset:disabled,
.milui-cancel:disabled,
.milui-save:disabled {
  cursor: default;
  opacity: .55;
}

@media (max-width: 560px) {
  .milui-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .milui-dialog {
    border-radius: 16px 16px 0 0;
    max-height: 92vh;
  }

  .milui-table {
    grid-template-columns: 1fr;
  }

  .milui-dialog__header,
  .milui-dialog__body,
  .milui-dialog__footer {
    padding-inline: 17px;
  }

  .milui-dialog__footer {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .milui-footer-actions {
    justify-content: flex-end;
  }
}
</style>