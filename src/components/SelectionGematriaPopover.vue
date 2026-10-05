<template>
  <div
    ref="root"
    class="selection-popover"
    :class="[`selection-popover--${mode}`]"
    :style="rootStyle"
    data-selection-popover
    dir="rtl"
  >
    <button
      v-if="mode === 'action'"
      class="selection-action"
      type="button"
      @pointerdown="preserveMouseSelection"
      @click="emit('calculate', $event)"
    >
      <span class="action-mark" aria-hidden="true">ג</span>
      <span>חשב גימטריה</span>
    </button>

    <section
      v-else
      class="result-card"
      role="dialog"
      aria-modal="false"
      aria-label="גימטריית הבחירה"
      tabindex="-1"
    >
      <header class="result-heading">
        <div class="heading-copy">
          <span class="eyebrow">גימטריית הבחירה</span>
          <span class="selection-copy" lang="he">{{ text }}</span>
        </div>
        <button
          class="close-button"
          type="button"
          aria-label="סגור תוצאה"
          title="סגור תוצאה"
          @click="emit('dismiss')"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div v-if="result" class="result-content">
        <div class="full-value">
          <span class="result-label">גימטריה מלאה</span>
          <span class="full-number" dir="ltr">{{ formatNumber(result.fullGematria) }}</span>
          <span v-if="result.fullHebrewNumber" class="hebrew-number">{{ result.fullHebrewNumber }}</span>
        </div>

        <div v-if="result.words?.length > 1" class="derived-values">
          <div class="derived-row">
            <span class="derived-label">ראשי תיבות</span>
            <span class="derived-letters">{{ result.initials }}</span>
            <span class="derived-number" dir="ltr">{{ formatNumber(result.initialsGematria) }}</span>
          </div>
          <div class="derived-row">
            <span class="derived-label">סופי תיבות</span>
            <span class="derived-letters">{{ result.finals }}</span>
            <span class="derived-number" dir="ltr">{{ formatNumber(result.finalsGematria) }}</span>
          </div>
        </div>

        <div class="inclusive-value">
          <span>כולל +1</span>
          <strong dir="ltr">{{ formatNumber(Number(result.fullGematria) + 1) }}</strong>
        </div>
      </div>

      <section class="milui-disclosure">
        <button
          class="milui-trigger"
          type="button"
          :aria-expanded="miluiOpen"
          aria-controls="selection-milui-content"
          @click="toggleMilui"
        >
          <span>מילוי</span>
          <span class="milui-trigger-status">
            {{ miluiOpen ? 'סגור פירוט' : 'הצג חישוב' }}
            <span class="milui-chevron" :class="{ 'milui-chevron--open': miluiOpen }" aria-hidden="true"></span>
          </span>
        </button>
        <div v-if="miluiOpen" id="selection-milui-content" class="milui-content">
          <p v-if="miluiState === 'loading'" class="milui-state" role="status">מחשב מילוי…</p>
          <div v-else-if="miluiState === 'error'" class="milui-error" role="alert">
            <span>{{ miluiError || 'לא ניתן לטעון את חישוב המילוי כרגע' }}</span>
            <button type="button" class="inline-retry" @click="emit('load-milui')">נסו שוב</button>
          </div>
          <template v-else-if="miluiCalculation">
            <div class="milui-primary">
              <span class="milui-caption">מילוי רגיל · סך הכול</span>
              <span class="milui-expansion" lang="he">{{ miluiCalculation.expandedText }}</span>
              <div class="milui-number-row">
                <span class="milui-number">{{ formatNumber(miluiCalculation.fullGematria) }}</span>
                <span v-if="miluiCalculation.fullHebrewNumber" class="milui-hebrew-total">{{ miluiCalculation.fullHebrewNumber }}</span>
              </div>
            </div>
            <div class="milui-filling">
              <span>מילוי בלבד</span>
              <strong>{{ formatNumber(miluiCalculation.fillingOnlyGematria) }}</strong>
              <span v-if="miluiCalculation.fillingOnlyHebrewNumber">{{ miluiCalculation.fillingOnlyHebrewNumber }}</span>
            </div>

            <div v-if="miluiForms.length" class="milui-list">
              <span class="milui-section-label">צורות מילוי נפוצות</span>
              <div v-for="form in miluiForms" :key="form.id" class="milui-result-row">
                <span class="milui-form-name">{{ form.label }}<small v-if="form.primary"> · בסיס</small></span>
                <span class="milui-form-value" dir="ltr">{{ formatNumber(form.calculation?.fullGematria) }}</span>
                <span class="milui-form-spelling" lang="he">{{ form.calculation?.expandedText }}</span>
              </div>
            </div>

            <div v-if="havayahPresets.length" class="milui-list havayah-list">
              <span class="milui-section-label">מילויי הוי״ה</span>
              <div v-for="preset in havayahPresets" :key="preset.id" class="milui-result-row">
                <span class="milui-form-name">{{ preset.label }}</span>
                <span class="milui-form-value" dir="ltr">
                  {{ formatNumber(preset.calculation?.fullGematria ?? preset.fullGematria ?? preset.value) }}
                </span>
                <span class="milui-form-spelling" lang="he">
                  {{ preset.calculation?.expandedText ?? preset.expandedText ?? preset.spelling ?? '' }}
                </span>
              </div>
            </div>

            <details v-if="miluiCalculation.words?.length" class="milui-words">
              <summary>פירוט לפי מילים</summary>
              <div v-for="word in miluiCalculation.words" :key="`${word.position}-${word.word}`" class="milui-word-row">
                <span>{{ word.word }}</span>
                <span>{{ formatNumber(word.fullGematria) }} · {{ word.fullHebrewNumber }}</span>
              </div>
            </details>
          </template>
          <p v-else class="milui-state" role="status">חישוב המילוי עדיין לא נטען.</p>
        </div>
      </section>

      <footer class="result-footer">
        <p v-if="saveError" class="save-error" role="alert">
          {{ saveError }}
        </p>
        <button
          class="save-button"
          :class="{ 'save-button--complete': saveState === 'saved' || saveState === 'duplicate' }"
          type="button"
          :disabled="saveState === 'loading' || saveState === 'saved' || saveState === 'duplicate'"
          :aria-busy="saveState === 'loading' ? 'true' : 'false'"
          @click="emit('save')"
        >
          <span class="save-icon" aria-hidden="true">{{ saveState === 'saved' || saveState === 'duplicate' ? '✓' : '↧' }}</span>
          {{ saveLabel }}
        </button>
        <div class="yesod-action">
          <p v-if="yesodError" class="save-error yesod-error" role="alert">{{ yesodError }}</p>
          <button
            class="yesod-button"
            :class="{ 'yesod-button--complete': yesodState === 'saved' || yesodState === 'duplicate' }"
            type="button"
            :disabled="yesodState === 'checking' || yesodState === 'loading' || yesodState === 'saved' || yesodState === 'duplicate'"
            :aria-busy="yesodState === 'checking' || yesodState === 'loading' ? 'true' : 'false'"
            @click="emit('save-yesod')"
          >
            {{ yesodLabel }}
          </button>
          <button
            v-if="yesodState === 'error'"
            class="yesod-retry"
            type="button"
            @click="emit('save-yesod')"
          >נסו שוב</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';

