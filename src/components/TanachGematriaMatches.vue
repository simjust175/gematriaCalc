<template>
  <section class="gematria-discovery" dir="rtl" aria-labelledby="matches-title">
    <header class="discovery-header">
      <div class="heading-block">
        <span class="section-kicker">{{ sourceKicker }}</span>
        <div class="title-line">
          <h2 id="matches-title">{{ discoveryHeading }}</h2>
        </div>
        <div class="header-meta">
          <p>{{ discoveryDescription }}</p>
          <p v-if="source !== 'tefillot' || tefillotAvailable" class="total-mark" aria-live="polite">
            <strong>{{ allTotal.toLocaleString('he-IL') }}</strong>
            <span>התאמות</span>
          </p>
          <div v-if="source === 'all'" class="source-breakdown" aria-label="התאמות לפי מקור">
            <span><span class="mdi mdi-book-open-variant-outline" aria-hidden="true"></span> תנ״ך <b>{{ sourceCounts.tanach.toLocaleString('he-IL') }}</b></span>
            <span><span class="mdi mdi-hands-pray" aria-hidden="true"></span> תפילות <b>{{ tefillotAvailable ? sourceCounts.tefillot.toLocaleString('he-IL') : 'בקרוב' }}</b></span>
          </div>
        </div>
      </div>
    </header>

    <div class="controls" role="toolbar" aria-label="סינון התאמות">
      <div class="source-context-row">
        <div class="context-stage">
          <Transition name="filter-swap" mode="out-in">
            <div v-if="source === 'tanach'" key="tanach" class="controls-primary-row">
              <div class="manual-range">
                <TanachScopeSelect
                  :model-value="bookOrder"
                  label="ספר"
                  :groups="bookGroups"
                  :empty-label="rangeMetadataLoading ? 'טוען…' : 'כל התנ״ך'"
                  :disabled="rangeMetadataLoading || !!rangeMetadataError"
                  @update:model-value="selectBook"
                />
                <TanachScopeSelect
                  v-if="isTorahBook"
                  :model-value="parshaId"
                  label="פרשה"
                  :groups="[{ options: parshaOptions }]"
                  empty-label="כל הפרשיות"
                  @update:model-value="setParshaId"
                />
                <TanachScopeSelect
                  v-else-if="isNachBook"
                  :model-value="chapterValue"
                  label="פרק"
                  :groups="[{ options: chapterOptions }]"
                  empty-label="כל הפרקים"
                  @update:model-value="selectChapter"
                />
                <TanachScopeSelect
                  v-if="isNachBook && chapter"
                  :model-value="verse"
                  label="פסוק"
                  :groups="[{ options: verseOptions }]"
                  :empty-label="chapterVersesLoading ? 'טוען…' : 'כל הפסוקים'"
                  :disabled="chapterVersesLoading"
                  @update:model-value="setVerse"
                />
              </div>
              <button
                type="button"
                class="parshah-filter"
                :class="{ active: currentParshah }"
                :aria-pressed="currentParshah"
                @click="toggleCurrentParshah"
              >
                <span class="mdi mdi-book-open-page-variant-outline" aria-hidden="true"></span>
                <span class="parshah-filter-copy">
                  <span class="parshah-filter-label">פרשת השבוע</span>
                  <span v-if="weeklyParshah" class="parshah-filter-name">
                    {{ weeklyParshah.nameHe }}<template v-if="currentParshah"> · {{ total.toLocaleString('he-IL') }} התאמות</template>
                  </span>
                </span>
              </button>
            </div>
            <div v-else-if="source === 'tefillot'" key="tefillot" class="tefillot-filter-row">
              <template v-if="tefillotAvailable">
                <label>מועד
                  <select v-model="tefillotOccasion">
                    <option value="">כל המועדים</option>
                    <option v-for="item in tefillotOccasionOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
                <label>תפילה
                  <select v-model="tefillotService">
                    <option value="">כל התפילות</option>
                    <option v-for="item in tefillotServiceOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                  </select>
                </label>
              </template>
              <template v-else>
                <span class="mdi mdi-hands-pray" aria-hidden="true"></span>
                <span>חיפוש בתפילות ייפתח בקרוב</span>
              </template>
            </div>
            <button
              v-else
              key="all"
              type="button"
              class="parshah-filter combined-parshah-filter"
              :class="{ active: currentParshah }"
              :aria-pressed="currentParshah"
              @click="toggleCurrentParshah"
            >
              <span class="mdi mdi-book-open-page-variant-outline" aria-hidden="true"></span>
              <span class="parshah-filter-copy">
                <span class="parshah-filter-label">פרשת השבוע</span>
                <span v-if="weeklyParshah" class="parshah-filter-name">
                  {{ weeklyParshah.nameHe }}<template v-if="currentParshah"> · {{ total.toLocaleString('he-IL') }} התאמות</template>
                </span>
              </span>
            </button>
          </Transition>
        </div>
        <div class="source-selector" :class="`source-selector--${source}`" role="group" aria-label="מקור החיפוש">
          <button
            v-for="item in sourceOptions"
            :key="item.value"
            type="button"
            :class="{ active: source === item.value }"
            :aria-pressed="source === item.value"
            @click="source = item.value"
          >
            <span class="mdi" :class="item.icon" aria-hidden="true"></span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
      <div class="controls-secondary-row">
        <button
          v-if="method === 'gematria'"
          type="button"
          class="kollel-toggle"
          :class="{ active: includeKollel }"
          role="switch"
          :aria-checked="includeKollel"
          :aria-busy="loading"
          @click="setIncludeKollel(!includeKollel)"
        >
          <span>כולל</span>
          <span class="kollel-indicator" aria-hidden="true">
            <span v-if="loading" class="mdi mdi-loading mdi-spin"></span>
            <span v-else-if="includeKollel" class="mdi mdi-check"></span>
          </span>
        </button>
        <div v-if="method === 'gematria'" class="filter-list" role="group" aria-label="סוג התאמה">
          <button
            v-for="item in filterOptions"
            :key="item.value"
            type="button"
            :class="{ active: filter === item.value }"
            :aria-pressed="filter === item.value"
            @click="setFilter(item.value)"
          >
            {{ item.label }}
            <span>{{ counts[item.value] || 0 }}</span>
          </button>
        </div>
        <button
          v-if="isEdgeMethod"
          type="button"
          class="order-switch"
          role="switch"
          :aria-checked="orderIndependent"
          :class="{ active: orderIndependent }"
          @click="orderIndependent = !orderIndependent"
        >
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          <span class="order-switch-copy">
            <span>אותן אותיות בכל סדר</span>
            <small>כולל סדר שונה</small>
          </span>
        </button>
        <div class="method-selector" role="group" aria-label="חיפוש לפי">
          <button v-for="item in methodOptions" :key="item.value" type="button"
            :class="{ active: method === item.value }" :aria-pressed="method === item.value"
            :aria-label="item.label"
            :disabled="item.value !== 'gematria' && !hasPattern" @click="method = item.value">
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
    </div>
    <p v-if="source === 'tanach' && (rangeMetadataError || chapterVersesError)" class="range-filter-error" role="status">{{ rangeMetadataError || chapterVersesError }}</p>
    <p v-if="source === 'tanach' && weeklyParshah" class="parshah-note">
      פרשת השבוע: <strong>{{ weeklyParshah.nameHe }}</strong>
      <span v-if="currentParshah"> · {{ total.toLocaleString('he-IL') }} התאמות</span>
    </p>
    <p v-else-if="source === 'tanach' && manualScopeLabel" class="scope-note">מציג התאמות ב{{ manualScopeLabel }}</p>
    <p v-if="source === 'all' && !tefillotAvailable" class="tefillot-coming-soon-note" role="note">
      <span class="mdi mdi-information-slab-circle-outline" aria-hidden="true"></span>
      כרגע מוצגות תוצאות מהתנ״ך. תוצאות מתפילות יתווספו בקרוב.
    </p>
    <p v-if="sourceWarning" class="range-filter-error" role="status">{{ sourceWarning }}</p>

    <button
      v-if="results.length && !error"
      type="button"
      class="selection-mode-toggle"
      :aria-pressed="selectionMode"
      @click="toggleSelectionMode"
    >
      {{ selectionMode ? 'סיום בחירה מרובה' : 'בחירה מרובה' }}
    </button>
    <div v-if="source === 'tefillot' && !tefillotAvailable" class="state-card coming-soon-state" role="status">
      <div class="coming-soon-emblem" aria-hidden="true">
        <span class="coming-soon-emblem-ring"></span>
        <span class="mdi mdi-hands-pray"></span>
      </div>
      <div class="coming-soon-copy">
        <span class="coming-soon-eyebrow">בקרוב במחשבון</span>
        <strong>תפילות — בקרוב</strong>
        <span>חיפוש והתאמות בתפילות יתווספו בקרוב.</span>
      </div>
      <span class="coming-soon-rule" aria-hidden="true"></span>
    </div>
    <div v-else-if="loading && !results.length" class="match-grid" aria-label="טוען התאמות" aria-busy="true">
      <article v-for="n in 3" :key="n" class="match-card skeleton-card">
        <span class="skeleton-line short"></span><span class="skeleton-line"></span>
        <span class="skeleton-line wide"></span>
      </article>
    </div>
    <div v-else-if="error" class="state-card error-state" role="alert">
      <span class="mdi mdi-alert-circle-outline" aria-hidden="true"></span>
      <strong>{{ error }}</strong>
      <button type="button" @click="retry">לנסות שוב</button>
    </div>
    <div v-else-if="!results.length" class="state-card empty-state">
      <span class="empty-rule" aria-hidden="true"></span>
      <strong>{{ currentParshah ? 'אין התאמות בפרשת השבוע' : manualScopeLabel ? `אין התאמות ב${manualScopeLabel}` : 'לא נמצאו התאמות מהסוג הזה' }}</strong>
      <span>{{ currentParshah ? 'אפשר להסיר את סינון פרשת השבוע או לבחור ספר או פרשה.' : manualScopeLabel ? 'אפשר לבחור טווח תנ״ך אחר או סיווג התאמה אחר.' : 'אפשר לבחור סיווג אחר או להמשיך לחקור ערך חדש במחשבון.' }}</span>
    </div>
    <div v-else class="match-grid" aria-live="polite">
      <article v-for="(result, index) in results" :key="resultKey(result)" class="match-card" :class="{
        'curated-selected-card': selectedKeys.has(resultKey(result)) && (result.sourceType !== 'tefillot' || selectionMode),
        'curated-saved-card': result.sourceType === 'tefillot' && curatedSavedKeys.has(curatedStateKey(result)),
      }">
        <div class="card-topline">
          <div class="card-labels">
            <span class="source-badge" :class="`source-badge--${result.sourceType}`">
              <span class="mdi" :class="result.sourceType === 'tefillot' ? 'mdi-hands-pray' : 'mdi-book-open-variant-outline'" aria-hidden="true"></span>
              {{ result.sourceType === 'tefillot' ? 'תפילות' : 'תנ״ך' }}
            </span>
            <span class="type-label">{{ typeLabel(result.type) }}</span>
          </div>
          <span class="match-index">{{ String(index + 1).padStart(2, '0') }}</span>
        </div>
        <div class="citation">
          <strong>{{ citation(result) }}</strong>
        </div>
        <p class="context-text">
          <span v-if="result.beforeText" class="muted-text">{{ result.beforeText }}</span>
          <template v-if="isEdgeMethod">
            <template v-for="(part, partIndex) in highlightedParts(result.text)" :key="partIndex">
              <template v-if="part.segments">
                <template v-for="(segment, segmentIndex) in part.segments" :key="segmentIndex">
                  <mark v-if="segment.derivedHighlighted" class="edge-highlight">{{ segment.text }}</mark>
                  <span v-else>{{ segment.text }}</span>
                </template>
              </template>
              <span v-else>{{ part.text }}</span>
            </template>
          </template>
          <mark v-else>{{ result.text }}</mark>
          <span v-if="result.afterText" class="muted-text">{{ result.afterText }}</span>
        </p>
        <footer class="card-actions">
          <button type="button" class="reader-action" @click="openResult(result)">
            <span class="mdi mdi-book-open-page-variant-outline" aria-hidden="true"></span>
            פתח בקורא
          </button>
          <button
            type="button"
            class="save-action"
            :class="{ saved: savedKeys.has(canonicalSourceKey(result)), saving: savingKey === resultKey(result) }"
            :disabled="savingKey === resultKey(result) || savedKeys.has(canonicalSourceKey(result))"
            @click="saveResult(result, resultKey(result))"
          >
            <span class="mdi" :class="savedKeys.has(canonicalSourceKey(result)) ? 'mdi-bookmark-check-outline' : 'mdi-bookmark-outline'" aria-hidden="true"></span>
            {{ savedKeys.has(canonicalSourceKey(result)) ? 'נשמר' : 'שמור טווח' }}
          </button>
          <button
            type="button"
            class="curated-action"
            :class="{ selected: (selectedKeys.has(resultKey(result)) && (result.sourceType !== 'tefillot' || selectionMode)) || curatedSavedKeys.has(curatedStateKey(result)), saved: curatedSavedKeys.has(curatedStateKey(result)) }"
            :disabled="curatedSavedKeys.has(curatedStateKey(result)) || (result.sourceType === 'tefillot' && !selectionMode && curatedSaving)"
            :aria-pressed="selectedKeys.has(resultKey(result)) && (result.sourceType !== 'tefillot' || selectionMode)"
            :aria-busy="result.sourceType === 'tefillot' && tefillotSavingKey === curatedStateKey(result) ? true : undefined"
            @click="selectionMode ? toggleCuratedSelection(result) : saveCuratedSingle(result)"
          >
            <span class="mdi" :class="curatedSavedKeys.has(curatedStateKey(result)) ? 'mdi-bookmark-check' : 'mdi-bookmark-plus-outline'" aria-hidden="true"></span>
            {{ curatedButtonLabel(result) }}
          </button>
        </footer>
        <span v-if="saveErrors.has(resultKey(result))" class="save-error" role="status">{{ savedRangeMessage || 'לא ניתן לשמור כרגע' }}</span>
        <span v-if="result.sourceType === 'tefillot' && tefillotMatchErrors.has(curatedStateKey(result))" class="save-error" role="alert">{{ tefillotMatchErrors.get(curatedStateKey(result)) }}</span>
      </article>
    </div>
    <div v-if="selectedKeys.size" class="curated-save-bar" role="status">
      <span>{{ selectedKeys.size }} התאמות נבחרו</span>
      <button type="button" :disabled="curatedSaving" @click="saveCuratedMatches">
        {{ curatedSaving ? 'שומר…' : 'שמור התאמות נבחרות' }}
      </button>
      <button type="button" class="cancel-curated" :disabled="curatedSaving" @click="clearCuratedSelection">ביטול</button>
    </div>
    <p v-if="curatedMessage" class="curated-message" :class="{ error: curatedError }" role="status">{{ curatedMessage }}</p>

    <div v-if="loading && results.length" class="loading-note" role="status">טוען עוד התאמות…</div>
    <button v-if="hasMore && !loading" type="button" class="load-more" @click="loadMore">
      הצג התאמות נוספות <span class="mdi mdi-arrow-down" aria-hidden="true"></span>
    </button>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useTanachGematriaMatches } from '@/composables/useTanachGematriaMatches.js';
