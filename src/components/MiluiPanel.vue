<template>
  <section class="milui-panel" dir="rtl" aria-labelledby="milui-result-title">
    <div class="milui-panel__header">
      <div id="milui-result-title" class="milui-panel__title">מילוי רגיל</div>
      <button
        class="milui-settings-link"
        type="button"
        :disabled="settingsDisabled"
        :aria-expanded="variantOpen"
        aria-controls="milui-advanced"
        @click="variantOpen = !variantOpen"
      >
        <span class="mdi mdi-tune-variant" aria-hidden="true"></span>
        שנה מילוי
      </button>
    </div>

    <div class="milui-primary-result">
      <div class="milui-primary-content">
        <div class="milui-expanded-text">{{ calculation.expandedText }}</div>

        <div class="milui-total-row">
          <div class="milui-total-block milui-total-block--primary">
            <div class="milui-label">גימטריה מלאה</div>
            <div class="milui-value">
              <span>{{ calculation.fullGematria }}</span>
              <span class="milui-dot">·</span>
              <span class="milui-hebrew-number">{{ calculation.fullHebrewNumber }}</span>
            </div>
          </div>
          <div class="milui-total-block milui-secondary-total">
            <div class="milui-label">מילוי בלבד</div>
            <div class="milui-secondary-value">
              {{ calculation.fillingOnlyGematria }}
              <span class="milui-dot">·</span>
              {{ calculation.fillingOnlyHebrewNumber }}
            </div>
          </div>
        </div>
      </div>

    </div>

    <section v-if="variantOccurrences.length" class="milui-additional" aria-labelledby="milui-additional-title">
      <div class="milui-additional__heading">
        <div>
          <h3 id="milui-additional-title">אופנים נוספים לבחירה</h3>
          <p>אפשר לבחור אופציה אחת או יותר</p>
        </div>
        <div class="milui-additional__tools">
          <span v-if="selectedAdditionalIds.length" class="milui-selection-count">
            נבחרו {{ selectedAdditionalIds.length }}
          </span>
          <button class="milui-select-all" type="button" @click="toggleAllAdditional">
            {{ allAdditionalSelected ? 'נקה בחירה' : 'בחר הכל' }}
          </button>
        </div>
      </div>
      <div class="milui-additional__list">
        <button
          v-for="form in additionalForms"
          :key="form.id"
          class="milui-additional__row"
          type="button"
          :class="{ 'milui-additional__row--selected': isAdditionalSelected(form.id) }"
          :aria-pressed="isAdditionalSelected(form.id)"
          :aria-label="`${compactMiluiLabel(form.label)}, ${form.calculation.fullGematria}`"
          @click="toggleAdditional(form.id)"
        >
          <span class="milui-additional__check" aria-hidden="true"></span>
          <span class="milui-additional__name">{{ compactMiluiLabel(form.label) }}</span>
          <span class="milui-additional__spelling">{{ form.calculation.expandedText }}</span>
          <span class="milui-additional__values">
            <span class="milui-additional__metric">
              <span>סה״כ</span>
              <strong>{{ form.calculation.fullGematria }} · {{ form.calculation.fullHebrewNumber }}</strong>
            </span>
            <span class="milui-additional__metric">
              <span>מילוי בלבד</span>
              <strong>{{ form.calculation.fillingOnlyGematria }} · {{ form.calculation.fillingOnlyHebrewNumber }}</strong>
            </span>
          </span>
        </button>
      </div>
      <div class="milui-additional__actions">
        <button
          class="milui-save-primary"
          type="button"
          :disabled="primarySaveDisabled"
          @click="emit('save-primary')"
        >
          {{ primarySaveLabel }}
        </button>
        <button
          class="milui-save-selected"
          type="button"
          :disabled="!selectedAdditionalIds.length || selectedSaveDisabled"
          @click="emit('save-selected', [...selectedAdditionalIds])"
        >
          {{ selectedSaveLabel }} ({{ selectedAdditionalIds.length }})
        </button>
      </div>
    </section>

    <section v-if="variantOpen" id="milui-advanced" class="milui-variants">
      <div class="milui-advanced-heading">
        <span>התאמת מילוי</span>
        <button
          class="milui-inline-settings"
          type="button"
          :disabled="settingsDisabled"
          @click="emit('open-settings')"
        >
          הגדרות מילוי
        </button>
      </div>
      <div
        v-if="variantOccurrences.length"
        id="milui-variant-composer"
        ref="composerRef"
        class="milui-variant-composer"
      >
        <div class="milui-variant-section-label">אפשרויות מילוי</div>
        <div class="milui-variant-rows">
          <div
            v-for="occurrence in labeledOccurrences"
            :key="occurrence.sourceIndex"
            class="milui-variant-row"
          >
            <div :id="`milui-occurrence-${occurrence.sourceIndex}`" class="milui-variant-letter">
              {{ occurrence.label }}
            </div>
            <div
              class="milui-variant-options"
              role="radiogroup"
              :aria-labelledby="`milui-occurrence-${occurrence.sourceIndex}`"
            >
              <button
                v-for="spelling in occurrence.acceptedSpellings"
                :key="spelling"
                type="button"
                role="radio"
                :tabindex="selectedSpelling(occurrence.sourceIndex) === spelling ? 0 : -1"
                :aria-checked="selectedSpelling(occurrence.sourceIndex) === spelling"
                :data-occurrence="occurrence.sourceIndex"
                :class="{ 'milui-variant-option--selected': selectedSpelling(occurrence.sourceIndex) === spelling }"
                @click="selectVariant(occurrence.sourceIndex, spelling)"
                @keydown="onVariantKeydown($event, occurrence, spelling)"
              >
                <span aria-hidden="true" class="milui-variant-option__mark">✓</span>
                {{ formatMiluiVariantSpelling(spelling) }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="variantCalculation" class="milui-selected-result" aria-live="polite">
          <div class="milui-label">המילוי הנבחר</div>
          <div class="milui-selected-result__value">
            {{ variantCalculation.fullGematria }}
            <span class="milui-dot">·</span>
            {{ variantCalculation.fullHebrewNumber }}
          </div>
          <div class="milui-selected-result__spelling">{{ variantCalculation.expandedText }}</div>
        </div>

        <button
          class="milui-variant-save"
          type="button"
          :disabled="saveState === 'saving' || saveState === 'saved'"
          @click="saveInterpretation"
        >
          {{ saveButtonLabel }}
        </button>
        <p v-if="saveMessage" class="milui-variant-feedback" :class="{ 'milui-variant-feedback--error': saveState === 'error' }" role="status">
          {{ saveMessage }}
        </p>
      </div>
    </section>

    <section
      v-if="variantOpen && canonicalPresets?.length"
      class="havayah-milui"
      aria-labelledby="havayah-milui-title"
    >
      <h3 id="havayah-milui-title">מילויי הוי״ה</h3>
      <div class="havayah-options">
        <button
          v-for="preset in canonicalPresets"
          :key="preset.id"
          type="button"
          :aria-pressed="activeCanonicalId === preset.id"
          :class="{ 'havayah-option--active': activeCanonicalId === preset.id }"
          @click="toggleCanonical(preset.id)"
        >
          <span>{{ compactMiluiLabel(preset.label) }}</span>
          <span class="havayah-option__dot">·</span>
          <span>{{ preset.value }}</span>
        </button>
      </div>
      <div v-if="activeCanonical" class="havayah-spelling" aria-live="polite">
        {{ activeCanonical.spelling }}
      </div>
    </section>

    <button class="milui-detail-trigger" type="button" :aria-expanded="detailsOpen" @click="detailsOpen = !detailsOpen">
      <span>פירוט</span>
      <span class="milui-summary-chevron ui-chevron" :class="detailsOpen ? 'ui-chevron--up' : 'ui-chevron--down'" aria-hidden="true"></span>
    </button>
    <details v-if="detailsOpen" open class="milui-details">
      <summary class="sr-only">פירוט מילים ואותיות</summary>
      <div class="milui-word-list">
        <details v-for="word in calculation.words" :key="`${word.position}-${word.word}`" class="milui-word">
          <summary>
            <span class="milui-word-name">{{ word.word }}</span>
            <span class="milui-word-total">
              {{ word.fullGematria }} · {{ word.fullHebrewNumber }}
            </span>
            <span class="milui-summary-chevron ui-chevron ui-chevron--down" aria-hidden="true"></span>
          </summary>
          <div class="milui-word-expanded">{{ word.expandedText }}</div>
          <div class="milui-letter-list">
            <div v-for="(letter, index) in word.letters" :key="index" class="milui-letter">
              <span class="milui-letter__original">{{ letter.letter }}</span>
              <span class="milui-letter__arrow">←</span>
              <span class="milui-letter__spelling">{{ letter.spelling }}</span>
              <span class="milui-letter__values">
                {{ letter.fullValue }} · {{ letter.fillingOnly }} ({{ letter.fillingOnlyValue }})
              </span>
            </div>
          </div>
        </details>
      </div>
    </details>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  calculateMiluiVariant,
  formatMiluiVariantSpelling,
  getCommonMiluiForms,
  getMiluiVariantOccurrences,
} from '@/utils/milui.js';

