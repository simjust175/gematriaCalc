<template>
  <div class="calculator-root">
    <!-- Two-column layout: calculator | match panel -->
    <div class="calc-layout">

      <!-- ── LEFT / MAIN: Calculator ─────────────────────────── -->
      <div class="calc-col">

        <!-- Input card -->
        <div class="input-card" :class="{ 'input-card--filled': hasInput }">
          <textarea
            v-model="inputText"
            class="heb-input"
            :class="{ 'heb-input--active': hasInput }"
            placeholder="הקלד מילה או משפט..."
            ref="textareaRef"
            dir="rtl"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            @input="resizeTextarea"
            @keydown="onCalculatorKeydown"
          ></textarea>
          <label
            class="keyboard-toggle"
            title="מאפשר להקליד עברית גם כשהמקלדת במצב אנגלית"
          >
            <input v-model="automaticHebrewKeyboard" type="checkbox">
            <span class="keyboard-toggle__track" aria-hidden="true"></span>
            <span>מקלדת עברית אוטומטית</span>
          </label>
          <button
            v-if="inputText"
            class="clear-input-btn"
            @click="inputText = ''"
            title="נקה"
          >
            <span class="mdi mdi-close-circle"></span>
          </button>
        </div>

        <!-- Results — only when there's valid input -->
        <transition name="results-fade">
          <div v-if="hasInput" class="results-area">

            <!-- ── UNIFIED CALCULATION SUMMARY ─────────────── -->
            <div class="result-panel">
              <div class="result-panel-toolbar">
                <div class="save-row">
                  <SaveSplitButton
                    :primary-label="matches.isAlreadySaved ? 'כבר שמור' : saveStatus === 'saved' ? 'נשמר' : 'שמור'"
                    :disabled="saveStatus === 'loading' || matches.isAlreadySaved"
                    @primary="saveEntry"
                    @base-word="saveAsBaseWord"
                  />
                  <span v-if="baseWordFeedback" class="save-error">{{ baseWordFeedback }}</span>
                  <span v-if="saveError" class="save-error">{{ saveError }}</span>
                </div>
              </div>

              <div class="result-grid">
                <div class="result-section">
                  <div class="primary-result-content">
                    <div class="result-label">גימטריה מלאה</div>
                    <div class="result-value-row">
                      <span class="result-num primary-num">{{ result.fullGematria }}</span>
                      <span class="result-divider">·</span>
                      <span class="result-heb primary-heb">{{ result.fullHebrewNumber }}</span>
                    </div>
                  </div>
                </div>
                <div class="result-section">
                  <div class="result-label">ראשי תיבות</div>
                  <div class="roshei-letters">{{ result.initials }}</div>
                </div>
                <div class="result-section">
                  <div class="result-label">גימטריית ר"ת</div>
                  <div class="result-value-row roshei-value">
                    <span class="result-num secondary-num">{{ result.initialsGematria }}</span>
                    <span class="result-divider">·</span>
                    <span class="result-heb secondary-heb">{{ result.initialsHebrewNumber }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="advanced-tools">
              <div class="milui-disclosure">
                <button
                  class="milui-toggle"
                  type="button"
                  :aria-expanded="miluiOpen"
                  aria-controls="milui-calculation"
                  @click="toggleMilui"
                >
                  <span class="advanced-toggle__copy">
                    <span class="advanced-toggle__label">מילוי</span>
                    <small class="advanced-toggle__subtitle">חישוב לפי שמות האותיות</small>
                  </span>
                  <span
                    class="milui-toggle__chevron ui-chevron"
                    :class="miluiOpen ? 'ui-chevron--up' : 'ui-chevron--down'"
                    aria-hidden="true"
                  ></span>
                </button>

                <MiluiPanel
                  v-if="miluiCalculation"
                  id="milui-calculation"
                  :calculation="miluiCalculation"
                  :settings-disabled="!miluiSettingsLoaded"
                  @open-settings="openMiluiSettings"
                />
                <p v-if="miluiOpen && miluiSettingsError && !miluiSettingsLoaded" class="milui-load-error" role="alert">
                  {{ miluiSettingsError }}
                  <button type="button" @click="loadMiluiSettings">נסה שוב</button>
                </p>
              </div>

              <BaseWordsDisclosure v-if="result" :value="result.fullGematria" />
            </div>

            <TanachGematriaMatches
              :target="result.fullGematria"
              @open="emit('openTanach', $event)"
            />

            <!-- ── WORD BREAKDOWN ─────────────────────────── -->
            <div class="breakdown-section" v-if="result.words.length > 1 || result.words[0]?.letters.length > 1">
              <div class="section-label">פירוט מילים</div>
              <div class="breakdown-list">
                <div
                  v-for="(word, wi) in result.words"
                  :key="wi"
                  class="word-row"
                >
                  <!-- Word header: clickable to expand letters -->
                  <div
                    class="word-header"
                    @click="toggleWord(wi)"
                    :class="{ 'word-header--expanded': expandedWords[wi] }"
                  >
                    <div class="word-info">
                      <span class="word-text">{{ word.word }}</span>
                      <span class="word-result">
                        <span class="word-num">{{ word.gematria }}</span>
                        <span class="word-dot">·</span>
                        <span class="word-heb">{{ word.hebrewNumber }}</span>
                      </span>
                    </div>
                    <span class="word-expand-icon ui-chevron" :class="expandedWords[wi] ? 'ui-chevron--up' : 'ui-chevron--down'" aria-hidden="true"></span>
                  </div>

                  <!-- Letter breakdown (collapsible) -->
                  <transition name="letters-slide">
                    <div v-if="expandedWords[wi]" class="letter-list">
                      <div
                        v-for="(letter, li) in word.letters"
                        :key="li"
                        class="letter-row"
                      >
                        <span class="letter-char">{{ letter.letter }}</span>
                        <span class="letter-dash">—</span>
                        <span class="letter-val">{{ letter.value }}</span>
                      </div>
                    </div>
                  </transition>
                </div>
              </div>
            </div>

          </div>
        </transition>

      </div>

      <!-- ── RIGHT: Match panel (desktop sidebar) ──────────── -->
      <aside class="match-col" v-if="hasInput">
        <MatchPanel
          :matches="matches.matches"
          :gematria="result?.fullGematria"
          :isAlreadySaved="matches.isAlreadySaved"
          :hasInput="hasInput"
          :error="matches.error"
        />
      </aside>
    </div>

    <!-- Mobile: match panel below calculator -->
    <div class="match-col-mobile" v-if="hasInput">
      <MatchPanel
        :matches="matches.matches"
        :gematria="result?.fullGematria"
        :isAlreadySaved="matches.isAlreadySaved"
        :hasInput="hasInput"
        :error="matches.error"
      />
    </div>

    <MiluiSettings
      v-if="miluiSettingsOpen"
      :mapping="miluiMapping"
      :saving="miluiSettingsSaving"
      :error="miluiSettingsError"
      @close="miluiSettingsOpen = false"
      @save="saveMiluiMapping"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { computeAll } from '@/composables/useGematria.js';
import { useLiveMatching } from '@/composables/useLiveMatching.js';
import BaseWordsDisclosure from './BaseWordsDisclosure.vue';
import SaveSplitButton from './SaveSplitButton.vue';
import { useBaseWords } from '@/composables/useBaseWords.js';
import {
  getMappedHebrewCharacter,
  insertAtSelection,
} from '@/utils/hebrewKeyboard.js';
import MatchPanel from './MatchPanel.vue';
import TanachGematriaMatches from './TanachGematriaMatches.vue';
import MiluiPanel from './MiluiPanel.vue';
import MiluiSettings from './MiluiSettings.vue';
import {
  MILUI_DEFAULT_MAPPING,
  calculateMilui,
  cloneMiluiMapping,
  normalizeMiluiMapping,
} from '@/utils/milui.js';

const emit = defineEmits(['openTanach']);

const AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE = 'gimatria.automatic-hebrew-keyboard';

function readAutomaticHebrewKeyboardPreference() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE) !== 'false';
  } catch {
    return true;
  }
}