import { computeAll, normalize, toHebrewNumber } from '@/composables/useGematria.js';
import { mapFinalsToOriginalText, mapInitialsToOriginalText } from '@/utils/initialsHighlight.js';
import { savedRangeKey, tanachContextOf, tefillotContextOf } from '@/utils/tefillotContext.js';
import TanachScopeSelect from './TanachScopeSelect.vue';

const props = defineProps({
  target: { type: Number, required: true },
  pattern: { type: String, default: '' },
  sourceText: { type: String, default: '' },
});
const emit = defineEmits(['open', 'openTefillot', 'saved']);
const savedKeys = ref(new Set());
const saveErrors = ref(new Set());
const savingKey = ref('');
const savedRangeMessage = ref('');
const selectedKeys = ref(new Set());
const curatedSavedKeys = ref(new Set());
const selectionMode = ref(false);
const curatedSaving = ref(false);
const tefillotSavingKey = ref('');
const tefillotMatchErrors = ref(new Map());
const curatedMessage = ref('');
const curatedError = ref(false);
const rangeMetadata = ref({ canonicalBooks: [], parshiot: [] });
const rangeMetadataLoading = ref(true);
const rangeMetadataError = ref('');
const chapterVerses = ref([]);
const chapterVersesLoading = ref(false);
const chapterVersesError = ref('');
let chapterRequestId = 0;
let curatedStateRequestId = 0;
let curatedStateTimer;
let rangeStateRequestId = 0;
const filterOptions = computed(() => [
  { value: 'all', label: 'הכול' },
  { value: 'whole_word', label: 'מילה שלמה' },
  { value: 'whole_phrase', label: 'מילים שלימות' },
  ...(source.value !== 'tefillot' && method.value === 'gematria'
    ? [{ value: 'whole_verse', label: 'פסוק שלם' }] : []),
]);
const method = ref('gematria');
const source = ref('all');
const tefillotAvailable = ref(false);
const tefillotOccasion = ref('');
const tefillotService = ref('');
const orderIndependent = ref(false);
const sourceOptions = [
  { value: 'all', label: 'הכל', icon: 'mdi-layers-triple-outline' },
  { value: 'tanach', label: 'תנ״ך', icon: 'mdi-book-open-variant-outline' },
  { value: 'tefillot', label: 'תפילות', icon: 'mdi-shawl' },
];
const tefillotOccasionOptions = [
  { value: 'weekday', label: 'חול' },
  { value: 'shabbat', label: 'שבת' },
  { value: 'festival', label: 'יום טוב' },
];
const tefillotServiceOptions = [
  { value: 'shacharit', label: 'שחרית' },
  { value: 'mincha', label: 'מנחה' },
  { value: 'maariv', label: 'ערבית' },
  { value: 'musaf', label: 'מוסף' },
  { value: 'kabbalat-shabbat', label: 'קבלת שבת' },
  { value: 'additional', label: 'תפילות נוספות' },
];
const methodOptions = [
  { value: 'gematria', label: 'גימטריה' },
  { value: 'initials', label: 'ראשי תיבות' },
  { value: 'finals', label: 'סופי תיבות' },
];
const {
  results, counts, total, sourceCounts, loading, error, sourceWarning, filter, includeKollel, bookOrder, parshaId, chapterBook, chapter, verse, currentParshah, weeklyParshah,
  hasMore, setFilter, setIncludeKollel, setBookOrder, setParshaId, setChapter, setVerse, toggleCurrentParshah, loadMore, refresh,
} =
  useTanachGematriaMatches(computed(() => props.target), {
    methodRef: method,
    sequenceRef: computed(() => props.pattern),
    orderIndependentRef: orderIndependent,
    sourceRef: source,
    tefillotOccasionRef: tefillotOccasion,
    tefillotServiceRef: tefillotService,
    tefillotAvailable,
  });