const props = defineProps({
  calculation: {
    type: Object,
    required: true,
  },
  sourceText: {
    type: String,
    required: true,
  },
  mapping: {
    type: Object,
    required: true,
  },
  canonicalPresets: {
    type: Array,
    default: null,
  },
  settingsDisabled: {
    type: Boolean,
    default: false,
  },
  primarySaveDisabled: {
    type: Boolean,
    default: false,
  },
  primarySaveLabel: {
    type: String,
    default: 'שמור',
  },
  saveAllDisabled: {
    type: Boolean,
    default: false,
  },
  saveAllLabel: {
    type: String,
    default: 'שמור כל האופנים',
  },
  selectedSaveDisabled: {
    type: Boolean,
    default: false,
  },
  selectedSaveLabel: {
    type: String,
    default: 'שמור נבחרים',
  },
});

const emit = defineEmits([
  'open-settings',
  'explicit-total-change',
  'interpretation-saved',
  'save-primary',
  'save-all',
  'save-selected',
]);
const activeCanonicalId = ref(null);
const composerRef = ref(null);
const variantOpen = ref(false);
const detailsOpen = ref(false);
const variantSelections = ref([]);
const selectedAdditionalIds = ref([]);
const saveState = ref('idle');
const saveMessage = ref('');
let feedbackTimer = null;
const activeCanonical = computed(() => (
  props.canonicalPresets?.find(preset => preset.id === activeCanonicalId.value) || null
));
const variantOccurrences = computed(() => (
  getMiluiVariantOccurrences(props.sourceText, props.mapping)
));
const labeledOccurrences = computed(() => {
  const totals = variantOccurrences.value.reduce((counts, occurrence) => {
    counts[occurrence.baseLetter] = (counts[occurrence.baseLetter] || 0) + 1;
    return counts;
  }, {});
  const seen = {};
  return variantOccurrences.value.map(occurrence => {
    seen[occurrence.baseLetter] = (seen[occurrence.baseLetter] || 0) + 1;
    return {
      ...occurrence,
      label: totals[occurrence.baseLetter] > 1
        ? `${occurrence.letter} · ${seen[occurrence.baseLetter]}`
        : occurrence.letter,
    };
  });
});
const variantCalculation = computed(() => (
  variantOccurrences.value.length
    ? calculateMiluiVariant(props.sourceText, props.mapping, variantSelections.value)
    : null
));
const additionalForms = computed(() => (
  getCommonMiluiForms(props.sourceText, props.mapping).slice(1)
));
const allAdditionalSelected = computed(() => (
  additionalForms.value.length > 0
  && selectedAdditionalIds.value.length === additionalForms.value.length
));
const saveButtonLabel = computed(() => ({
  saving: 'שומר...',
  saved: 'המילוי נשמר',
  duplicate: 'כבר נשמר',
}[saveState.value] || 'שמור מילוי זה'));

