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
          ></textarea>
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

            <!-- ── PRIMARY RESULT: גימטריה מלאה ─────────── -->
            <div class="result-card result-card--primary">
              <div class="result-label">גימטריה מלאה</div>
              <div class="result-value-row">
                <span class="result-num primary-num">{{ result.fullGematria }}</span>
                <span class="result-divider">·</span>
                <span class="result-heb primary-heb">{{ result.fullHebrewNumber }}</span>
              </div>
              <!-- Save button — belongs to this result -->
              <div class="save-row">
                <button
                  class="save-btn"
                  :class="{
                    'save-btn--saved': saveStatus === 'saved' || matches.isAlreadySaved,
                    'save-btn--loading': saveStatus === 'loading',
                  }"
                  :disabled="saveStatus === 'loading' || matches.isAlreadySaved"
                  @click="saveEntry"
                >
                  <span v-if="matches.isAlreadySaved" class="mdi mdi-check-circle"></span>
                  <span v-else-if="saveStatus === 'loading'" class="mdi mdi-loading mdi-spin"></span>
                  <span v-else-if="saveStatus === 'saved'" class="mdi mdi-check-circle"></span>
                  <span v-else class="mdi mdi-content-save-outline"></span>
                  {{ matches.isAlreadySaved ? 'כבר שמור' : saveStatus === 'saved' ? 'נשמר!' : 'שמור' }}
                </button>
                <span v-if="saveError" class="save-error">{{ saveError }}</span>
              </div>
            </div>

            <!-- ── ROSHEI TEIVOT ────────────────────────── -->
            <div class="result-card result-card--roshei">
              <div class="result-card-inner">
                <div class="roshei-block">
                  <div class="result-label">ראשי תיבות</div>
                  <div class="roshei-letters">{{ result.initials }}</div>
                </div>
                <div class="roshei-divider"></div>
                <div class="roshei-block">
                  <div class="result-label">גימטריה ר"ת</div>
                  <div class="result-value-row roshei-value">
                    <span class="result-num secondary-num">{{ result.initialsGematria }}</span>
                    <span class="result-divider">·</span>
                    <span class="result-heb secondary-heb">{{ result.initialsHebrewNumber }}</span>
                  </div>
                </div>
              </div>
            </div>

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
                    <span class="word-expand-icon mdi" :class="expandedWords[wi] ? 'mdi-chevron-up' : 'mdi-chevron-down'"></span>
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

        <!-- Placeholder when empty -->
        <div v-if="!hasInput" class="empty-hint">
          <div class="hint-text">כתוב מילה או משפט בעברית</div>
          <div class="hint-sub">החישוב מתבצע אוטומטית</div>
        </div>

      </div>

      <!-- ── RIGHT: Match panel (desktop sidebar) ──────────── -->
      <aside class="match-col" v-if="hasInput">
        <MatchPanel
          :primary="matches.primary"
          :secondary="matches.secondary"
          :gematria="result?.fullGematria"
          :initialsGematria="result?.initialsGematria"
          :isAlreadySaved="matches.isAlreadySaved"
          :hasInput="hasInput"
        />
      </aside>
    </div>

    <!-- Mobile: match panel below calculator -->
    <div class="match-col-mobile" v-if="hasInput">
      <MatchPanel
        :primary="matches.primary"
        :secondary="matches.secondary"
        :gematria="result?.fullGematria"
        :initialsGematria="result?.initialsGematria"
        :isAlreadySaved="matches.isAlreadySaved"
        :hasInput="hasInput"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { computeAll } from '@/composables/useGematria.js';
import MatchPanel from './MatchPanel.vue';

const inputText   = ref('');
const textareaRef = ref(null);
const expandedWords = ref({});
const saveStatus  = ref('idle');   // idle | loading | saved
const saveError   = ref('');
const matches     = ref({ primary: [], secondary: [], isAlreadySaved: false });

let matchDebounce = null;
let saveResetTimer = null;

// ── Computed result ───────────────────────────────────────────────────────────
const result  = computed(() => computeAll(inputText.value));
const hasInput = computed(() => !!result.value);