const inputText   = ref('');
const textareaRef = ref(null);
const automaticHebrewKeyboard = ref(readAutomaticHebrewKeyboardPreference());
const expandedWords = ref({});
const saveStatus  = ref('idle');   // idle | loading | saved
const saveError   = ref('');
const miluiOpen = ref(false);
const miluiSettingsOpen = ref(false);
const miluiMapping = ref(cloneMiluiMapping(MILUI_DEFAULT_MAPPING));
const miluiSettingsLoaded = ref(false);
const miluiSettingsLoading = ref(false);
const miluiSettingsSaving = ref(false);
const miluiSettingsError = ref('');
const saveMenuOpen = ref(false);
const baseWordFeedback = ref('');

let saveResetTimer = null;

// ── Computed result ───────────────────────────────────────────────────────────
const result  = computed(() => computeAll(inputText.value));
const hasInput = computed(() => !!result.value);
const { matches } = useLiveMatching(result);
const miluiCalculation = computed(() => {
  if (!miluiOpen.value || !result.value) return null;
  return calculateMilui(inputText.value, miluiMapping.value);
});

// Reset expanded words when text changes; restore min-height when cleared
watch(inputText, (val) => {
  expandedWords.value = {};
  saveStatus.value = 'idle';
  saveError.value = '';
  if (!val) {
    miluiOpen.value = false;
    miluiSettingsOpen.value = false;
  }
  if (!val) {
    nextTick(() => {
      if (textareaRef.value) textareaRef.value.style.height = '';
    });
  }
});