const props = defineProps({
  mode: { type: String, default: 'action', validator: value => ['action', 'result'].includes(value) },
  text: { type: String, default: '' },
  result: { type: Object, default: null },
  position: { type: Object, default: () => ({ left: 0, top: 0 }) },
  saveState: { type: String, default: 'idle', validator: value => ['idle', 'loading', 'saved', 'duplicate', 'error'].includes(value) },
  saveError: { type: String, default: '' },
  yesodState: { type: String, default: 'idle', validator: value => ['idle', 'checking', 'loading', 'saved', 'duplicate', 'error'].includes(value) },
  yesodError: { type: String, default: '' },
  miluiCalculation: { type: Object, default: null },
  miluiForms: { type: Array, default: () => [] },
  havayahPresets: { type: Array, default: () => [] },
  miluiState: { type: String, default: 'idle', validator: value => ['idle', 'loading', 'ready', 'error'].includes(value) },
  miluiError: { type: String, default: '' },
});
const emit = defineEmits(['calculate', 'dismiss', 'save', 'save-yesod', 'load-milui']);
const root = ref(null);
const miluiOpen = ref(false);
watch(() => [props.text, props.mode], () => { miluiOpen.value = false; });

const rootStyle = computed(() => ({
  left: `${Number(props.position?.left) || 0}px`,
  top: `${Number(props.position?.top) || 0}px`,
  '--selection-viewport-width': props.position?.viewportWidth ? `${props.position.viewportWidth}px` : '100vw',
  '--selection-viewport-height': props.position?.viewportHeight ? `${props.position.viewportHeight}px` : '100dvh',
}));
const saveLabel = computed(() => {
  if (props.saveState === 'loading') return 'שומר…';
  if (props.saveState === 'saved') return 'נשמר';
  if (props.saveState === 'duplicate') return 'כבר שמור';
  return 'שמור';
});
const yesodLabel = computed(() => {
  if (props.yesodState === 'checking') return 'בודק…';
  if (props.yesodState === 'loading') return 'שומר כיסוד…';
  if (props.yesodState === 'saved') return 'נשמר כיסוד';
  if (props.yesodState === 'duplicate') return 'כבר שמור כיסוד';
  if (props.yesodState === 'error') return 'נסה לשמור כיסוד שוב';
  return 'שמור כיסוד';
});