function selectedSpelling(sourceIndex) {
  return variantSelections.value.find(selection => selection.sourceIndex === sourceIndex)
    ?.selectedSpelling;
}

function compactMiluiLabel(label) {
  return String(label || '').replace(/^מילוי\s+/, '');
}

function isAdditionalSelected(id) {
  return selectedAdditionalIds.value.includes(id);
}

function toggleAdditional(id) {
  if (isAdditionalSelected(id)) {
    selectedAdditionalIds.value = selectedAdditionalIds.value.filter(selectedId => selectedId !== id);
    return;
  }
  selectedAdditionalIds.value = [...selectedAdditionalIds.value, id];
}

function toggleAllAdditional() {
  selectedAdditionalIds.value = allAdditionalSelected.value
    ? []
    : additionalForms.value.map(form => form.id);
}

function clearSaveFeedback() {
  clearTimeout(feedbackTimer);
  saveState.value = 'idle';
  saveMessage.value = '';
}

function resetSelections() {
  variantOpen.value = false;
  selectedAdditionalIds.value = [];
  variantSelections.value = variantOccurrences.value.map(occurrence => ({
    sourceIndex: occurrence.sourceIndex,
    wordIndex: occurrence.wordIndex,
    letterIndex: occurrence.letterIndex,
    letter: occurrence.letter,
    selectedSpelling: occurrence.defaultSpelling,
  }));
  clearSaveFeedback();
  emit('explicit-total-change', 0);
}