async function toggleMilui() {
  miluiOpen.value = !miluiOpen.value;
  if (miluiOpen.value) await loadMiluiSettings();
}

async function loadMiluiSettings() {
  if (miluiSettingsLoaded.value || miluiSettingsLoading.value) return;
  miluiSettingsLoading.value = true;
  miluiSettingsError.value = '';
  try {
    const response = await fetch('/api/settings/milui');
    if (!response.ok) throw new Error('load_failed');
    const payload = await response.json();
    const checked = normalizeMiluiMapping(payload.mapping);
    if (!checked.valid) throw new Error('invalid_saved_mapping');
    miluiMapping.value = checked.mapping;
    miluiSettingsLoaded.value = true;
  } catch {
    miluiSettingsError.value = 'לא ניתן לטעון את הגדרות המילוי';
  } finally {
    miluiSettingsLoading.value = false;
  }
}

async function openMiluiSettings() {
  await loadMiluiSettings();
  if (miluiSettingsLoaded.value) miluiSettingsOpen.value = true;
}

async function saveMiluiMapping(mapping) {
  miluiSettingsSaving.value = true;
  miluiSettingsError.value = '';
  try {
    const response = await fetch('/api/settings/milui', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || 'save_failed');
    }
    const checked = normalizeMiluiMapping(payload.mapping);
    if (!checked.valid) throw new Error('invalid_saved_mapping');
    miluiMapping.value = checked.mapping;
    miluiSettingsLoaded.value = true;
  } catch (error) {
    miluiSettingsError.value = error.message === 'save_failed'
      ? 'לא ניתן לשמור את הגדרות המילוי'
      : error.message || 'לא ניתן לשמור את הגדרות המילוי';
  } finally {
    miluiSettingsSaving.value = false;
  }
}

watch(automaticHebrewKeyboard, (enabled) => {
  try {
    window.localStorage.setItem(AUTOMATIC_HEBREW_KEYBOARD_PREFERENCE, String(enabled));
  } catch {
    // The calculator remains usable when browser storage is unavailable.
  }
});

// Auto-resize textarea to fit content, starting at the compact input height
function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(84, el.scrollHeight) + 'px';
}

function restoreCaretAfterMappedInput(textarea, selectionStart, selectionEnd) {
  nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(selectionStart, selectionEnd);
    resizeTextarea();
  });
}