const effectiveTarget = computed(() => (
  Number(props.target || 0) + (method.value === 'gematria' && includeKollel.value ? 1 : 0)
));
const formattedTarget = computed(() => effectiveTarget.value.toLocaleString('he-IL'));
const allTotal = computed(() => Number(counts.value.all ?? total.value) || 0);
const sourceKicker = computed(() => ({
  all: 'מחקר מקורות',
  tanach: 'מחקר תנ״כי',
  tefillot: tefillotAvailable.value ? 'מחקר תפילות' : 'תפילות — בקרוב',
}[source.value]));
const hasPattern = computed(() => [...props.pattern].length >= 1);
const discoveryHeading = computed(() => {
  const suffix = source.value === 'tanach' ? ' בתנ״ך' : source.value === 'tefillot' ? ' בתפילות' : '';
  if (method.value === 'initials') return `איפה מופיעים ראשי התיבות ${props.pattern}${suffix}?`;
  if (method.value === 'finals') return `איפה מופיעים סופי התיבות ${props.pattern}${suffix}?`;
  return `איפה עוד מופיע הערך ${formattedTarget.value}${suffix}?`;
});
const discoveryDescription = computed(() => method.value === 'gematria'
  ? source.value === 'tanach'
    ? 'למצוא תיבות וצירופים בפסוקי התנ״ך העולים בגימטריא למספר המבוקש.'
    : source.value === 'tefillot'
      ? 'למצוא תיבות וצירופים בנוסח התפילות העולים בגימטריא למספר המבוקש.'
      : tefillotAvailable.value
        ? 'למצוא תיבות וצירופים בתנ״ך ובתפילות העולים בגימטריא למספר המבוקש.'
        : 'למצוא תיבות וצירופים בתנ״ך העולים בגימטריא למספר המבוקש.'
  : method.value === 'initials'
    ? `מילים רצופות הפותחות באותיות ${props.pattern}`
    : `מילים רצופות המסתיימות באותיות ${props.pattern}`);