function selectVariant(sourceIndex, selectedSpellingValue) {
  variantSelections.value = variantSelections.value.map(selection => (
    selection.sourceIndex === sourceIndex
      ? { ...selection, selectedSpelling: selectedSpellingValue }
      : selection
  ));
  clearSaveFeedback();
}

function onVariantKeydown(event, occurrence, currentSpelling) {
  const options = occurrence.acceptedSpellings;
  const currentIndex = options.indexOf(currentSpelling);
  let nextIndex = currentIndex;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % options.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    nextIndex = (currentIndex - 1 + options.length) % options.length;
  } else if (event.key === 'Home') {
    nextIndex = 0;
  } else if (event.key === 'End') {
    nextIndex = options.length - 1;
  } else {
    return;
  }
  event.preventDefault();
  selectVariant(occurrence.sourceIndex, options[nextIndex]);
  nextTick(() => {
    const buttons = composerRef.value?.querySelectorAll(
      `[data-occurrence="${occurrence.sourceIndex}"]`
    );
    buttons?.[nextIndex]?.focus();
  });
}

async function saveInterpretation() {
  if (!variantCalculation.value || saveState.value === 'saving') return;
  saveState.value = 'saving';
  saveMessage.value = '';
  try {
    const response = await fetch('/api/milui-interpretations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: props.sourceText,
        selections: variantCalculation.value.selections,
        expectedTotal: variantCalculation.value.fullGematria,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409 && payload.error === 'interpretation_already_exists') {
      saveState.value = 'duplicate';
      saveMessage.value = 'כבר נשמר';
    } else if (response.ok) {
      saveState.value = 'saved';
      saveMessage.value = 'המילוי נשמר';
      emit('interpretation-saved');
    } else if (payload.error === 'milui_interpretation_changed') {
      saveState.value = 'error';
      saveMessage.value = 'הגדרות המילוי השתנו. יש לפתוח מחדש את האפשרויות';
    } else {
      throw new Error('save_failed');
    }
    feedbackTimer = setTimeout(() => {
      saveState.value = 'idle';
      saveMessage.value = '';
    }, 2200);
  } catch {
    saveState.value = 'error';
    saveMessage.value = 'לא ניתן לשמור את המילוי כרגע';
  }
}

function toggleCanonical(id) {
  activeCanonicalId.value = activeCanonicalId.value === id ? null : id;
}

watch(() => props.calculation.normalizedText, () => {
  activeCanonicalId.value = null;
  detailsOpen.value = false;
});

watch(
  [
    () => props.calculation.normalizedText,
    () => JSON.stringify(props.mapping),
  ],
  resetSelections,
  { immediate: true }
);

watch([variantOpen, variantCalculation], ([open, current]) => {
  emit('explicit-total-change', open && current ? current.fullGematria : 0);
});

watch(() => props.canonicalPresets, (presets) => {
  if (!presets?.some(preset => preset.id === activeCanonicalId.value)) {
    activeCanonicalId.value = null;
  }
});

onBeforeUnmount(() => clearTimeout(feedbackTimer));
</script>

<style scoped>
.milui-panel {
  background: #fffdf8;
  border: 0;
  border-radius: 0;
  overflow: hidden;
}

.milui-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 18px 7px;
}

.milui-label {
  color: var(--text-secondary);
  font-size: .68rem;
  font-weight: 600;
  letter-spacing: .04em;
}