function onCalculatorKeydown(event) {
  const mappedCharacter = getMappedHebrewCharacter(event, {
    enabled: automaticHebrewKeyboard.value,
  });
  if (!mappedCharacter) return;

  event.preventDefault();
  const textarea = event.currentTarget;
  const valueBeforeInsertion = textarea.value;
  const selectionStartBeforeInsertion = textarea.selectionStart;
  const selectionEndBeforeInsertion = textarea.selectionEnd;

  // execCommand creates a native editable-text transaction, preserving the
  // browser's undo/redo stack and letting Vue's normal v-model input flow run.
  const nativeInsertionAccepted = typeof document !== 'undefined'
    && typeof document.execCommand === 'function'
    && document.execCommand('insertText', false, mappedCharacter);

  // Some embedded browsers report success from execCommand without changing a
  // textarea. Only trust it after observing the text or caret actually move.
  const insertedNatively = nativeInsertionAccepted && (
    textarea.value !== valueBeforeInsertion
    || textarea.selectionStart !== selectionStartBeforeInsertion
    || textarea.selectionEnd !== selectionEndBeforeInsertion
  );

  if (insertedNatively) {
    nextTick(() => {
      if (inputText.value !== textarea.value) inputText.value = textarea.value;
      resizeTextarea();
    });
    return;
  }

  const replacement = insertAtSelection(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    mappedCharacter
  );
  textarea.value = replacement.value;
  inputText.value = replacement.value;
  restoreCaretAfterMappedInput(textarea, replacement.selectionStart, replacement.selectionEnd);
}

// ── Toggle word letter breakdown ─────────────────────────────────────────────
function toggleWord(index) {
  expandedWords.value = {
    ...expandedWords.value,
    [index]: !expandedWords.value[index],
  };
}

// ── Save entry ───────────────────────────────────────────────────────────────
async function saveEntry() {
  if (!result.value || saveStatus.value === 'loading' || matches.value.isAlreadySaved) return;

  saveStatus.value = 'loading';
  saveError.value = '';
  clearTimeout(saveResetTimer);

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText:          inputText.value,
        normalizedText:        result.value.normalizedText,
        fullGematria:          result.value.fullGematria,
        fullGematriaHebrew:    result.value.fullHebrewNumber,
        initials:              result.value.initials,
        initialsGematria:      result.value.initialsGematria,
        initialsGematriaHebrew: result.value.initialsHebrewNumber,
        words:                 result.value.words,
      }),
    });

    if (res.status === 409) {
      matches.value.isAlreadySaved = true;
      saveStatus.value = 'saved';
    } else if (res.ok) {
      saveStatus.value = 'saved';
      matches.value.isAlreadySaved = true;
    } else {
      saveStatus.value = 'idle';
      saveError.value = 'שגיאה בשמירה';
    }
  } catch (e) {
    saveStatus.value = 'idle';
    saveError.value = 'שגיאת רשת';
  }

  if (saveStatus.value === 'saved') {
    saveResetTimer = setTimeout(() => { saveStatus.value = 'idle'; }, 3000);
  }
}

const baseWords = useBaseWords();
async function saveAsBaseWord() {
  if (!inputText.value.trim()) return;
  saveMenuOpen.value = false;
  const saved = await baseWords.save(inputText.value, 'calculator');
  baseWordFeedback.value = saved.ok ? 'נוסף למילות יסוד' : saved.message;
  clearTimeout(saveResetTimer);
  saveResetTimer = setTimeout(() => { baseWordFeedback.value = ''; }, 3000);
}
</script>

<style scoped>
/* ── Layout ──────────────────────────────────────────────────────────────── */
.calculator-root { direction: rtl; }

.calc-layout {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 28px;
  align-items: start;
}

.calc-col   { display: flex; flex-direction: column; gap: 14px; }
.advanced-tools { display: flex; flex-direction: column; gap: 9px; }
:deep(.gematria-discovery) { margin-top: 10px; }
.match-col  { position: sticky; top: 88px; }

/* Hide mobile match panel on desktop, desktop aside on mobile */
.match-col-mobile { display: none; }

@media (max-width: 820px) {
  .calc-layout { grid-template-columns: 1fr; }
  .match-col   { display: none; }
  .match-col-mobile { display: block; margin-top: 14px; }
}