watch(hasPattern, (valid) => {
  if (!valid && method.value !== 'gematria') method.value = 'gematria';
});
watch(source, (nextSource) => {
  if (nextSource !== 'tanach') {
    selectBook('');
  }
  if (nextSource !== 'tefillot') {
    tefillotOccasion.value = '';
    tefillotService.value = '';
  }
});
watch([method, () => props.sourceText], () => {
  selectedKeys.value = new Set();
  window.clearTimeout(curatedStateTimer);
  curatedStateTimer = window.setTimeout(syncCuratedSavedState, 250);
}, { immediate: true });
watch(results, () => {
  window.clearTimeout(curatedStateTimer);
  curatedStateTimer = window.setTimeout(() => {
    syncSavedRangeState();
    syncCuratedSavedState();
  }, 120);
}, { deep: true });
const selectedBook = computed(() => (
  rangeMetadata.value.canonicalBooks?.find(book => Number(book.order) === Number(bookOrder.value)) || null
));
const isTorahBook = computed(() => Number(selectedBook.value?.order) >= 1 && Number(selectedBook.value?.order) <= 5);
const isNachBook = computed(() => !!selectedBook.value && !isTorahBook.value);
const bookGroups = computed(() => {
  const groups = new Map();
  for (const book of rangeMetadata.value.canonicalBooks || []) {
    const section = book.section || { id: 'writings', name_he: 'כתובים' };
    if (!groups.has(section.id)) groups.set(section.id, { label: section.name_he, options: [] });
    groups.get(section.id).options.push({ value: String(book.order), label: book.name });
  }
  return [...groups.values()];
});
const allParshaOptions = computed(() => rangeMetadata.value.parshiot || []);
const parshaOptions = computed(() => allParshaOptions.value
  .filter(parsha => selectedBook.value?.segments?.some(segment => segment.slug === parsha.start_book_slug))
  .map(parsha => ({ value: parsha.id, label: parsha.name_he })));
const selectedParshaLabel = computed(() => (
  allParshaOptions.value.find(option => option.id === parshaId.value)?.name_he || ''
));
const chapterOptions = computed(() => (selectedBook.value?.segments || []).flatMap(segment => (
  Array.from({ length: Number(segment.chapter_count) || 0 }, (_, index) => {
    const chapterNumber = index + 1;
    const segmented = selectedBook.value.segments.length > 1;
    return {
      value: `${segment.slug}:${chapterNumber}`,
      label: segmented
        ? `${segment.hebrew_name} · פרק ${toHebrewNumber(chapterNumber)}`
        : `פרק ${toHebrewNumber(chapterNumber)}`,
    };
  })
)));
const chapterValue = computed(() => (chapterBook.value && chapter.value ? `${chapterBook.value}:${chapter.value}` : ''));
const verseOptions = computed(() => chapterVerses.value.map(item => ({
  value: String(item.verse),
  label: `פסוק ${toHebrewNumber(item.verse)}`,
})));
const manualScopeLabel = computed(() => {
  if (!selectedBook.value) return '';
  if (parshaId.value) return `פרשת ${selectedParshaLabel.value}`;
  if (chapter.value && verse.value) return `${selectedBook.value.name} פרק ${toHebrewNumber(chapter.value)}, פסוק ${toHebrewNumber(verse.value)}`;
  if (chapter.value) return `${selectedBook.value.name} פרק ${toHebrewNumber(chapter.value)}`;
  return `ספר ${selectedBook.value.name}`;
});

onMounted(loadRangeMetadata);
onMounted(async () => {
  try {
    const response = await fetch('/api/tefillot/availability');
    if (response.ok) tefillotAvailable.value = (await response.json()).enabled === true;
  } catch {
    // Until corpus readiness is verified, the client stays on Tanach only.
  }
});

async function syncSavedRangeState() {
  const requestId = ++rangeStateRequestId;
  const refs = results.value
    .map(item => ({ item, key: savedRangeKey(item) }))
    .filter(ref => ref.key);
  const next = new Set();
  try {
    for (let index = 0; index < refs.length; index += 50) {
      const batch = refs.slice(index, index + 50);
      const keys = batch.map(({ item }) => item.sourceType === 'tefillot'
        ? { tefillotContext: tefillotContextOf(item) }
        : { tanachContext: tanachContextOf(item) });
      const response = await fetch(`/api/entries/saved-ranges?keys=${encodeURIComponent(JSON.stringify(keys))}`);
      if (!response.ok) return;
      const payload = await response.json();
      for (const saved of payload.saved || []) next.add(saved.key);
    }
    if (requestId === rangeStateRequestId) savedKeys.value = next;
  } catch {
    // Keep saving available if background hydration fails.
  }
}

async function loadRangeMetadata() {
  rangeMetadataLoading.value = true;
  rangeMetadataError.value = '';
  try {
    const response = await fetch('/api/tanach/books');
    if (!response.ok) throw new Error('metadata');
    const data = await response.json();
    rangeMetadata.value = {
      canonicalBooks: Array.isArray(data.canonicalBooks) ? data.canonicalBooks : [],
      parshiot: Array.isArray(data.parshiot) ? data.parshiot : [],
    };
  } catch {
    rangeMetadataError.value = 'לא ניתן לטעון את רשימת החומשים והפרשיות';
  } finally {
    rangeMetadataLoading.value = false;
  }
}

function selectBook(value) {
  chapterRequestId += 1;
  chapterVerses.value = [];
  chapterVersesLoading.value = false;
  chapterVersesError.value = '';
  setBookOrder(value);
}

async function selectChapter(value) {
  const [nextBook, nextChapter] = String(value || '').split(':');
  chapterRequestId += 1;
  const requestId = chapterRequestId;
  chapterVerses.value = [];
  chapterVersesError.value = '';
  if (!nextBook || !Number(nextChapter)) {
    chapterVersesLoading.value = false;
    setChapter('', 0);
    return;
  }

  const chapterNumber = Number(nextChapter);
  setChapter(nextBook, chapterNumber);
  chapterVersesLoading.value = true;
  try {
    const response = await fetch(`/api/tanach/verses?book=${encodeURIComponent(nextBook)}&chapter=${chapterNumber}`);
    if (!response.ok) throw new Error('verses');
    const data = await response.json();
    if (requestId !== chapterRequestId) return;
    chapterVerses.value = Array.isArray(data.verses) ? data.verses : [];
  } catch {
    if (requestId === chapterRequestId) {
      chapterVerses.value = [];
      chapterVersesError.value = 'לא ניתן לטעון את פסוקי הפרק';
    }
  } finally {
    if (requestId === chapterRequestId) chapterVersesLoading.value = false;
  }
}