// Reset expanded words when text changes; restore min-height when cleared
watch(inputText, (val) => {
  expandedWords.value = {};
  saveStatus.value = 'idle';
  saveError.value = '';
  if (!val) {
    nextTick(() => {
      if (textareaRef.value) textareaRef.value.style.height = '';
    });
  }
});

// Auto-resize textarea to fit content, starting at 100px
function resizeTextarea() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(100, el.scrollHeight) + 'px';
}

// ── Live match lookup (debounced 350ms) ──────────────────────────────────────
watch(result, (newResult) => {
  clearTimeout(matchDebounce);

  if (!newResult) {
    matches.value = { primary: [], secondary: [], isAlreadySaved: false };
    return;
  }

  matchDebounce = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        gematria:        newResult.fullGematria,
        initialsGematria: newResult.initialsGematria,
        normalizedText:  newResult.normalizedText,
      });
      const res = await fetch(`/api/matches?${params}`);
      if (!res.ok) return;
      // Guard against stale responses: only apply if text hasn't changed
      if (result.value?.normalizedText !== newResult.normalizedText) return;
      matches.value = await res.json();
    } catch (e) {
      console.warn('Match fetch error:', e);
    }
  }, 350);
});

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
  min-height: 100px;
  overflow-y: hidden;
}

.heb-input::placeholder {
  color: #C8C2B4;
  font-weight: 400;
  font-size: 1.5rem;
}

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

/* ── Result cards ───────────────────────────────────────────────────────── */
.result-card {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 22px;
  box-shadow: 0 2px 10px rgba(26,39,68,0.05);
}

/* Primary gematria — most prominent */
.result-card--primary {
  background: linear-gradient(135deg, #FFFBF2 0%, #FFF8EC 100%);
  border-color: #E8D89A;
  padding: 22px 24px 18px;
  box-shadow: 0 4px 20px rgba(192, 152, 64, 0.1);
}

/* Save row lives inside the primary card */
.result-card--primary .save-row {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(232, 216, 154, 0.5);
  justify-content: flex-end;
}

.result-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  color: var(--text-secondary);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.result-value-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.result-num {
  font-size: 2.8rem;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.primary-num { color: #C09840; font-size: 3.4rem; }
.secondary-num { color: #1A2744; font-size: 1.3rem; }

.result-divider {
  font-size: 1.4rem;
  color: #D4C9B0;
  font-weight: 300;
}

.result-heb {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--navy);
}
.primary-heb  { font-size: 2.2rem; }
.secondary-heb { font-size: 1.2rem; }

/* ── ראשי תיבות card — subordinate to primary ───────────────────────────── */
.result-card--roshei {
  padding: 12px 22px;
  opacity: 0.88;
}

.result-card-inner {
  display: flex;
  align-items: center;
  gap: 0;
}

.roshei-block { flex: 1; }

.roshei-divider {
  width: 1px;
  height: 48px;
  background: var(--border);
  margin: 0 20px;
}

.roshei-letters {
  font-size: 1.55rem;
  font-weight: 600;
  color: var(--navy);
  margin-top: 2px;
}

.roshei-value { align-items: baseline; }

/* ── Save row ────────────────────────────────────────────────────────────── */
.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 24px;
  border-radius: 10px;
  border: 2px solid #C09840;
  background: #C09840;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s;
  direction: rtl;
}
.save-btn:hover:not(:disabled) {
  background: #A07C2E;
  border-color: #A07C2E;
  box-shadow: 0 3px 12px rgba(192,152,64,0.3);
}
.save-btn:disabled { opacity: 0.65; cursor: default; }
.save-btn--saved { background: #4CAF7D; border-color: #4CAF7D; }
.save-btn--saved:hover:not(:disabled) { background: #388E3C; border-color: #388E3C; }

.save-error { font-size: 0.82rem; color: #D32F2F; }

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

.word-expand-icon { color: #BBBBBB; font-size: 1rem; flex-shrink: 0; }
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

/* ── Empty state ─────────────────────────────────────────────────────────── */
.empty-hint {
  text-align: center;
  padding: 60px 20px;
  color: #CBCDC4;
}
.hint-text { font-size: 1.1rem; font-weight: 500; margin-bottom: 6px; }
.hint-sub  { font-size: 0.85rem; }
</style>