/* ── Input card ──────────────────────────────────────────────────────────── */
.input-card {
  background: #fff;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  position: relative;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-card:focus-within,
.input-card--filled {
  border-color: #C09840;
  box-shadow: 0 0 0 3px rgba(192, 152, 64, 0.1);
}

.heb-input {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-family: "Source Sans Pro", Arial, sans-serif;
  font-size: 1.9rem;
  font-weight: 600;
  color: var(--navy);
  line-height: 1.4;
  direction: rtl;
  text-align: right;
  caret-color: #C09840;
  min-height: 84px;
  max-height: 260px;
  overflow-y: auto;
}

.heb-input::placeholder {
  color: #C8C2B4;
  font-weight: 400;
  font-size: 1.5rem;
}

@media (max-width: 640px) {
  .heb-input {
    min-height: 84px;
    max-height: 260px;
  }
}

.keyboard-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
  color: var(--text-secondary);
  font-size: .72rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.keyboard-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.keyboard-toggle__track {
  width: 28px;
  height: 16px;
  border-radius: 999px;
  background: #D7D2C8;
  position: relative;
  transition: background .16s ease;
}
.keyboard-toggle__track::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(26,39,68,.18);
  transition: transform .16s ease;
}
.keyboard-toggle input:checked + .keyboard-toggle__track { background: var(--gold); }
.keyboard-toggle input:checked + .keyboard-toggle__track::after { transform: translateX(-12px); }
.keyboard-toggle input:focus-visible + .keyboard-toggle__track { outline: 2px solid var(--navy); outline-offset: 2px; }

.clear-input-btn {
  position: absolute;
  top: 12px;
  left: 14px;
  background: none;
  border: none;
  cursor: pointer;
  color: #C8C2B4;
  font-size: 1.1rem;
  line-height: 1;
  padding: 2px;
  transition: color 0.15s;
}
.clear-input-btn:hover { color: var(--navy); }

/* ── Results container ──────────────────────────────────────────────────── */
.results-area { display: flex; flex-direction: column; gap: 12px; }

.results-fade-enter-active,
.results-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.results-fade-enter-from,
.results-fade-leave-to { opacity: 0; transform: translateY(6px); }

/* ── Unified calculation summary ─────────────────────────────────────────── */
.result-panel {
  position: relative;
  z-index: 2;
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 2px 10px rgba(26,39,68,0.05);
  overflow: visible;
  padding: 10px 0 14px;
}

.result-panel-toolbar {
  min-height: 27px;
  padding: 0 16px;
  display: flex;
  justify-content: flex-end;
}

.primary-result-content {
  min-width: 0;
}

.result-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.result-value-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.result-num {
  font-size: 1.95rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.primary-num,
.secondary-num { color: var(--navy); }

.result-divider {
  font-size: 1.2rem;
  color: #D4C9B0;
  font-weight: 300;
}

.result-heb {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--navy);
}
.primary-heb,
.secondary-heb { font-size: 1.5rem; }

/* ── Three equal summary sections ────────────────────────────────────────── */
.result-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.result-section {
  min-width: 0;
  min-height: 61px;
  padding: 4px 20px 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.result-section + .result-section {
  border-inline-start: 1px solid var(--border);
}

.roshei-letters {
  font-size: 1.95rem;
  line-height: 1;
  font-weight: 700;
  color: var(--navy);
  overflow-wrap: anywhere;
}

.roshei-value { align-items: baseline; }

.save-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid #C09840;
  background: rgba(192, 152, 64, 0.1);
  color: #A07C2E;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s;
  direction: rtl;
}
.save-btn:hover:not(:disabled) {
  background: #C09840;
  color: #fff;
  border-color: #A07C2E;
  box-shadow: 0 2px 8px rgba(192,152,64,0.2);
}
.save-btn:disabled { opacity: 0.65; cursor: default; }
.save-btn--saved {
  background: rgba(76, 175, 125, 0.08);
  border-color: rgba(76, 175, 125, 0.45);
  color: #388E3C;
}
.save-btn--saved:hover:not(:disabled) {
  background: rgba(76, 175, 125, 0.08);
  border-color: rgba(76, 175, 125, 0.45);
  color: #388E3C;
}