.milui-panel__title {
  color: #8d6d29;
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
}

.milui-settings-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: .72rem;
  padding: 3px 0;
}

.milui-settings-link:hover,
.milui-settings-link:focus-visible {
  color: var(--navy);
}

.milui-settings-link:disabled {
  cursor: default;
  opacity: .5;
}

.milui-primary-result {
  align-items: center;
  display: flex;
  gap: 28px;
  justify-content: space-between;
  padding: 0 18px 14px;
}

.milui-primary-content {
  flex: 1 1 auto;
  min-width: 0;
}

.milui-expanded-text {
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: clamp(1.35rem, 2.5vw, 1.8rem);
  font-weight: 600;
  line-height: 1.65;
  padding: 1px 0 11px;
  overflow-wrap: anywhere;
}

.milui-total-row {
  align-items: stretch;
  display: flex;
  gap: 0;
  justify-content: flex-start;
}

.milui-total-block {
  min-width: 132px;
  padding-block: 4px;
}

.milui-total-block--primary {
  padding-inline-end: 26px;
}

.milui-value {
  align-items: baseline;
  color: var(--navy);
  display: flex;
  font-size: 1.5rem;
  font-weight: 700;
  gap: 6px;
  margin-top: 1px;
}

.milui-hebrew-number {
  font-size: 1.12rem;
  font-weight: 600;
}

.milui-dot {
  color: #d4c9b0;
  font-weight: 300;
}

.milui-secondary-total {
  border-inline-start: 1px solid #e7decc;
  padding-inline-start: 26px;
}

.milui-secondary-value {
  color: var(--text-secondary);
  font-size: .9rem;
  font-weight: 600;
  margin-top: 5px;
}

.milui-save-actions {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 7px;
  justify-content: center;
  margin-top: 0;
  min-width: 126px;
  padding: 5px 0;
}

.milui-save-primary,
.milui-save-all {
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  font-size: .78rem;
  font-weight: 700;
  min-height: 32px;
  padding: 4px 13px;
  width: 100%;
}

.milui-save-primary {
  background: var(--navy);
  border: 1px solid var(--navy);
  color: #fff;
}

.milui-save-all {
  background: transparent;
  border: 1px solid #d9cba9;
  color: #74591f;
}

.milui-save-primary:hover:not(:disabled) {
  background: var(--navy-light);
}

.milui-save-all:hover:not(:disabled) {
  background: rgba(192, 152, 64, .08);
  border-color: #a07c2e;
}

.milui-save-primary:focus-visible,
.milui-save-all:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.milui-save-primary:disabled,
.milui-save-all:disabled {
  cursor: default;
  opacity: .55;
}

.milui-additional {
  border-top: 1px solid #e9e1d2;
  padding: 10px 18px 9px;
}

.milui-additional h3 {
  color: var(--navy);
  font-size: .73rem;
  font-weight: 650;
  margin: 0 0 3px;
}

.milui-additional__list {
  display: flex;
  flex-direction: column;
}

.milui-additional__row {
  align-items: center;
  border-top: 1px solid #eee7da;
  display: grid;
  gap: 8px 14px;
  grid-template-columns: minmax(84px, .65fr) minmax(150px, 1.8fr) minmax(170px, 1fr);
  padding: 9px 0;
}

.milui-additional__row:first-child {
  border-top: 0;
  padding-top: 6px;
}

.milui-additional__name {
  color: var(--navy);
  font-size: .76rem;
  font-weight: 700;
}

.milui-additional__spelling {
  color: var(--navy-light);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .84rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.milui-additional__values {
  align-items: center;
  display: flex;
  gap: 15px;
  justify-content: flex-end;
}

.milui-additional__metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 66px;
}

.milui-additional__metric span {
  color: var(--text-secondary);
  font-size: .61rem;
  white-space: nowrap;
}

.milui-additional__metric strong {
  color: #806221;
  font-size: .72rem;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  white-space: nowrap;
}