function toggleMilui() {
  miluiOpen.value = !miluiOpen.value;
  if (miluiOpen.value) emit('load-milui');
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('he-IL') : '—';
}

function preserveMouseSelection(event) {
  if (event.pointerType === 'mouse') event.preventDefault();
}

defineExpose({ element: root });
</script>

<style scoped>
.selection-popover {
  position: fixed;
  z-index: 900;
  width: max-content;
  max-width: min(340px, calc(var(--selection-viewport-width, 100vw) - 24px));
  max-height: calc(100vh - 24px);
  max-height: calc(var(--selection-viewport-height, 100dvh) - 24px);
  overflow: auto;
  overscroll-behavior: contain;
  color: #1a2744;
  font-family: "Source Sans Pro", sans-serif;
  -webkit-font-smoothing: antialiased;
  animation: popover-enter 150ms ease-out both;
}

.selection-action {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 9px;
  padding: 8px 13px 8px 15px;
  border: 1px solid #d8c594;
  border-radius: 11px;
  background: #fffdf8;
  color: #1a2744;
  box-shadow: 0 5px 18px rgba(26, 39, 68, .13), 0 1px 3px rgba(26, 39, 68, .08);
  font: inherit;
  font-size: .88rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, transform 140ms ease;
}
.selection-action:hover { background: #f8f1df; border-color: #bd9847; }
.selection-action:active { transform: translateY(1px); }
.action-mark {
  display: grid;
  width: 21px;
  height: 21px;
  place-items: center;
  border: 1px solid #ddc98e;
  border-radius: 50%;
  color: #9a7529;
  font-family: "Noto Serif Hebrew", serif;
  font-size: .85rem;
  line-height: 1;
}

.result-card {
  width: min(340px, calc(var(--selection-viewport-width, 100vw) - 24px));
  overflow: hidden;
  border: 1px solid #e2d8c3;
  border-radius: 14px;
  background: #fffdf8;
  box-shadow: 0 12px 34px rgba(26, 39, 68, .17), 0 2px 7px rgba(26, 39, 68, .08);
}
.result-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 15px 12px;
  background: linear-gradient(115deg, #fffdf8 0%, #fbf6e9 100%);
  border-bottom: 1px solid #eee6d6;
}
.heading-copy { min-width: 0; display: grid; gap: 5px; }
.eyebrow {
  color: #9b762b;
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .045em;
}
.selection-copy {
  max-height: 4.5em;
  overflow: auto;
  color: #1a2744;
  font-family: "Noto Serif Hebrew", serif;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.close-button {
  display: grid;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  place-items: center;
  margin: -3px -4px 0 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: #777064;
  font: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease;
}
.close-button:hover { border-color: #e8ddc6; background: #f8f1df; color: #1a2744; }

.result-content { padding: 13px 16px 10px; }
.full-value {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px 9px;
  padding-bottom: 13px;
  border-bottom: 1px solid #eee6d6;
}
.result-label {
  flex-basis: 100%;
  color: #7b8496;
  font-size: .72rem;
  font-weight: 650;
}
.full-number {
  color: #1a2744;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.hebrew-number {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: #8b681f;
  font-family: "Noto Serif Hebrew", serif;
  font-size: 1.2rem;
  font-weight: 600;
}
.derived-values { display: grid; padding: 4px 0; }
.derived-row {
  display: grid;
  grid-template-columns: minmax(68px, .8fr) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 9px;
  min-height: 33px;
  border-bottom: 1px solid #f1ecdf;
}
.derived-row:last-child { border-bottom: 0; }
.derived-label { color: #7b8496; font-size: .76rem; }
.derived-letters {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #1a2744;
  font-family: "Noto Serif Hebrew", serif;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: .04em;
}
.derived-number {
  min-width: 34px;
  color: #43506a;
  font-size: .84rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: left;
}
.inclusive-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 7px;
  padding: 8px 10px;
  border: 1px solid #eee2c3;
  border-radius: 9px;
  background: #faf5e8;
  color: #80621f;
  font-size: .78rem;
  font-weight: 650;
}
.inclusive-value strong {
  color: #745714;
  font-size: .98rem;
  font-variant-numeric: tabular-nums;
}
.milui-disclosure { border-top: 1px solid #eee6d6; }
.milui-trigger {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 15px;
  border: 0;
  background: #fbf8f0;
  color: #43506a;
  font: inherit;
  font-size: .75rem;
  font-weight: 700;
  text-align: right;
  cursor: pointer;
}
.milui-trigger:hover { background: #f7f0df; color: #765812; }
.milui-trigger-status { display: inline-flex; align-items: center; gap: 8px; color: #8b681f; font-size: .68rem; font-weight: 600; }
.milui-chevron {
  width: 7px;
  height: 7px;
  border-inline-end: 1px solid currentColor;
  border-bottom: 1px solid currentColor;
  transform: rotate(45deg) translateY(-2px);
  transition: transform 140ms ease;
}
.milui-chevron--open { transform: rotate(225deg) translateY(-1px); }
.milui-content {
  max-height: min(32vh, 250px);
  overflow: auto;
  overscroll-behavior: contain;
  padding: 11px 14px 13px;
  background: #fffdf8;
}
.milui-state { margin: 0; color: #777064; font-size: .74rem; }
.milui-error { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #9b413a; font-size: .72rem; line-height: 1.4; }
.inline-retry, .yesod-retry {
  flex: 0 0 auto;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #80621f;
  font: inherit;
  font-size: .71rem;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.milui-primary { display: grid; gap: 3px; }
.milui-caption, .milui-section-label { color: #8b681f; font-size: .66rem; font-weight: 700; }
.milui-expansion {
  color: #1a2744;
  font-family: "Noto Serif Hebrew", serif;
  font-size: .9rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.milui-number-row { display: flex; align-items: baseline; gap: 7px; }
.milui-number { color: #1a2744; font-size: 1.35rem; font-weight: 750; font-variant-numeric: tabular-nums; }
.milui-hebrew-total { color: #8b681f; font-family: "Noto Serif Hebrew", serif; font-size: .91rem; font-weight: 600; }
.milui-filling {
  display: flex;
  align-items: baseline;
  gap: 7px;
  margin-top: 8px;
  padding: 7px 9px;
  border: 1px solid #eee2c3;
  border-radius: 7px;
  background: #faf5e8;
  color: #80621f;
  font-size: .68rem;
}
.milui-filling strong { margin-inline-start: auto; color: #745714; font-size: .82rem; font-variant-numeric: tabular-nums; }
.milui-list { display: grid; gap: 4px; margin-top: 10px; }
.milui-result-row {
  display: grid;
  grid-template-columns: minmax(80px, .8fr) auto;
  align-items: baseline;
  gap: 2px 8px;
  padding: 5px 0;
  border-top: 1px solid #f1ecdf;
}
.milui-form-name { color: #43506a; font-size: .69rem; font-weight: 650; }
.milui-form-name small { color: #9b762b; font-size: .62rem; }
.milui-form-value { color: #1a2744; font-size: .72rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.milui-form-spelling { grid-column: 1 / -1; color: #777064; font-family: "Noto Serif Hebrew", serif; font-size: .72rem; line-height: 1.4; overflow-wrap: anywhere; }
.milui-words { margin-top: 9px; border-top: 1px solid #eee6d6; color: #606b7e; font-size: .7rem; }
.milui-words summary { padding: 7px 0 3px; color: #43506a; font-weight: 650; cursor: pointer; }
.milui-word-row { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-top: 1px solid #f1ecdf; }
.milui-word-row span:first-child { color: #1a2744; font-family: "Noto Serif Hebrew", serif; }
.milui-word-row span:last-child { color: #80621f; font-variant-numeric: tabular-nums; }
.havayah-list { padding-top: 2px; }
.result-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-height: 51px;
  padding: 7px 14px 11px;
}
.save-error { flex: 1; color: #9b413a; font-size: .72rem; line-height: 1.35; }
.yesod-action { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 4px 8px; }
.yesod-error { flex-basis: 100%; margin: 0; text-align: left; }
.save-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 76px;
  min-height: 30px;
  padding: 5px 10px;
  border: 1px solid #d8c594;
  border-radius: 8px;
  background: #fffaf0;
  color: #80621f;
  font: inherit;
  font-size: .76rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}
.save-button:hover:not(:disabled) { border-color: #b99543; background: #f5edd8; color: #604812; }
.save-button:disabled { cursor: default; opacity: .78; }
.save-button--complete { border-color: #d7dfd1; background: #f3f6ef; color: #536b4d; }
.save-icon { font-size: .82rem; line-height: 1; }
.yesod-button {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  border: 1px solid #d8c594;
  border-radius: 8px;
  background: #fffaf0;
  color: #80621f;
  font: inherit;
  font-size: .72rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
}
.yesod-button:hover:not(:disabled) { border-color: #b99543; background: #f5edd8; color: #604812; }
.yesod-button:disabled { cursor: default; opacity: .78; }
.yesod-button--complete { border-color: #d7dfd1; background: #f3f6ef; color: #536b4d; }

.selection-action:focus-visible,
.close-button:focus-visible,
.save-button:focus-visible,
.yesod-button:focus-visible,
.milui-trigger:focus-visible,
.inline-retry:focus-visible,
.yesod-retry:focus-visible {
  outline: 2px solid #a17b30;
  outline-offset: 2px;
}

@keyframes popover-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (max-width: 380px) {
  .result-heading { padding: 12px 12px 10px; }
  .result-content { padding-inline: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .selection-popover { animation: none; }
  .selection-action, .close-button, .save-button, .yesod-button, .milui-chevron { transition: none; }
}
</style>