.save-error { font-size: 0.82rem; color: #D32F2F; }

/* ── Optional מילוי disclosure ───────────────────────────────────────────── */
.milui-disclosure {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.milui-toggle {
  align-items: center;
  background: #fffdf8;
  border: 0;
  border-bottom: 1px solid transparent;
  color: var(--navy);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  justify-content: space-between;
  min-height: 48px;
  padding: 9px 16px;
  text-align: right;
  transition: background .16s, color .16s;
  width: 100%;
}

.milui-toggle:hover,
.milui-toggle:focus-visible,
.milui-toggle[aria-expanded="true"] {
  background: #fbf8f1;
}

.milui-toggle:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -3px;
}

.milui-toggle[aria-expanded="true"] {
  border-bottom-color: var(--border);
}

.advanced-toggle__copy {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  text-align: right;
}

.advanced-toggle__label {
  color: var(--navy);
  font-size: .84rem;
  font-weight: 600;
}

.advanced-toggle__subtitle {
  color: var(--text-secondary);
  font-size: .69rem;
  font-weight: 500;
}

.milui-toggle__chevron {
  align-items: center;
  color: var(--gold);
  display: inline-block;
  height: 9px;
  width: 9px;
}

.milui-disclosure .milui-panel {
  border-radius: 0;
}

.milui-load-error {
  margin: 0;
  padding: 10px 16px;
  color: #b3261e;
  font-size: .78rem;
}

.milui-load-error button {
  background: transparent;
  border: 0;
  color: var(--navy);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  margin-inline-start: 5px;
  text-decoration: underline;
}

/* Keep the disclosure's button sizing explicit so it remains a secondary
   control rather than inheriting CTA styles from nearby calculator actions. */
.milui-toggle:disabled {
  align-items: center;
  cursor: default;
  opacity: .65;
}

@media (max-width: 480px) {
  .result-panel { padding-bottom: 0; }
  .result-grid { grid-template-columns: 1fr; }
  .result-section { min-height: 0; padding: 14px 18px; }
  .result-section + .result-section {
    border-inline-start: none;
    border-top: 1px solid var(--border);
  }
  .advanced-toggle__copy { gap: 5px; }
  .advanced-toggle__subtitle { flex-basis: 100%; }
  .save-btn { padding-inline: 10px; }
}

@media (min-width: 481px) and (max-width: 640px) {
  .result-section { padding-inline: 13px; }
  .result-num,
  .roshei-letters { font-size: 1.7rem; }
  .result-heb { font-size: 1.25rem; }
}

/* ── Word breakdown ──────────────────────────────────────────────────────── */
.breakdown-section {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  color: var(--text-secondary);
  text-transform: uppercase;
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--border);
}

.breakdown-list { }

.word-row {
  border-bottom: 1px solid #F2EDE4;
}
.word-row:last-child { border-bottom: none; }

.word-header {
  display: flex;
  align-items: center;
  padding: 13px 20px;
  cursor: pointer;
  transition: background 0.12s;
  gap: 8px;
}
.word-header:hover { background: #FAFAF6; }
.word-header--expanded { background: #FBF8F1; }

.word-info {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.word-text {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--navy);
}
.word-result {
  display: flex;
  align-items: baseline;
  gap: 5px;
}
.word-num { font-size: 1rem; font-weight: 700; color: var(--gold); }
.word-dot { color: #D4C9B0; font-size: 0.85rem; }
.word-heb { font-size: 0.9rem; color: var(--text-secondary); font-weight: 500; }

.word-expand-icon { color: #BBBBBB; height: 8px; width: 8px; }
.word-header--expanded .word-expand-icon { color: var(--gold); }

/* Letter breakdown */
.letters-slide-enter-active,
.letters-slide-leave-active { transition: all 0.18s ease; overflow: hidden; }
.letters-slide-enter-from,
.letters-slide-leave-to { max-height: 0; opacity: 0; }
.letters-slide-enter-to,
.letters-slide-leave-from { max-height: 400px; opacity: 1; }

.letter-list {
  padding: 6px 20px 12px 20px;
  background: #FDFAF5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.letter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  direction: rtl;
}
.letter-char {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--navy);
  width: 28px;
  text-align: right;
}
.letter-dash { color: #D4C9B0; font-size: 0.8rem; }
.letter-val  { font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); }

</style>