.milui-variants {
  border-top: 1px solid var(--border);
  max-height: min(62vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.milui-variant-options button:focus-visible,
.milui-variant-save:focus-visible,
.milui-inline-settings:focus-visible,
.milui-detail-trigger:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

.milui-variant-composer {
  background: #fdfbf6;
  border-top: 1px solid #f1eadc;
  padding: 12px 18px 14px;
}

.milui-advanced-heading {
  align-items: center;
  background: #fdfbf6;
  border-bottom: 1px solid #f1eadc;
  color: var(--text-secondary);
  display: flex;
  font-size: .76rem;
  font-weight: 650;
  justify-content: space-between;
  padding: 10px 18px;
}

.milui-inline-settings {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: .72rem;
  padding: 3px 0;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.milui-inline-settings:hover {
  color: var(--navy);
}

.milui-variant-rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.milui-variant-section-label {
  color: var(--text-secondary);
  font-size: .72rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.milui-variant-row {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(42px, auto) 1fr;
}

.milui-variant-letter {
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .92rem;
  font-weight: 700;
  white-space: nowrap;
}

.milui-variant-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.milui-variant-options button {
  align-items: center;
  background: #fff;
  border: 1px solid #ded5c4;
  border-radius: 8px;
  color: var(--navy);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: .78rem;
  font-weight: 600;
  gap: 4px;
  min-height: 34px;
  padding: 5px 10px;
}

.milui-variant-options button:hover {
  border-color: var(--gold);
}

.milui-variant-options button[aria-checked="true"] {
  background: var(--gold-light);
  border-color: var(--gold);
  box-shadow: inset 0 -2px 0 var(--gold);
}

.milui-variant-option__mark {
  color: #765812;
  opacity: 0;
  width: 0;
}

.milui-variant-options button[aria-checked="true"] .milui-variant-option__mark {
  opacity: 1;
  width: auto;
}

.milui-selected-result {
  border-top: 1px solid #e9e0cf;
  margin-top: 13px;
  padding-top: 11px;
}

.milui-selected-result__value {
  color: var(--navy);
  font-size: 1.35rem;
  font-weight: 700;
  margin-top: 2px;
}

.milui-selected-result__spelling {
  color: var(--text-secondary);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .82rem;
  line-height: 1.6;
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.milui-variant-save {
  background: var(--navy);
  border: 1px solid var(--navy);
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: .78rem;
  font-weight: 700;
  margin-top: 11px;
  min-height: 36px;
  padding: 6px 14px;
}

.milui-variant-save:disabled {
  cursor: default;
  opacity: .65;
}

.milui-variant-feedback {
  color: #3f6846;
  font-size: .75rem;
  margin: 7px 0 0;
}

.milui-variant-feedback--error {
  color: #9b2c2c;
}

.havayah-milui {
  border-top: 1px solid var(--border);
  padding: 11px 18px 12px;
}

.havayah-milui h3 {
  color: var(--text-secondary);
  font-size: .76rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.havayah-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.havayah-options button {
  align-items: center;
  background: #fffdf8;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--navy);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: .8rem;
  font-weight: 600;
  gap: 5px;
  justify-content: center;
  min-height: 34px;
  padding: 5px 8px;
}

.havayah-options button:hover,
.havayah-options button:focus-visible {
  border-color: var(--gold);
  background: #fbf8f1;
}

.havayah-options button:focus-visible {
  outline: 2px solid var(--navy);
  outline-offset: 2px;
}

.havayah-options button[aria-pressed="true"] {
  background: var(--gold-light);
  border-color: var(--gold);
  box-shadow: inset 0 -2px 0 var(--gold);
  font-weight: 700;
}

.havayah-option__dot {
  color: #d4c9b0;
  font-weight: 300;
}

.havayah-spelling {
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .96rem;
  line-height: 1.65;
  padding-top: 8px;
  text-align: right;
}

.milui-details {
  border-top: 1px solid var(--border);
}

.milui-detail-trigger {
  align-items: center;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: .78rem;
  font-weight: 600;
  justify-content: space-between;
  padding: 10px 18px;
  text-align: right;
  width: 100%;
}

.milui-detail-trigger:hover {
  background: #fafaf6;
  color: var(--navy);
}

.milui-details > summary,
.milui-word > summary {
  cursor: pointer;
  list-style: none;
}

.milui-details > summary::-webkit-details-marker,
.milui-word > summary::-webkit-details-marker {
  display: none;
}

.milui-details > summary {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  font-size: .8rem;
  font-weight: 600;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 18px;
}

.milui-summary-chevron {
  color: var(--gold);
  height: 8px;
  width: 8px;
}

.milui-details[open] > summary .milui-summary-chevron,
.milui-word[open] > summary .milui-summary-chevron {
  transform: translateY(15%) rotate(225deg);
}

.milui-details > summary:hover,
.milui-word > summary:hover {
  background: #fafaf6;
}

.milui-word-list {
  border-top: 1px solid #f2ede4;
}

.milui-word {
  border-bottom: 1px solid #f2ede4;
}

.milui-word:last-child {
  border-bottom: 0;
}

.milui-word > summary {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 18px;
}

.milui-word-name {
  color: var(--navy);
  font-weight: 600;
}

.milui-word-total {
  color: var(--gold);
  font-size: .84rem;
  font-weight: 600;
  margin-inline-start: auto;
}

.milui-word-expanded {
  background: #fdfaf5;
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .98rem;
  line-height: 1.7;
  padding: 7px 18px;
}

.milui-letter-list {
  background: #fdfaf5;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px 18px 12px;
}

.milui-letter {
  align-items: baseline;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: .8rem;
  gap: 7px;
}

.milui-letter__original {
  color: var(--navy);
  font-size: 1rem;
  font-weight: 700;
  min-width: 20px;
}

.milui-letter__arrow {
  color: #d4c9b0;
}

.milui-letter__spelling {
  color: var(--navy-light);
  font-weight: 600;
}

.milui-letter__values {
  color: var(--text-secondary);
  font-size: .75rem;
}

.sr-only {
  height: 1px;
  margin: -1px;
  overflow: hidden;
  position: absolute;
  width: 1px;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 480px) {
  .milui-panel__header {
    align-items: flex-start;
  }

  .milui-settings-link {
    font-size: .72rem;
  }

  .milui-total-row {
    justify-content: flex-start;
  }

  .milui-primary-result {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .milui-save-actions {
    align-items: stretch;
    flex-direction: row;
    justify-content: flex-start;
    min-width: 0;
    padding: 0;
  }

  .milui-save-primary,
  .milui-save-all {
    width: auto;
  }

  .milui-total-block {
    min-width: 0;
  }

  .milui-total-block--primary {
    padding-inline-end: 18px;
  }

  .milui-secondary-total {
    padding-inline-start: 18px;
  }

  .milui-additional__row {
    gap: 4px 10px;
    grid-template-columns: minmax(82px, auto) 1fr;
  }

  .milui-additional__spelling {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .milui-additional__values {
    gap: 10px;
    justify-content: flex-start;
  }

  .havayah-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .milui-letter__values {
    flex-basis: 100%;
    padding-inline-start: 27px;
  }

  .milui-variant-row {
    align-items: flex-start;
    grid-template-columns: 1fr;
    gap: 5px;
  }
}

/* Approved primary-flow treatment: the common forms are quiet, tactile
   selection rows rather than competing result cards. */
.milui-additional {
  background: #fbf8f0;
  border-top-color: #e4dac6;
  padding: 16px 18px 14px;
}

.milui-additional__heading {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 10px;
}

.milui-additional h3 {
  color: var(--navy);
  font-size: .82rem;
  letter-spacing: .015em;
  margin: 0;
}

.milui-additional__heading p {
  color: var(--text-secondary);
  font-size: .68rem;
  margin: 3px 0 0;
}

.milui-additional__tools {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.milui-select-all {
  background: transparent;
  border: 0;
  color: #74591f;
  cursor: pointer;
  font: inherit;
  font-size: .66rem;
  font-weight: 700;
  padding: 4px 2px;
  text-decoration: underline;
  text-decoration-color: rgba(116, 89, 31, .35);
  text-underline-offset: 3px;
}

.milui-select-all:hover {
  color: var(--navy);
  text-decoration-color: currentColor;
}

.milui-select-all:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.milui-selection-count {
  background: #f0e9d9;
  border: 1px solid #e1d4b9;
  border-radius: 999px;
  color: #725821;
  direction: ltr;
  font-size: .65rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
  padding: 5px 8px;
  white-space: nowrap;
}

.milui-selection-count--full {
  background: #eadbb8;
  border-color: #c09840;
}

.milui-additional__list {
  gap: 6px;
}

.milui-additional__row {
  align-items: center;
  background: rgba(255, 253, 248, .84);
  border: 1px solid #e4dbca;
  border-radius: 8px;
  color: inherit;
  cursor: pointer;
  display: grid;
  gap: 4px 10px;
  grid-template-columns: 16px minmax(114px, .62fr) minmax(150px, 1.55fr) minmax(170px, 1fr);
  padding: 8px 10px;
  text-align: right;
  transition: background .16s ease, border-color .16s ease, opacity .16s ease, transform .16s ease;
  width: 100%;
}

.milui-additional__row:first-child {
  border-top: 1px solid #e4dbca;
  padding-top: 8px;
}

.milui-additional__row:hover:not(:disabled) {
  background: #fffdf8;
  border-color: #c6a866;
  transform: translateY(-1px);
}

.milui-additional__row:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.milui-additional__row--selected {
  background: #f4ecd8;
  border-color: #b68b35;
  box-shadow: inset 3px 0 0 #b68b35;
}

.milui-additional__row--selected:hover {
  background: #f1e6ca;
}

.milui-additional__row:disabled:not(.milui-additional__row--selected) {
  cursor: not-allowed;
  opacity: .43;
}

.milui-additional__check {
  align-items: center;
  border: 1px solid #cdbf9f;
  border-radius: 4px;
  display: inline-flex;
  height: 15px;
  justify-content: center;
  width: 15px;
}

.milui-additional__check::after {
  border-bottom: 1.5px solid #fffdf8;
  border-inline-end: 1.5px solid #fffdf8;
  content: '';
  height: 7px;
  opacity: 0;
  transform: rotate(45deg) translate(-1px, -1px);
  width: 3px;
}

.milui-additional__row--selected .milui-additional__check {
  background: #9a7428;
  border-color: #9a7428;
}

.milui-additional__row--selected .milui-additional__check::after {
  opacity: 1;
}

.milui-additional__name {
  color: var(--navy);
  font-size: .74rem;
  font-weight: 700;
}

.milui-additional__spelling {
  color: #596273;
  font-size: .78rem;
  line-height: 1.4;
}

.milui-additional__values {
  align-items: center;
  display: flex;
  gap: 14px;
  justify-content: flex-end;
}

.milui-additional__metric {
  gap: 1px;
  min-width: 64px;
}

.milui-additional__metric span {
  font-size: .58rem;
}

.milui-additional__metric strong {
  color: #775c25;
  font-size: .68rem;
}

.milui-additional__actions {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: flex-start;
  margin-top: 10px;
}

.milui-additional__actions .milui-save-primary {
  min-height: 30px;
  width: auto;
}

.milui-save-selected,
.milui-clear-selected {
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-size: .7rem;
  font-weight: 700;
  min-height: 29px;
  padding: 4px 10px;
  transition: background .16s ease, border-color .16s ease, color .16s ease, opacity .16s ease;
}

.milui-save-selected {
  background: transparent;
  border: 1px solid #b9a06a;
  color: #765b21;
  width: auto;
}

.milui-save-selected:hover:not(:disabled) {
  background: #f4ecda;
  border-color: #967328;
}

.milui-clear-selected {
  background: transparent;
  border: 1px solid #d8ccb5;
  color: #746c5d;
}

.milui-clear-selected:hover:not(:disabled) {
  background: #f5efe3;
  border-color: #bca97f;
  color: var(--navy);
}

.milui-save-selected:focus-visible,
.milui-clear-selected:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.milui-save-selected:disabled,
.milui-clear-selected:disabled {
  cursor: default;
  opacity: .42;
}

@media (max-width: 640px) {
  .milui-additional {
    padding-inline: 13px;
  }

  .milui-additional__row {
    grid-template-columns: 16px 1fr auto;
    gap: 3px 8px;
    padding: 9px;
  }

  .milui-additional__name {
    grid-column: 2;
    grid-row: 1;
  }

  .milui-additional__spelling {
    grid-column: 2 / -1;
    grid-row: 2;
  }

  .milui-additional__values {
    grid-column: 3;
    grid-row: 1;
  }

  .milui-additional__metric:nth-child(2) {
    display: none;
  }
}
</style>