function typeLabel(type) {
  if (method.value === 'initials') return 'ראשי תיבות';
  if (method.value === 'finals') return 'סופי תיבות';
  return { whole_word: 'מילה אחת', whole_phrase: 'מילים שלימות', partial: 'חלק ממילה' }[type] || 'התאמה';
}
function citation(item) {
  if (item.sourceType === 'tefillot') {
    return [item.occasionLabel, item.serviceLabel, item.sectionLabel].filter(Boolean).join(' · ');
  }
  const book = item.bookName || item.book || item.bookSlug || '';
  return `${book} ${toHebrewNumber(item.chapter)}:${toHebrewNumber(item.verse)}`.trim();
}
const isEdgeMethod = computed(() => method.value === 'initials' || method.value === 'finals');
function highlightedParts(text) {
  const parts = method.value === 'finals'
    ? mapFinalsToOriginalText(text, props.pattern)
    : mapInitialsToOriginalText(text, props.pattern);
  return parts || [{ text, segments: null }];
}
function resultKey(item) {
  return `${item.sourceType || 'tanach'}:${item.id || savedRangeKey(item) || `${item.bookSlug || item.book || ''}-${item.chapter}-${item.verse}-${item.start}-${item.end}`}`;
}
function canonicalSourceKey(item) {
  return savedRangeKey(item) || `manual:${resultKey(item)}`;
}
function openResult(item) {
  if (item.sourceType === 'tefillot') emit('openTefillot', item);
  else emit('open', item);
}
function reasonCode() {
  return {
    gematria: 'full_gematria',
    initials: 'initials_text',
    finals: 'finals_text',
  }[method.value] || 'full_gematria';
}
function curatedStateKey(item, savedReason = reasonCode(), parentText = props.sourceText) {
  return `${parentText}\u0000${savedReason}\u0000${canonicalSourceKey(item)}`;
}
async function syncCuratedSavedState() {
  const parentText = props.sourceText;
  const requestId = ++curatedStateRequestId;
  if (!parentText.trim()) {
    curatedSavedKeys.value = new Set();
    return;
  }
  try {
    const params = new URLSearchParams({
      search: parentText, parentOriginalText: parentText, limit: '100', offset: '0',
    });
    const response = await fetch(`/api/entries?${params}`);
    if (!response.ok) return;
    const payload = await response.json();
    if (requestId !== curatedStateRequestId || parentText !== props.sourceText) return;
    const normalizedParent = computeAll(parentText)?.normalizedText || normalize(parentText);
    const parent = (payload.entries || []).find(entry =>
       !entry.tanach_book_slug && !tefillotContextOf(entry)
       && !['tanach', 'tefillot'].includes(entry.sourceType || entry.source_type)
      && entry.normalized_text === normalizedParent
    );
    if (!parent) {
      curatedSavedKeys.value = new Set();
      return;
    }
    const hydrated = new Set();
    for (const match of parent.curated_matches || []) {
      for (const savedReason of match.reasonCodes || match.reason_codes || []) {
        hydrated.add(curatedStateKey(match, savedReason, parentText));
      }
    }
    curatedSavedKeys.value = hydrated;
  } catch {
    // Saving remains available if the background saved-state check fails.
  }
}
function toggleCuratedSelection(item) {
  const key = resultKey(item);
  const next = new Set(selectedKeys.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  selectedKeys.value = next;
}
function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value;
  if (!selectionMode.value) clearCuratedSelection();
}
function clearCuratedSelection() {
  selectedKeys.value = new Set();
}
async function saveCuratedSingle(item) {
  if (curatedSaving.value) return;
  if (curatedSavedKeys.value.has(curatedStateKey(item))) return;
  if (item.sourceType === 'tefillot') {
    const key = curatedStateKey(item);
    tefillotSavingKey.value = key;
    tefillotMatchErrors.value = new Map([...tefillotMatchErrors.value].filter(([savedKey]) => savedKey !== key));
    // A single save is a request, not a bulk-selection gesture.
    selectedKeys.value = new Set([...selectedKeys.value].filter(savedKey => savedKey !== resultKey(item)));
    try {
      if (!await saveCuratedMatches([item])) {
        tefillotMatchErrors.value = new Map([...tefillotMatchErrors.value, [key, curatedMessage.value]]);
      }
    } finally {
      tefillotSavingKey.value = '';
    }
    return;
  }
  selectedKeys.value = new Set([resultKey(item)]);
  await saveCuratedMatches();
}
function curatedButtonLabel(item) {
  if (curatedSavedKeys.value.has(curatedStateKey(item))) return 'נשמרה';
  if (item.sourceType === 'tefillot') {
    if (tefillotSavingKey.value === curatedStateKey(item)) return 'שומר…';
    return selectionMode.value && selectedKeys.value.has(resultKey(item)) ? 'נבחרה' : 'שמור התאמה';
  }
  return selectedKeys.value.has(resultKey(item)) ? 'נבחרה' : 'שמור התאמה';
}
function prayerMatchSaveError(code) {
  return {
    tefillot_save_schema_required: 'שמירת תפילות דורשת עדכון מסד הנתונים. יש להפעיל את מיגרציית התפילות.',
    tefillot_unavailable: 'שמירת תפילות אינה זמינה כרגע. נסו שוב מאוחר יותר.',
    invalid_parent: 'לא ניתן לשמור בלי חישוב תקין. הזינו טקסט עברי או מספר תקין.',
    invalid_tefillot_context: 'מקור התפילה אינו תקין. רעננו את ההתאמות ונסו שוב.',
    tefillot_range_mismatch: 'טווח התפילה אינו תואם למקור. רעננו את ההתאמות ונסו שוב.',
    unauthorized: 'פג תוקף הכניסה. היכנסו שוב כדי לשמור.',
  }[code] || 'לא ניתן לשמור את ההתאמה כרגע. נסו שוב.';
}
async function saveCuratedMatches(explicitMatches = null) {
  const chosen = Array.isArray(explicitMatches)
    ? explicitMatches : results.value.filter(item => selectedKeys.value.has(resultKey(item)));
  if (!chosen.length || curatedSaving.value) return;
  const savedReason = reasonCode();
  const savedParentText = props.sourceText;
  curatedSaving.value = true;
  curatedMessage.value = '';
  curatedError.value = false;
  try {
    const response = await fetch('/api/entries/curated-matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parentOriginalText: props.sourceText,
        matches: chosen.map(item => ({
          originalText: item.text,
          ...(item.sourceType === 'tefillot'
            ? { tefillotContext: tefillotContextOf(item) }
            : { tanachContext: tanachContextOf(item) }),
          reasonCode: savedReason,
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || (chosen.some(item => item.sourceType === 'tefillot') && payload.success !== true)) {
      throw new Error(payload.error || 'save');
    }
    curatedStateRequestId += 1;
    const savedKeysNow = new Set(curatedSavedKeys.value);
    chosen.forEach(item => savedKeysNow.add(curatedStateKey(item, savedReason, savedParentText)));
    curatedSavedKeys.value = savedKeysNow;
    curatedMessage.value = payload.parentCreated
      ? (chosen.length > 1 ? 'החישוב וההתאמות נשמרו.' : 'החישוב וההתאמה נשמרו.')
      : (chosen.length > 1 ? 'ההתאמות נשמרו.' : 'ההתאמה נשמרה.');
    if (!Array.isArray(explicitMatches)) selectedKeys.value = new Set();
    return true;
  } catch (error) {
    curatedError.value = true;
    curatedMessage.value = chosen.some(item => item.sourceType === 'tefillot')
      ? prayerMatchSaveError(error.message)
      : error.message === 'tefillot_save_schema_required'
      ? 'שמירת תפילות דורשת עדכון מסד הנתונים. יש להפעיל את מיגרציית התפילות.'
      : 'לא ניתן לשמור את ההתאמות כרגע';
    return false;
  } finally {
    curatedSaving.value = false;
  }
}
function retry() {
  refresh();
}
async function saveResult(item, key) {
  if (savingKey.value) return;
  savingKey.value = key;
  savedRangeMessage.value = '';
  saveErrors.value = new Set([...saveErrors.value].filter(item => item !== key));
  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: item.text,
        ...(item.sourceType === 'tefillot'
          ? { tefillotContext: tefillotContextOf(item) }
          : { tanachContext: tanachContextOf(item) }),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 409) throw new Error(payload.error || 'save');
    rangeStateRequestId += 1;
    savedKeys.value = new Set([...savedKeys.value, canonicalSourceKey(item)]);
    emit('saved', item);
  } catch (error) {
    saveErrors.value = new Set([...saveErrors.value, key]);
    savedRangeMessage.value = error.message === 'tefillot_save_schema_required'
      ? 'שמירת תפילות דורשת עדכון מסד הנתונים. יש להפעיל את מיגרציית התפילות.'
      : '';
  } finally {
    savingKey.value = '';
  }
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@500;600;700;800&display=swap');

.gematria-discovery { margin-top: 24px; color: var(--navy, #1a2744); }
.discovery-header { display: flex; justify-content: space-between; gap: 18px; align-items: end; padding: 20px 2px 13px; border-top: 1px solid var(--border, #e8e1d5); }
.section-kicker { color: #96732b; font-size: .7rem; font-weight: 800; letter-spacing: .12em; }
h2 { margin: 5px 0 4px; font-size: clamp(1.2rem, 2vw, 1.65rem); font-weight: 750; }
.heading-block { min-width: 0; flex: 1 1 auto; }
.heading-block p { margin: 0; color: var(--text-secondary, #74716a); font-size: .83rem; }
.header-meta { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 12px; margin-top: 4px; }
.title-line { display: flex; align-items: center; gap: 14px; min-width: 0; }
.title-line h2 { min-width: 0; }
.total-mark { display: flex; align-items: baseline; gap: 4px; flex: 0 0 auto; color: var(--text-secondary, #74716a); white-space: nowrap; }
.total-mark strong { font-size: .84rem; font-variant-numeric: tabular-nums; color: #96732b; }
.total-mark span { font-size: .7rem; }
.controls { display: grid; grid-template-rows: auto auto; gap: 0; margin-bottom: 9px; padding: 11px 13px; border: 1px solid rgba(211,193,151,.55); border-radius: 11px; background: rgba(255,253,249,.72); }
.source-context-row { display: flex; align-items: stretch; justify-content: space-between; gap: 12px; min-width: 0; padding-bottom: 10px; }
.source-context-row > :first-child { min-width: 0; }
.context-stage { display: grid; flex: 1 1 auto; min-width: 0; min-height: 50px; block-size: 50px; }
.context-stage > * { grid-area: 1 / 1; }
.combined-parshah-filter { width: 100%; }
.source-selector { position: relative; display: inline-flex; align-self: center; max-width: 100%; padding: 3px; border: 1px solid #e2d5ba; border-radius: 9px; background: #fff; isolation: isolate; }
.source-selector::before { content: ""; position: absolute; z-index: 0; inset-block: 3px; inset-inline-start: 3px; width: calc((100% - 6px) / 3); border: 1px solid #d6bd7a; border-radius: 6px; background: #f8f0dc; box-shadow: 0 1px 3px rgba(60,46,17,.08); transition: transform 190ms ease-out; pointer-events: none; }
.source-selector--tanach::before { transform: translateX(-100%); }
.source-selector--tefillot::before { transform: translateX(-200%); }
.source-selector button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 72px; min-height: 34px; padding: 5px 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #4d5a70; font: inherit; font-size: .75rem; font-weight: 750; cursor: pointer; transition: color 180ms ease-out; }
.source-selector button .mdi { color: #a68035; font-size: 1rem; }
.source-selector button:hover { background: #fbf6ec; }
.source-selector button.active { color: #765812; }
.source-breakdown { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.source-breakdown > span { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid #e8e0d3; border-radius: 999px; background: #fffdf9; color: #657084; font-size: .67rem; }
.source-breakdown .mdi { color: #a68035; }
.source-breakdown b { color: #34415a; font-variant-numeric: tabular-nums; }
.tefillot-filter-row { display: grid; flex: 1 1 auto; grid-template-columns: repeat(2, minmax(120px, 240px)); gap: 8px; justify-content: start; min-height: 48px; }
.tefillot-filter-row label { display: grid; gap: 3px; color: #625731; font-size: .72rem; }
.tefillot-filter-row select { width: 100%; min-height: 31px; padding: 3px 8px; border: 1px solid #d9cbab; border-radius: 7px; background: #fffdf7; color: #1a2744; font: inherit; font-size: .82rem; }
.tefillot-filter-row select:focus-visible { outline: 2px solid #a68035; outline-offset: 2px; }
.coming-soon-context { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 8px 12px; border: 1px solid #e2d5ba; border-radius: 10px; background: #fffaf0; color: #705821; font-size: .76rem; font-weight: 700; }
.coming-soon-context .mdi { color: #a68035; font-size: 1.08rem; }
.tefillot-coming-soon-note { display: flex; align-items: center; gap: 7px; margin: 0 2px 10px; color: #777064; font-size: .73rem; }
.tefillot-coming-soon-note .mdi { color: #a68035; font-size: .95rem; }
.coming-soon-state { position: relative; min-height: 198px; overflow: hidden; border-color: #dfcfaa; background: radial-gradient(circle at 50% 0%, rgba(255,255,255,.95), transparent 52%), linear-gradient(135deg, #fffdf8, #fbf3df); }
.coming-soon-state::before, .coming-soon-state::after { content: ""; position: absolute; width: 110px; height: 110px; border: 1px solid rgba(192,152,64,.16); border-radius: 50%; pointer-events: none; }
.coming-soon-state::before { top: -67px; inset-inline-start: -45px; }
.coming-soon-state::after { bottom: -76px; inset-inline-end: -38px; }
.coming-soon-emblem { position: relative; display: grid; place-items: center; width: 52px; height: 52px; margin-bottom: 2px; border: 1px solid #d7bd78; border-radius: 50%; background: rgba(255,253,248,.92); color: #9b762b; box-shadow: 0 5px 13px rgba(117,88,18,.1); }
.coming-soon-emblem .mdi { position: relative; z-index: 1; font-size: 1.45rem; }
.coming-soon-emblem-ring { position: absolute; inset: 5px; border: 1px solid rgba(192,152,64,.3); border-radius: 50%; }
.coming-soon-copy { display: grid; justify-items: center; gap: 5px; }
.coming-soon-eyebrow { color: #a17b30; font-size: .66rem; font-weight: 800; letter-spacing: .08em; }
.coming-soon-copy strong { color: var(--navy, #1a2744); font-size: .98rem; }
.coming-soon-copy > span:last-child { color: #777064; font-size: .76rem; }
.coming-soon-rule { width: 38px; height: 2px; margin-top: 4px; border-radius: 99px; background: #c39b4b; opacity: .72; }
.filter-swap-enter-active, .filter-swap-leave-active { transition: opacity 180ms ease-out, transform 180ms ease-out; }
.filter-swap-enter-from { opacity: 0; transform: translate3d(-5px, 2px, 0); }
.filter-swap-leave-to { opacity: 0; transform: translate3d(4px, -1px, 0); }
.method-selector { display: inline-flex; flex: 0 0 auto; max-width: 100%; padding: 3px; gap: 2px; border: 1px solid #e2d5ba; border-radius: 9px; background: #f5efe4; }
.method-selector button { display: inline-flex; align-items: center; min-height: 30px; padding: 4px 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #657084; font: inherit; font-size: .72rem; font-weight: 750; line-height: 1; white-space: nowrap; cursor: pointer; transition: background .16s ease, color .16s ease, border-color .16s ease; }
.method-selector button:hover:not(:disabled) { color: #725619; }
.method-selector button.active { border-color: #d6bd7a; background: #fffdf8; color: #765812; box-shadow: 0 1px 3px rgba(60,46,17,.08); }
.method-selector button:disabled { color: #aaa396; cursor: not-allowed; }
.controls-primary-row { display: grid; flex: 1 1 auto; grid-template-columns: minmax(150px, 1fr) minmax(150px, 218px); gap: 12px; align-items: stretch; min-width: 0; }
.manual-range { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; min-width: 0; align-items: start; }
.parshah-filter { display: flex; align-items: center; justify-content: flex-start; gap: 10px; min-height: 48px; padding: 8px 12px; border: 1px solid #dbc17c; border-radius: 10px; background: #fbf4e6; color: var(--navy, #1a2744); font: inherit; text-align: right; cursor: pointer; transition: border-color .18s ease, background .18s ease, box-shadow .18s ease; }
.parshah-filter:hover { border-color: #c79d43; background: #faf0db; }
.parshah-filter.active { border-color: #bd9135; background: #f0deab; color: #654d16; box-shadow: inset 0 0 0 1px rgba(159,118,32,.08); }
.parshah-filter > .mdi { flex: 0 0 auto; color: #9a772d; font-size: 1.15rem; }
.parshah-filter-copy { display: grid; min-width: 0; gap: 1px; }
.parshah-filter-label {
  font-family: "Heebo", "Assistant", "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
  font-size: .76rem;
  font-weight: 700;
  letter-spacing: -.01em;
  line-height: 1.1;
}
.parshah-filter-name { color: #98752a; font-size: .69rem; font-weight: 600; line-height: 1.15; }
.parshah-filter.active .parshah-filter-name { color: #775a18; }
.kollel-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 34px; padding: 5px 9px 5px 12px; border: 1px solid #d8bf7b; border-radius: 999px; background: #fffdf8; color: var(--navy, #1a2744); font: inherit; font-size: .72rem; font-weight: 800; line-height: 1; white-space: nowrap; cursor: pointer; transition: border-color .18s ease, background .18s ease, color .18s ease; }
.kollel-toggle:hover { border-color: #be9847; background: #fbf5e8; }
.kollel-toggle.active { border-color: #c59c43; background: #f7edd5; color: #654d16; }
.kollel-indicator { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 20px; height: 20px; border: 1px solid #cdbd99; border-radius: 50%; background: #fff; color: #fff; transition: border-color .18s ease, background .18s ease; }
.kollel-indicator .mdi { font-size: .78rem; line-height: 1; }
.kollel-toggle.active .kollel-indicator { border-color: #b88a2c; background: #b88a2c; }
.controls-secondary-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 10px; border-top: 1px solid #efe7d9; }
.controls-secondary-row > .method-selector:only-child { margin-inline-start: auto; }
.filter-list { display: flex; flex-wrap: wrap; gap: 7px; }
.filter-list button, .load-more, .card-actions button { border: 1px solid var(--border, #e8e1d5); background: #fff; color: var(--navy, #1a2744); border-radius: 7px; padding: 7px 10px; font: inherit; font-size: .74rem; cursor: pointer; transition: background .16s, color .16s, border-color .16s, transform .16s; }
.filter-list button { border-color: #e5ded2; border-radius: 999px; padding: 6px 10px; background: transparent; color: #46536a; font-size: .69rem; }
.filter-list button:hover, .card-actions button:hover:not(:disabled), .load-more:hover { transform: translateY(-1px); border-color: #c09840; }
.filter-list button.active { background: var(--gold-light, #f6edda); color: #765812; border-color: #d4b96c; font-weight: 700; }
.filter-list button span { margin-inline-start: 4px; opacity: .7; font-variant-numeric: tabular-nums; }
.order-switch { display: inline-flex; align-items: center; gap: 8px; padding: 4px 7px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #5f6878; font: inherit; text-align: right; cursor: pointer; transition: color .16s ease, background .16s ease, border-color .16s ease; }
.order-switch:hover { border-color: #e0cfaa; background: rgba(246,237,218,.52); }
.order-switch.active { color: #765812; }
.switch-track { position: relative; flex: 0 0 auto; width: 30px; height: 17px; border: 1px solid #cfc5b4; border-radius: 999px; background: #e8e2d8; transition: background .18s ease, border-color .18s ease; }
.switch-thumb { position: absolute; top: 2px; inset-inline-start: 2px; width: 11px; height: 11px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(26,39,68,.22); transition: transform .18s ease; }
.order-switch.active .switch-track { border-color: #bc9137; background: #c59a43; }
.order-switch.active .switch-thumb { transform: translateX(-13px); }
.order-switch-copy { display: grid; gap: 1px; line-height: 1.1; }
.order-switch-copy > span { font-size: .7rem; font-weight: 780; white-space: nowrap; }
.order-switch-copy small { color: #9a8d76; font-size: .61rem; font-weight: 600; }
.order-switch.active .order-switch-copy small { color: #96732b; }
.range-filter-error { margin: -2px 2px 10px; color: #a45e46; font-size: .71rem; }
.parshah-note { margin: 0 0 13px; color: var(--text-secondary, #74716a); font-size: .73rem; }
.parshah-note strong { color: #87671f; }
.scope-note { margin: 0 0 13px; color: #87671f; font-size: .73rem; }
.selection-mode-toggle { display: block; margin: 0 0 10px; padding: 5px 10px; border: 1px solid #c9a55d; border-radius: 6px; background: #fffdf8; color: #765812; font: inherit; font-size: .75rem; cursor: pointer; }
.selection-mode-toggle[aria-pressed="true"] { background: #fbf4e6; }
.match-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.match-card { display: flex; flex-direction: column; min-height: 190px; padding: 14px 15px 12px; border: 1px solid var(--border, #e8e1d5); border-radius: 10px; background: #fff; box-shadow: 0 2px 10px rgba(26,39,68,.035); transition: transform .18s, box-shadow .18s; }
.match-card:hover { transform: translateY(-2px); box-shadow: 0 7px 18px rgba(26,39,68,.08); }
.match-card.curated-selected-card, .match-card.curated-saved-card { border-color: #c09840; background: #fffdf7; box-shadow: 0 0 0 1px rgba(192,152,64,.14); }
.card-topline, .card-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.card-labels { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.source-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid #e6dfd2; border-radius: 999px; background: #fbfaf7; color: #526079; font-size: .65rem; font-weight: 800; }
.source-badge .mdi { color: #a68035; font-size: .82rem; }
.source-badge--tefillot { background: #faf5e8; border-color: #e4d5ad; color: #765812; }
.type-label { color: #8e6d2c; font-size: .68rem; font-weight: 800; }
.match-index { color: #c9c0b1; font-size: .68rem; font-variant-numeric: tabular-nums; }
.citation { margin-top: 12px; }
.citation strong { font-size: .94rem; }
.citation span { color: var(--text-secondary, #74716a); font-size: .68rem; }
.context-text { margin: 12px 0 16px; color: #5b5a56; font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: 1.08rem; line-height: 1.9; }
.context-text mark { padding: 2px 4px; border-radius: 3px; background: #f2e4bd; color: #4e3b13; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.context-text .edge-highlight {
  position: relative;
  z-index: 0;
  display: inline;
  width: auto;
  min-width: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  line-height: inherit;
}
.context-text .edge-highlight::before {
  content: "";
  position: absolute;
  z-index: -1;
  inset-block: .04em;
  inset-inline: -.07em;
  border-radius: 4px;
  background: #f2e4bd;
  pointer-events: none;
}
.context-text .edge-highlight {
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.muted-text { color: #b0aaa0; }
.card-actions { margin-top: auto; padding-top: 10px; border-top: 1px solid #f0ece5; }
.card-actions button { padding: 6px 8px; border-color: transparent; background: transparent; font-size: .7rem; }
.reader-action { color: #69727b !important; }
.save-action { color: #98732b !important; }
.curated-action { background: #fffaf0 !important; border-color: #e2d1aa !important; color: #765812 !important; font-weight: 700 !important; }
.curated-action.saved { background: #f3f7f0 !important; border-color: #cbd9c5 !important; color: #55724b !important; cursor: default; opacity: .9; }
.curated-action.selected { background: #f2e4bd !important; color: #765812 !important; border-color: #d6bd7a !important; }
.curated-save-bar { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 14px auto 0; padding: 8px 12px; border: 1px solid #dcc58e; border-radius: 9px; background: #fbf4e6; color: #765812; font-size: .76rem; }
.curated-save-bar button { border: 1px solid #c9a55d; border-radius: 6px; background: #fffdf8; color: #765812; padding: 5px 9px; font: inherit; cursor: pointer; }
.curated-save-bar .cancel-curated { border-color: transparent; background: transparent; }
.curated-message { margin: 8px 0 0; color: #55724b; font-size: .75rem; text-align: center; }
.curated-message.error { color: #a45e46; }
.save-action.saved { color: #388e3c !important; }
.save-action:disabled { cursor: default; opacity: .75; }
.state-card { min-height: 170px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 8px; border: 1px dashed #d8cfbf; border-radius: 10px; text-align: center; color: var(--text-secondary, #74716a); font-size: .82rem; }
.state-card .mdi { font-size: 1.7rem; color: #c09840; }
.state-card strong { color: var(--navy, #1a2744); }
.error-state button { margin-top: 4px; border: 0; background: transparent; color: #8e6d2c; cursor: pointer; font: inherit; text-decoration: underline; }
.empty-rule { width: 34px; height: 1px; background: #c09840; margin-bottom: 3px; }
.skeleton-card { gap: 13px; justify-content: center; }
.skeleton-line { height: 10px; width: 45%; border-radius: 5px; background: #eee9e0; animation: breathe 1.3s ease-in-out infinite alternate; }
.skeleton-line.short { width: 25%; }.skeleton-line.wide { width: 78%; }
.loading-note { padding: 14px; color: var(--text-secondary, #74716a); text-align: center; font-size: .76rem; }
.load-more { display: flex; align-items: center; gap: 7px; margin: 16px auto 0; padding-inline: 16px; }
@keyframes breathe { from { opacity: .45; } to { opacity: 1; } }
@media (max-width: 820px) { .match-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .discovery-header { align-items: flex-start; gap: 8px; }.title-line { align-items: flex-start; gap: 7px; }.title-line h2 { flex: 1 1 auto; }.match-grid { grid-template-columns: 1fr; }.total-mark strong { font-size: .78rem; }.controls { gap: 0; padding: 11px; }.source-context-row { align-items: stretch; flex-direction: column; gap: 7px; }.context-stage { min-height: 48px; block-size: auto; }.source-selector { width: 100%; order: -1; }.source-selector button { min-width: 0; flex: 1 1 0; padding-inline: 7px; }.controls-primary-row { grid-template-columns: 1fr; gap: 9px; }.tefillot-filter-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }.manual-range { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }.manual-range > :first-child { grid-column: 1 / -1; }.parshah-filter { min-height: 46px; }.controls-secondary-row { flex-direction: column; align-items: stretch; gap: 9px; }.controls-secondary-row .method-selector { align-self: flex-start; order: 1; margin-inline-start: 0; }.controls-secondary-row .filter-list { order: 2; gap: 6px; }.controls-secondary-row .order-switch { order: 2; align-self: flex-start; margin-inline-start: 0; } }
@media (prefers-reduced-motion: reduce) {
  .source-selector::before, .source-selector button, .filter-swap-enter-active, .filter-swap-leave-active { transition-duration: 0.01ms !important; }
  .filter-swap-enter-from, .filter-swap-leave-to { transform: none; }
}
</style>