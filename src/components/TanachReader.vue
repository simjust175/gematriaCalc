<template>
  <div class="tanach-page">
    <div v-if="loadingBooks" class="reader-state">
      <span class="mdi mdi-loading mdi-spin"></span>
      טוען תנ״ך...
    </div>

    <div v-else-if="loadError" class="reader-state reader-state--error">
      <span class="mdi mdi-book-alert-outline"></span>
      <strong>{{ loadError }}</strong>
      <small>מנהל המערכת יכול לטעון את המקור המקומי באמצעות npm run import:tanach</small>
    </div>

    <div v-else class="tanach-layout">
      <aside class="navigator-card panel-card">
        <div class="panel-heading">
          <h1>תנ״ך</h1>
          <span>{{ stats.canonicalBooks }} ספרים · {{ stats.verses?.toLocaleString('he-IL') }} פסוקים</span>
        </div>

        <div class="search-wrap">
          <span class="mdi mdi-magnify"></span>
          <input
            v-model="searchQuery"
            type="search"
            placeholder="חפש ספר, פרשה או טקסט..."
            aria-label="חיפוש בתנ״ך"
            @input="scheduleSearch"
            @keydown="onHebrewKeydown"
          />
        </div>

        <div v-if="searchQuery.trim().length >= 2" class="search-results">
          <button
            v-for="item in searchResults"
            :key="item.type === 'parsha' ? `parsha-${item.parsha_id}` : `${item.type || 'verse'}-${item.book_slug}-${item.chapter}-${item.verse}`"
            :class="{ 'search-result--navigation': item.type }"
            @click="openSearchResult(item)"
          >
            <strong>{{ item.label || `${item.book_name} ${toHebrewNumber(item.chapter)}:${toHebrewNumber(item.verse)}` }}</strong>
            <span v-if="item.display_text">{{ item.display_text }}</span>
            <small v-else>{{ item.book_name }} {{ toHebrewNumber(item.chapter) }}:{{ toHebrewNumber(item.verse) }}</small>
          </button>
          <div v-if="!searchLoading && searchResults.length === 0" class="empty-search">לא נמצאו תוצאות</div>
        </div>

        <div class="navigation-area">
          <span class="navigation-heading">ניווט</span>
          <div class="reference-selectors">
            <TanachScopeSelect
              :model-value="selectedBookSlug"
              label="ספר"
              :groups="bookGroups"
              :disabled="loadingBooks"
              @update:model-value="selectBook"
            />
            <TanachScopeSelect
              v-if="isTorahBook"
              :model-value="selectedParshaId"
              label="פרשה"
              :groups="[{ options: parshaOptions }]"
              empty-label="כל הפרשיות"
              @update:model-value="selectParsha"
            />
            <div v-else class="chapter-verse-row">
              <TanachScopeSelect
                :model-value="String(selectedChapter)"
                label="פרק"
                :groups="[{ options: chapterOptions }]"
                @update:model-value="onChapterChange"
              />
              <TanachScopeSelect
                :model-value="verseScope"
                label="פסוק"
                :groups="[{ options: verseOptions }]"
                empty-label="כל הפסוקים"
                @update:model-value="selectVerseScope"
              />
            </div>
          </div>
        </div>

        <div ref="verseList" class="verse-list" aria-label="פסוקי הפרק">
          <template v-for="(item, index) in verses" :key="`${item.chapter}:${item.verse}`">
            <div
              v-if="selectedParshaId && (index === 0 || item.chapter !== verses[index - 1].chapter)"
              class="verse-chapter-divider"
              :aria-label="`פרק ${toHebrewNumber(item.chapter)}`"
            >
              <span>פרק {{ toHebrewNumber(item.chapter) }}</span>
            </div>
            <button
              :class="{ active: item.chapter === selectedChapter && item.verse === selectedVerseNumber }"
              :aria-label="`פסוק ${toHebrewNumber(item.verse)} בפרק ${toHebrewNumber(item.chapter)}`"
              @click="selectVerse(item.verse, item.chapter)"
            >
              <span class="verse-number">{{ toHebrewNumber(item.verse) }}</span>
              <span class="verse-preview">{{ item.display_text }}</span>
            </button>
          </template>
        </div>
      </aside>

      <main class="reader-column">
        <section class="verse-card panel-card">
          <header class="verse-toolbar">
            <div>
              <h2>{{ referenceLabel }}</h2>
              <span v-if="activeParsha" class="parsha-context">פרשת {{ activeParsha.name_he }}</span>
              <span>פסוק {{ selectedVerseNumber }} מתוך {{ verses.length }}</span>
            </div>
            <div class="verse-nav">
              <button @click="moveVerse(-1)" title="הפסוק הקודם">
                <span class="ui-chevron ui-chevron--right" aria-hidden="true"></span> קודם
              </button>
              <button @click="moveVerse(1)" title="הפסוק הבא">
                הבא <span class="ui-chevron ui-chevron--left" aria-hidden="true"></span>
              </button>
            </div>
          </header>

          <div
            v-if="selectedVerse"
            ref="verseDisplay"
            class="verse-display"
            tabindex="0"
            role="slider"
            :aria-valuemin="1"
            :aria-valuemax="cursor.count"
            :aria-valuenow="cursorIndex + 1"
            :aria-valuetext="`בחירה מאות ${rangeStart + 1} עד אות ${rangeEnd + 1} מתוך ${cursor.count}`"
            :aria-label="`סמן אות בפסוק ${referenceLabel}`"
            @keydown="onCursorKeydown"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="endDragging"
            @pointercancel="endDragging"
          >
            <span
              v-for="(token, index) in cursor.tokens"
              :key="index"
              class="verse-token"
              :data-letter-index="token.letterIndex ?? undefined"
              :class="{
                'verse-token--letter': token.letterIndex != null,
                'verse-token--range': isVisualTokenSelected(token),
                'verse-token--current': token.letterIndex === cursorIndex,
              }"
            >{{ token.text }}</span>
          </div>
          <p class="selection-hint">גרור על האותיות כדי לבחור טווח לחישוב</p>
        </section>

        <section v-if="result" class="calculation-area">
          <article class="primary-result" aria-live="polite" aria-atomic="true">
            <div>
              <span class="eyebrow">גימטריה מלאה</span>
              <div class="primary-value">
                <strong>{{ result.fullGematria.toLocaleString('he-IL') }}</strong>
                <span>·</span>
                <b>{{ result.fullHebrewNumber }}</b>
              </div>
            </div>
            <SaveSplitButton
              :primary-label="matches.isAlreadySaved ? 'כבר שמור' : saveStatus === 'saved' ? 'נשמר' : 'שמור טווח'"
              :disabled="saveStatus === 'loading' || matches.isAlreadySaved"
              :secondary-disabled="!hasExplicitSelection || !selectedRange.text.trim()"
              @primary="saveRange"
              @base-word="saveAsBaseWord"
            />
          </article>

          <div class="secondary-results">
            <article>
              <span class="eyebrow">ראשי תיבות</span>
              <strong>{{ result.initials }}</strong>
            </article>
            <article>
              <span class="eyebrow">גימטריית ר״ת</span>
              <strong>{{ result.initialsGematria }} · {{ result.initialsHebrewNumber }}</strong>
            </article>
          </div>

          <section class="tanach-milui-disclosure" aria-labelledby="tanach-milui-title">
            <button
              class="tanach-milui-summary"
              type="button"
              :disabled="!hasExplicitSelection || !selectedRange.text.trim() || !miluiSettingsLoaded"
              :aria-expanded="miluiOpen"
              aria-controls="tanach-milui-panel"
              @click="toggleMilui"
            >
              <span class="tanach-milui-summary__label">
                <span id="tanach-milui-title" class="eyebrow">מילוי</span>
                <small v-if="miluiSettingsLoading">טוען הגדרות מילוי...</small>
                <small v-else-if="miluiCalculation">{{ miluiCalculation.expandedText }}</small>
                <small v-else-if="hasExplicitSelection">לא ניתן לטעון את חישוב המילוי</small>
                <small v-else>בחר אותיות או מילים לחישוב מילוי</small>
              </span>
              <span v-if="miluiCalculation" class="tanach-milui-summary__value">
                <b>{{ miluiCalculation.fullGematria }}</b>
                <span>·</span>
                <strong>{{ miluiCalculation.fullHebrewNumber }}</strong>
              </span>
              <span class="ui-chevron" :class="miluiOpen ? 'ui-chevron--up' : 'ui-chevron--down'" aria-hidden="true"></span>
            </button>
            <MiluiPanel
              v-if="miluiOpen && miluiCalculation"
              id="tanach-milui-panel"
              :calculation="miluiCalculation"
              :source-text="selectedRange.text"
              :mapping="miluiMapping"
              :canonical-presets="havayahMiluiPresets"
              :settings-disabled="!miluiSettingsLoaded"
              :primary-save-disabled="saveStatus !== 'idle' || matches.isAlreadySaved"
              :primary-save-label="matches.isAlreadySaved ? 'כבר שמור' : saveStatus === 'saved' ? 'נשמר' : 'שמור טווח'"
              :selected-save-disabled="saveAllStatus !== 'idle'"
              :selected-save-label="saveAllStatus === 'saved' ? 'נשמרו' : saveAllStatus === 'loading' ? 'שומר...' : 'שמור נבחרים'"
              :save-all-disabled="saveAllFormsStatus !== 'idle'"
              :save-all-label="saveAllFormsStatus === 'saved' ? 'כל האופנים נשמרו' : saveAllFormsStatus === 'loading' ? 'שומר...' : 'שמור כל האופנים'"
              @open-settings="openMiluiSettings"
              @explicit-total-change="explicitMiluiTotal = $event"
              @interpretation-saved="miluiMatchRefresh += 1"
              @save-primary="saveRange"
              @save-selected="saveSelectedMiluiForms"
              @save-all="saveAllMiluiForms"
            />
            <p v-if="miluiSettingsError && !miluiSettingsLoaded" class="milui-load-error" role="alert">
              {{ miluiSettingsError }}
              <button type="button" @click="loadMiluiSettings">נסה שוב</button>
            </p>
          </section>

          <details class="word-breakdown">
            <summary>פירוט מילים ואותיות</summary>
            <div v-for="word in result.words" :key="word.position" class="word-result">
              <div><strong>{{ word.word }}</strong><span>{{ word.gematria }} · {{ word.hebrewNumber }}</span></div>
              <small>{{ word.letters.map(letter => `${letter.letter} ${letter.value}`).join(' · ') }}</small>
            </div>
          </details>

          <MatchPanel
            :matches="matches.matches"
            :gematria="result.fullGematria"
            :isAlreadySaved="matches.isAlreadySaved"
            :hasInput="true"
            :error="matches.error"
          />
          <p v-if="saveError" class="save-error">{{ saveError }}</p>
        </section>
      </main>

      <aside class="summary-column">
        <section class="summary-card panel-card">
          <div class="range-mode">
            <span>מצב טווח</span>
            <b>{{ rangeStart + 1 }}–{{ rangeEnd + 1 }}</b>
          </div>
          <div class="current-letter">
            <span class="eyebrow">סמן נוכחי</span>
            <strong>{{ currentLetter?.character }}</strong>
            <span>אות {{ cursorIndex + 1 }} מתוך {{ cursor.count }}</span>
            <b>{{ currentLetter?.value }}</b>
          </div>
        </section>

        <section class="summary-card panel-card">
          <span class="eyebrow">ספירת אותיות</span>
          <dl>
            <div><dt>בטווח</dt><dd>{{ selectedRange.letters.length }}</dd></div>
            <div><dt>בפסוק</dt><dd>{{ cursor.count }}</dd></div>
            <div><dt>גימטריה</dt><dd>{{ selectedRange.gematria.toLocaleString('he-IL') }}</dd></div>
          </dl>
        </section>

        <section class="summary-card panel-card progress-card">
          <span class="eyebrow">התקדמות בפסוק</span>
          <div class="progress-track"><span :style="{ width: `${progress}%` }"></span></div>
          <b>{{ progress }}%</b>
        </section>
      </aside>
    </div>

    <MiluiSettings
      v-if="miluiSettingsOpen"
      :mapping="miluiMapping"
      :saving="miluiSettingsSaving"
      :error="miluiSettingsError"
      :success="miluiSettingsSuccess"
      @close="miluiSettingsOpen = false"
      @save="saveMiluiMapping"
    />

    <footer v-if="source" class="source-note">
      <span class="mdi mdi-information-outline"></span>
      {{ source.attribution }}
    </footer>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { computeAll, toHebrewNumber } from '@/composables/useGematria.js';
import { createTanachCursor, normalizeTanachSelection } from '@/composables/useTanachCursor.js';
import { useLiveMatching } from '@/composables/useLiveMatching.js';
import { useAutomaticHebrewKeyboard } from '@/composables/useAutomaticHebrewKeyboard.js';
import MatchPanel from './MatchPanel.vue';
import TanachScopeSelect from './TanachScopeSelect.vue';
import SaveSplitButton from './SaveSplitButton.vue';
import MiluiPanel from './MiluiPanel.vue';
import MiluiSettings from './MiluiSettings.vue';
import {
  CANONICAL_HAVAYAH_MILUI,
  MILUI_DEFAULT_MAPPING,
  calculateMilui,
  cloneMiluiMapping,
  containsStandaloneHavayah,
  normalizeMiluiMapping,
} from '@/utils/milui.js';

const props = defineProps({
  openReference: { type: Object, default: null },
});
const emit = defineEmits(['referenceConsumed']);
const { onHebrewKeydown } = useAutomaticHebrewKeyboard();

const canonicalBooks = ref([]);
const books = ref([]);
const parshiot = ref([]);
const verses = ref([]);
const source = ref(null);
const stats = ref({});
const selectedBookSlug = ref('Genesis');
const selectedChapter = ref(1);
const selectedVerseNumber = ref(1);
const verseScope = ref('1');
const showAllVerses = ref(false);
const selectedParshaId = ref('');
const anchorLetterIndex = ref(0);
const focusLetterIndex = ref(0);
const hasExplicitSelection = ref(false);
const isDragging = ref(false);
const loadingBooks = ref(true);
const loadError = ref('');
const searchQuery = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const saveStatus = ref('idle');
const saveError = ref('');
const saveMenuOpen = ref(false);
const miluiOpen = ref(false);
const miluiMapping = ref(cloneMiluiMapping(MILUI_DEFAULT_MAPPING));
const miluiSettingsOpen = ref(false);
const miluiSettingsLoaded = ref(false);
const miluiSettingsLoading = ref(false);
const miluiSettingsSaving = ref(false);
const miluiSettingsError = ref('');
const miluiSettingsSuccess = ref('');
const explicitMiluiTotal = ref(0);
const miluiMatchRefresh = ref(0);
const saveAllStatus = ref('idle');
const saveAllFormsStatus = ref('idle');
const verseDisplay = ref(null);
const verseList = ref(null);
let searchTimer;
let isChangingReference = false;
let chapterRequestId = 0;
let chapterController = null;
let lastExternalReferenceId = null;

const selectedBook = computed(() => books.value.find(book => book.slug === selectedBookSlug.value));
const selectedCanonicalBook = computed(() => canonicalBooks.value.find(canonical => (
  canonical.segments?.some(segment => segment.slug === selectedBookSlug.value)
)));
const isTorahBook = computed(() => Number(selectedCanonicalBook.value?.order) <= 5);
const bookGroups = computed(() => {
  const sections = new Map();
  for (const canonical of canonicalBooks.value) {
    const section = canonical.section || (
      Number(canonical.order) <= 5
        ? { id: 'torah', name_he: 'תורה' }
        : Number(canonical.order) <= 13
          ? { id: 'prophets', name_he: 'נביאים' }
          : { id: 'writings', name_he: 'כתובים' }
    );
    if (!sections.has(section.id)) sections.set(section.id, { label: section.name_he, options: [] });
    for (const segment of canonical.segments || []) {
      sections.get(section.id).options.push({
        value: segment.slug,
        label: segment.hebrew_name,
      });
    }
  }
  return [...sections.values()];
});
const parshaOptions = computed(() => {
  const segmentSlugs = new Set(selectedCanonicalBook.value?.segments?.map(segment => segment.slug) || []);
  return parshiot.value
    .filter(parsha => segmentSlugs.has(parsha.start_book_slug))
    .map(parsha => ({ value: parsha.id, label: parsha.name_he }));
});
const chapterOptions = computed(() => Array.from(
  { length: Number(selectedBook.value?.chapter_count) || 1 },
  (_, index) => {
    const chapter = index + 1;
    return { value: String(chapter), label: toHebrewNumber(chapter) };
  }
));
const verseOptions = computed(() => verses.value.map(item => ({
  value: String(item.verse),
  label: toHebrewNumber(item.verse),
})));
const selectedParsha = computed(() => parshiot.value.find(parsha => parsha.id === selectedParshaId.value) || null);
const selectedVerse = computed(() => verses.value.find(verse => (
  verse.chapter === selectedChapter.value && verse.verse === selectedVerseNumber.value
)));
const cursor = computed(() => createTanachCursor(selectedVerse.value?.display_text || ''));
const cursorIndex = computed(() => focusLetterIndex.value);
const selection = computed(() => normalizeTanachSelection(anchorLetterIndex.value, focusLetterIndex.value));
const rangeStart = computed(() => selection.value.start);
const rangeEnd = computed(() => selection.value.end);
const selectedRange = computed(() => cursor.value.range(rangeStart.value, rangeEnd.value));
const detailedResult = computed(() => computeAll(selectedRange.value.text));
const result = computed(() => detailedResult.value && ({
  ...detailedResult.value,
  // The running total is read directly from the precomputed prefix array.
  fullGematria: selectedRange.value.gematria,
  fullHebrewNumber: toHebrewNumber(selectedRange.value.gematria),
}));
const currentLetter = computed(() => cursor.value.letters[cursorIndex.value]);
const progress = computed(() => cursor.value.count ? Math.round(((cursorIndex.value + 1) / cursor.value.count) * 100) : 0);
const referenceLabel = computed(() => selectedBook.value
  ? `${selectedBook.value.hebrew_name} ${toHebrewNumber(selectedChapter.value)}:${toHebrewNumber(selectedVerseNumber.value)}`
  : '');
const activeParsha = computed(() => selectedParsha.value && isWithinParsha(
  selectedParsha.value,
  selectedBookSlug.value,
  selectedChapter.value,
  selectedVerseNumber.value
) ? selectedParsha.value : null);
const matchContext = computed(() => ({
  bookSlug: selectedBookSlug.value,
  chapter: selectedChapter.value,
  verse: selectedVerseNumber.value,
  start: rangeStart.value,
  end: rangeEnd.value,
  explicitMiluiTotal: explicitMiluiTotal.value,
  refresh: miluiMatchRefresh.value,
}));
const { matches } = useLiveMatching(result, { context: matchContext });
const miluiCalculation = computed(() => (
  miluiSettingsLoaded.value && hasExplicitSelection.value && selectedRange.value.text.trim()
    ? calculateMilui(selectedRange.value.text, miluiMapping.value)
    : null
));
const havayahMiluiPresets = computed(() => (
  miluiOpen.value && miluiCalculation.value && containsStandaloneHavayah(selectedRange.value.text)
    ? CANONICAL_HAVAYAH_MILUI
    : null
));

watch(selectedVerse, () => {
  anchorLetterIndex.value = 0;
  focusLetterIndex.value = 0;
  hasExplicitSelection.value = false;
  isDragging.value = false;
  saveStatus.value = 'idle';
  saveError.value = '';
  miluiOpen.value = false;
  explicitMiluiTotal.value = 0;
  saveAllStatus.value = 'idle';
  saveAllFormsStatus.value = 'idle';
  nextTick(() => verseDisplay.value?.focus());
});

watch(selectedVerseNumber, verse => {
  if (verse && !showAllVerses.value) verseScope.value = String(verse);
});

watch([selectedBookSlug, selectedChapter, selectedVerseNumber], () => {
  if (!isChangingReference) clearParshaIfOutsideRange();
});

watch([rangeStart, rangeEnd], () => {
  saveStatus.value = 'idle';
  saveError.value = '';
  saveAllStatus.value = 'idle';
  saveAllFormsStatus.value = 'idle';
});

async function loadBooks() {
  loadingBooks.value = true;
  try {
    const response = await fetch('/api/tanach/books');
    if (!response.ok) throw new Error('לא ניתן לטעון את ספרי התנ״ך');
    const data = await response.json();
    if (!data.books?.length) throw new Error('מאגר התנ״ך טרם נטען');
    books.value = data.books;
    canonicalBooks.value = data.canonicalBooks;
    parshiot.value = data.parshiot || [];
    source.value = data.source;
    stats.value = data.stats;
    if (!books.value.some(book => book.slug === selectedBookSlug.value)) {
      selectedBookSlug.value = books.value[0].slug;
    }
    await loadChapter();
    if (props.openReference) await openExternalReference(props.openReference);
  } catch (error) {
    loadError.value = error.message;
  } finally {
    loadingBooks.value = false;
  }
}

async function fetchVerseChapters(bookSlug, startChapter, endChapter, errorMessage = 'לא ניתן לטעון את הפרק') {
  const requestId = ++chapterRequestId;
  chapterController?.abort();
  const controller = new AbortController();
  chapterController = controller;
  const chapterNumbers = Array.from(
    { length: endChapter - startChapter + 1 },
    (_, index) => startChapter + index
  );
  try {
    const responses = await Promise.all(chapterNumbers.map(async chapter => {
      const response = await fetch(
        `/api/tanach/verses?book=${encodeURIComponent(bookSlug)}&chapter=${chapter}`,
        { signal: controller.signal }
      );
      if (!response.ok) throw new Error(errorMessage);
      return response.json();
    }));
    if (requestId !== chapterRequestId || controller.signal.aborted) return false;
    return responses.flatMap(data => data.verses || []);
  } catch (error) {
    if (error?.name !== 'AbortError' && requestId === chapterRequestId) {
      loadError.value = error.message || errorMessage;
    }
    return null;
  } finally {
    if (chapterController === controller) chapterController = null;
  }
}

function applyLoadedVerses(loadedVerses, preferredChapter, preferredVerse) {
  verses.value = loadedVerses;
  const preferred = verses.value.find(item => (
    item.chapter === preferredChapter && item.verse === preferredVerse
  )) || verses.value[0];
  selectedChapter.value = preferred?.chapter || preferredChapter;
  selectedVerseNumber.value = preferred?.verse || preferredVerse;
  showAllVerses.value = false;
  verseScope.value = String(selectedVerseNumber.value);
  loadError.value = '';
}

async function loadChapter(preferredVerse = 1) {
  const chapter = selectedChapter.value;
  const loadedVerses = await fetchVerseChapters(
    selectedBookSlug.value,
    chapter,
    chapter
  );
  if (!loadedVerses) return false;
  applyLoadedVerses(loadedVerses, chapter, preferredVerse);
  return true;
}

function compareReferences(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function isVerseInRange(item, start, end) {
  const current = compareReference(item.book_slug, item.chapter, item.verse);
  const startReference = compareReference(start.bookSlug, start.chapter, start.verse);
  const endReference = compareReference(end.bookSlug, end.chapter, end.verse);
  return current && startReference && endReference
    && compareReferences(current, startReference) >= 0
    && compareReferences(current, endReference) <= 0;
}

async function loadParsha(parsha) {
  if (parsha.start_book_slug !== parsha.end_book_slug) {
    loadError.value = 'טווח הפרשה חוצה ספרים ואינו נתמך';
    return false;
  }
  const loadedVerses = await fetchVerseChapters(
    parsha.start_book_slug,
    parsha.start_chapter,
    parsha.end_chapter,
    'לא ניתן לטעון את הפרשה'
  );
  if (!loadedVerses) return false;
  const range = {
    start: {
      bookSlug: parsha.start_book_slug,
      chapter: parsha.start_chapter,
      verse: parsha.start_verse,
    },
    end: {
      bookSlug: parsha.end_book_slug,
      chapter: parsha.end_chapter,
      verse: parsha.end_verse,
    },
  };
  const trimmedVerses = loadedVerses.filter(item => isVerseInRange(item, range.start, range.end));
  if (!trimmedVerses.length) {
    loadError.value = 'לא נמצאו פסוקי הפרשה';
    return false;
  }
  applyLoadedVerses(trimmedVerses, parsha.start_chapter, parsha.start_verse);
  return true;
}

async function openExternalReference(reference) {
  const requestKey = reference?.requestId
    ?? `${reference?.bookSlug}:${reference?.chapter}:${reference?.verse}:${reference?.start}:${reference?.end}`;
  if (!reference || requestKey === lastExternalReferenceId) return;
  const chapter = Number(reference.chapter);
  const verse = Number(reference.verse);
  const start = Number(reference.start);
  const end = Number(reference.end);
  if (!books.value.some(book => book.slug === reference.bookSlug)
      || !Number.isInteger(chapter) || !Number.isInteger(verse)
      || !Number.isInteger(start) || !Number.isInteger(end)
      || chapter < 1 || verse < 1 || start < 0 || end < start) return;

  isChangingReference = true;
  selectedParshaId.value = '';
  selectedBookSlug.value = reference.bookSlug;
  selectedChapter.value = chapter;
  const loaded = await loadChapter(verse);
  isChangingReference = false;
  if (!loaded) return;
  await nextTick();
  if (selectedVerseNumber.value !== verse || end >= cursor.value.count) return;
  anchorLetterIndex.value = start;
  focusLetterIndex.value = end;
  hasExplicitSelection.value = true;
  saveStatus.value = 'idle';
  saveError.value = '';
  lastExternalReferenceId = requestKey;
  await nextTick();
  verseDisplay.value?.focus({ preventScroll: true });
  verseDisplay.value?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  emit('referenceConsumed', reference.requestId);
}

function clearParshaIfOutsideRange() {
  if (selectedParshaId.value && !activeParsha.value) selectedParshaId.value = '';
}

async function selectBook(bookSlug) {
  if (!bookSlug || bookSlug === selectedBookSlug.value) return;
  isChangingReference = true;
  selectedParshaId.value = '';
  selectedBookSlug.value = bookSlug;
  selectedChapter.value = 1;
  await loadChapter();
  isChangingReference = false;
  clearParshaIfOutsideRange();
}

async function onChapterChange(chapterValue) {
  const chapter = Number(chapterValue);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter === selectedChapter.value) return;
  isChangingReference = true;
  selectedChapter.value = chapter;
  await loadChapter();
  isChangingReference = false;
  clearParshaIfOutsideRange();
}

function compareReference(bookSlug, chapter, verse) {
  const book = books.value.find(item => item.slug === bookSlug);
  if (!book) return null;
  return [book.canonical_order, book.segment_order, Number(chapter), Number(verse)];
}

function isWithinParsha(parsha, bookSlug, chapter, verse) {
  const current = compareReference(bookSlug, chapter, verse);
  const start = compareReference(parsha.start_book_slug, parsha.start_chapter, parsha.start_verse);
  const end = compareReference(parsha.end_book_slug, parsha.end_chapter, parsha.end_verse);
  if (!current || !start || !end) return false;
  return compareReferences(current, start) >= 0 && compareReferences(current, end) <= 0;
}

async function selectParsha(parshaId) {
  if (!parshaId) {
    selectedParshaId.value = '';
    return;
  }
  await openParsha(parshaId);
}

async function openParsha(id) {
  const parsha = parshiot.value.find(item => item.id === id);
  if (!parsha) return;
  isChangingReference = true;
  selectedParshaId.value = parsha.id;
  selectedBookSlug.value = parsha.start_book_slug;
  selectedChapter.value = parsha.start_chapter;
  await loadParsha(parsha);
  isChangingReference = false;
  clearParshaIfOutsideRange();
}

function selectVerse(verse, chapter = selectedChapter.value) {
  const nextVerse = Number(verse);
  const nextChapter = Number(chapter);
  if (!Number.isInteger(nextVerse) || nextVerse < 1 || !Number.isInteger(nextChapter) || nextChapter < 1) return;
  if (!verses.value.some(item => item.chapter === nextChapter && item.verse === nextVerse)) return;
  showAllVerses.value = false;
  verseScope.value = String(nextVerse);
  selectedChapter.value = nextChapter;
  selectedVerseNumber.value = nextVerse;
}

function selectVerseScope(verse) {
  if (verse) {
    selectVerse(verse);
    return;
  }
  showAllVerses.value = true;
  selectedChapter.value = verses.value[0]?.chapter || selectedChapter.value;
  selectedVerseNumber.value = verses.value[0]?.verse || 1;
  verseScope.value = '';
  nextTick(() => verseList.value?.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function moveVerse(delta) {
  showAllVerses.value = false;
  const index = verses.value.findIndex(item => (
    item.chapter === selectedChapter.value && item.verse === selectedVerseNumber.value
  ));
  const next = verses.value[index + delta];
  if (next) {
    selectedChapter.value = next.chapter;
    selectedVerseNumber.value = next.verse;
    return;
  }
  if (selectedParshaId.value) return;
  const nextChapter = selectedChapter.value + delta;
  if (nextChapter >= 1 && nextChapter <= (selectedBook.value?.chapter_count || 1)) {
    isChangingReference = true;
    selectedChapter.value = nextChapter;
    await loadChapter(delta < 0 ? Number.MAX_SAFE_INTEGER : 1);
    if (delta < 0) selectedVerseNumber.value = verses.value.at(-1)?.verse || 1;
    isChangingReference = false;
    clearParshaIfOutsideRange();
    return;
  }
  const bookIndex = books.value.findIndex(book => book.slug === selectedBookSlug.value);
  const adjacentBook = books.value[bookIndex + delta];
  if (adjacentBook) {
    isChangingReference = true;
    selectedBookSlug.value = adjacentBook.slug;
    selectedChapter.value = delta > 0 ? 1 : adjacentBook.chapter_count;
    await loadChapter();
    if (delta < 0) selectedVerseNumber.value = verses.value.at(-1)?.verse || 1;
    isChangingReference = false;
    clearParshaIfOutsideRange();
  }
}

function setCursor(index) {
  focusLetterIndex.value = cursor.value.clamp(index);
  hasExplicitSelection.value = true;
}

function selectSingleLetter(index) {
  const clamped = cursor.value.clamp(index);
  anchorLetterIndex.value = clamped;
  focusLetterIndex.value = clamped;
  hasExplicitSelection.value = true;
}

function isVisualTokenSelected(token) {
  if (token.letterIndex != null) {
    return token.letterIndex >= rangeStart.value && token.letterIndex <= rangeEnd.value;
  }
  return token.previousLetterIndex != null
    && token.nextLetterIndex != null
    && token.previousLetterIndex >= rangeStart.value
    && token.nextLetterIndex <= rangeEnd.value;
}

function getLetterIndexFromPointer(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const token = target?.closest?.('[data-letter-index]');
  const value = token?.dataset?.letterIndex;
  return value == null || value === '' ? null : Number(value);
}

function onPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const letterIndex = getLetterIndexFromPointer(event);
  if (letterIndex == null) return;
  event.preventDefault();
  verseDisplay.value?.focus({ preventScroll: true });
  selectSingleLetter(letterIndex);
  isDragging.value = true;
  verseDisplay.value?.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (!isDragging.value) return;
  const letterIndex = getLetterIndexFromPointer(event);
  if (letterIndex != null) setCursor(letterIndex);
}

function endDragging(event) {
  if (!isDragging.value) return;
  isDragging.value = false;
  if (verseDisplay.value?.hasPointerCapture?.(event.pointerId)) {
    verseDisplay.value.releasePointerCapture(event.pointerId);
  }
}

function onCursorKeydown(event) {
  const movements = {
    ArrowLeft: 1,
    ArrowRight: -1,
  };
  if (event.key in movements) {
    event.preventDefault();
    const nextIndex = cursor.value.clamp(cursorIndex.value + movements[event.key]);
    if (event.shiftKey) {
      setCursor(nextIndex);
    } else {
      selectSingleLetter(nextIndex);
    }
  } else if (event.key === 'Home') {
    event.preventDefault();
    event.shiftKey ? setCursor(0) : selectSingleLetter(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    event.shiftKey ? setCursor(cursor.value.count - 1) : selectSingleLetter(cursor.value.count - 1);
  }
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  searchResults.value = [];
  if (searchQuery.value.trim().length < 2) return;
  searchTimer = setTimeout(runSearch, 250);
}

watch(() => props.openReference, (reference) => {
  if (reference && !loadingBooks.value) openExternalReference(reference);
});

async function runSearch() {
  searchLoading.value = true;
  try {
    const response = await fetch(`/api/tanach/search?q=${encodeURIComponent(searchQuery.value.trim())}&limit=25`);
    const data = await response.json();
    searchResults.value = data.results || [];
  } finally {
    searchLoading.value = false;
  }
}

async function openSearchResult(item) {
  searchQuery.value = '';
  searchResults.value = [];
  if (item.type === 'parsha') {
    await openParsha(item.parsha_id);
    return;
  }
  selectedParshaId.value = '';
  selectedBookSlug.value = item.book_slug;
  selectedChapter.value = item.chapter;
  await loadChapter(item.verse);
}

async function toggleMilui() {
  if (!hasExplicitSelection.value || !selectedRange.value.text.trim()) return;
  miluiOpen.value = !miluiOpen.value;
  if (miluiOpen.value) await loadMiluiSettings();
  else explicitMiluiTotal.value = 0;
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
  if (!miluiSettingsLoaded.value) return;
  miluiSettingsSuccess.value = '';
  miluiSettingsOpen.value = true;
}

async function saveMiluiMapping(mapping) {
  miluiSettingsSaving.value = true;
  miluiSettingsError.value = '';
  miluiSettingsSuccess.value = '';
  try {
    const response = await fetch('/api/settings/milui', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'save_failed');
    const checked = normalizeMiluiMapping(payload.mapping);
    if (!checked.valid) throw new Error('invalid_saved_mapping');
    miluiMapping.value = checked.mapping;
    miluiSettingsLoaded.value = true;
    miluiSettingsSuccess.value = 'הגדרות המילוי עודכנו';
  } catch {
    miluiSettingsError.value = 'לא ניתן לשמור את הגדרות המילוי';
  } finally {
    miluiSettingsSaving.value = false;
  }
}

function tanachContext() {
  return {
    bookSlug: selectedBookSlug.value,
    chapter: selectedChapter.value,
    verse: selectedVerseNumber.value,
    start: rangeStart.value,
    end: rangeEnd.value,
    parshaId: activeParsha.value?.id,
  };
}

async function saveRange() {
  if (!result.value || saveStatus.value === 'loading' || matches.value.isAlreadySaved) return;
  saveStatus.value = 'loading';
  saveError.value = '';
  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: selectedRange.value.text,
        tanachContext: tanachContext(),
      }),
    });
    if (response.ok || response.status === 409) {
      saveStatus.value = 'saved';
      matches.value.isAlreadySaved = true;
    } else {
      saveStatus.value = 'idle';
      saveError.value = 'שגיאה בשמירת הטווח';
    }
  } catch {
    saveStatus.value = 'idle';
    saveError.value = 'שגיאת רשת';
  }
}

async function saveSelectedMiluiForms(formIds) {
  if (!miluiCalculation.value || saveAllStatus.value === 'loading') return;
  saveAllStatus.value = 'loading';
  saveError.value = '';
  try {
    const response = await fetch('/api/milui-interpretations/save-selected', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: selectedRange.value.text,
        formIds,
        tanachContext: tanachContext(),
      }),
    });
    if (!response.ok) throw new Error('save_failed');
    saveAllStatus.value = 'saved';
    saveStatus.value = 'saved';
    matches.value.isAlreadySaved = true;
    miluiMatchRefresh.value += 1;
    window.setTimeout(() => {
      saveAllStatus.value = 'idle';
      saveStatus.value = 'idle';
    }, 3000);
  } catch {
    saveAllStatus.value = 'idle';
    saveError.value = 'לא ניתן לשמור את אופני המילוי שנבחרו';
  }
}

async function saveAllMiluiForms() {
  if (!miluiCalculation.value || saveAllFormsStatus.value === 'loading') return;
  saveAllFormsStatus.value = 'loading';
  saveError.value = '';
  try {
    const response = await fetch('/api/milui-interpretations/save-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: selectedRange.value.text,
        tanachContext: tanachContext(),
      }),
    });
    if (!response.ok) throw new Error('save_failed');
    saveAllFormsStatus.value = 'saved';
    saveStatus.value = 'saved';
    matches.value.isAlreadySaved = true;
    miluiMatchRefresh.value += 1;
    window.setTimeout(() => {
      saveAllFormsStatus.value = 'idle';
      saveStatus.value = 'idle';
    }, 3000);
  } catch {
    saveAllFormsStatus.value = 'idle';
    saveError.value = 'לא ניתן לשמור את כל אופני המילוי';
  }
}

async function saveAsBaseWord() {
  const text = selectedRange.value.text?.trim();
  if (!hasExplicitSelection.value || !text) { saveError.value = 'בחר מילה או קטע בתנ״ך'; return; }
  saveMenuOpen.value = false;
  try {
    const response = await fetch('/api/base-words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText: text, sourceType: 'tanach' }),
    });
    if (response.status === 409) { saveError.value = 'כבר קיים במילות יסוד'; return; }
    if (!response.ok) throw new Error();
    window.dispatchEvent(new CustomEvent('base-words-changed'));
    saveError.value = 'נוסף למילות יסוד';
  } catch { saveError.value = 'לא ניתן לשמור כרגע'; }
}

onMounted(() => {
  loadBooks();
  loadMiluiSettings();
});
</script>

<style scoped>
.tanach-page { direction: rtl; }
.tanach-save{position:relative;display:flex}.save-range-menu-button{border-radius:0 7px 7px 0!important;border-inline-start:0!important;padding-inline:8px!important}.save-range-menu{position:absolute;top:calc(100% + 5px);right:0;z-index:15;background:#fffdf8;border:1px solid var(--border);border-radius:8px;padding:4px;box-shadow:0 8px 20px rgba(26,39,68,.14);min-width:165px}.save-range-menu button{border:0;background:transparent;padding:8px;width:100%;text-align:right;font:inherit;color:var(--navy);cursor:pointer}.save-range-menu button:hover{background:var(--gold-light)}
.tanach-layout {
  display: grid;
  grid-template-columns: 270px minmax(0, 1fr) 245px;
  gap: 16px;
  align-items: start;
  direction: ltr;
}
.tanach-layout > * { direction: rtl; }
.panel-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(26, 39, 68, 0.055);
}
.navigator-card, .summary-column { position: sticky; top: 78px; }
.navigator-card { overflow: hidden; height: calc(100dvh - 95px); min-height: 0; display: flex; flex-direction: column; }
.panel-heading { padding: 17px 18px 12px; border-bottom: 1px solid #eee9e0; }
.panel-heading h1 { font-size: 1.45rem; color: var(--navy); }
.panel-heading span, .verse-toolbar span { font-size: .74rem; color: var(--text-secondary); }
.search-wrap { display: flex; align-items: center; gap: 7px; margin: 12px; padding: 0 11px; border: 1px solid var(--border); border-radius: 8px; }
.search-wrap:focus-within { border-color: var(--gold); }
.search-wrap input { width: 100%; border: 0; outline: 0; padding: 9px 0; font: inherit; background: none; }
.search-results { overflow-y: auto; padding: 0 9px 10px; }
.search-results button { display: flex; width: 100%; flex-direction: column; gap: 3px; border: 0; border-bottom: 1px solid #eee; background: none; padding: 9px; text-align: right; cursor: pointer; font: inherit; }
.search-results button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: .76rem; color: var(--text-secondary); }
.search-results button small { color: var(--text-secondary); font-size: .72rem; }
.search-results button.search-result--navigation { background: #fffdf7; }
.search-results button.search-result--navigation strong { color: #80601d; }
.empty-search { padding: 22px; text-align: center; color: var(--text-secondary); }
.navigation-area { padding: 0 12px 10px; }
.navigation-heading { display: block; margin: 1px 2px 6px; color: #9b7a31; font-size: .67rem; font-weight: 800; }
.reference-selectors { display: grid; grid-template-columns: 1fr; gap: 8px; }
.chapter-verse-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; min-width: 0; }
.verse-list { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 0 9px 12px; }
.verse-chapter-divider { display: flex; align-items: center; gap: 8px; margin: 9px 8px 3px; color: #9b7a31; font-size: .68rem; font-weight: 800; }
.verse-chapter-divider::after { content: ''; flex: 1; height: 1px; background: #eee4d1; }
.verse-list button { display: grid; grid-template-columns: 25px 1fr; gap: 7px; width: 100%; border: 0; border-radius: 7px; padding: 8px; background: none; text-align: right; cursor: pointer; font: inherit; }
.verse-list button:hover { background: #f8f5ef; }
.verse-list button.active { background: var(--gold-light); color: #765812; }
.verse-number { font-weight: 700; }
.verse-preview { font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: .76rem; line-height: 1.65; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.reader-column { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.verse-card { padding: 22px 24px 25px; min-height: 340px; }
.verse-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; }
.verse-toolbar h2 { font-size: 1rem; color: var(--navy); margin-bottom: 2px; }
.verse-toolbar > div:first-child > .parsha-context { display: inline-flex; margin-top: 6px; padding: 3px 8px; border-radius: 999px; background: var(--gold-light); color: #80601d; font-size: .7rem; font-weight: 700; }
.verse-nav { display: flex; gap: 7px; }
.verse-nav button { border: 1px solid var(--border); border-radius: 7px; background: white; color: var(--navy); padding: 7px 11px; font: inherit; font-size: .76rem; cursor: pointer; }
.verse-display { padding: 50px 18px 28px; text-align: center; font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: clamp(1.8rem, 3.55vw, 2.9rem); line-height: 1.9; color: #152038; outline: none; user-select: none; -webkit-user-select: none; touch-action: pan-y; }
.verse-display:focus-visible { box-shadow: inset 0 0 0 2px rgba(192,152,64,.45); border-radius: 8px; }
.verse-token--letter { cursor: pointer; border-radius: 4px; transition: background .12s; }
.verse-token--letter:hover { background: #f2ead8; }
.verse-token--range { background: rgba(192, 152, 64, .18); }
.verse-token--current { background: #e5d2aa; color: #573f11; box-shadow: 0 2px 7px rgba(107,77,14,.18); }
.selection-hint { text-align: center; color: var(--text-secondary); font-size: .74rem; }
.calculation-area { display: flex; flex-direction: column; gap: 11px; }
.primary-result { border: 1.5px solid #ddc57f; border-radius: 11px; background: linear-gradient(135deg,#fffcf5,#fff9eb); padding: 17px 20px; display: flex; justify-content: space-between; align-items: center; }
.eyebrow { display: block; color: var(--text-secondary); font-size: .7rem; font-weight: 700; margin-bottom: 5px; }
.primary-value { display: flex; align-items: baseline; gap: 10px; }
.primary-value strong { color: var(--gold); font-size: 2.25rem; }
.primary-value b { color: var(--navy); font-size: 1.5rem; }
.save-range { border: 1px solid var(--gold); border-radius: 8px; background: rgba(192,152,64,.1); color: #8b671d; padding: 8px 12px; font: inherit; font-weight: 700; cursor: pointer; }
.save-range.saved { color: #388e3c; border-color: #82bd89; background: #edf8ee; }
.secondary-results { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.secondary-results article { background: white; border: 1px solid var(--border); border-radius: 10px; padding: 15px 18px; }
.secondary-results strong { color: var(--navy); font-size: 1.4rem; }
.tanach-milui-disclosure { background: #fff; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.tanach-milui-summary { align-items: center; background: transparent; border: 0; color: var(--navy); cursor: pointer; display: flex; font: inherit; gap: 16px; justify-content: space-between; min-height: 66px; padding: 11px 17px; text-align: right; width: 100%; }
.tanach-milui-summary:hover:not(:disabled), .tanach-milui-summary[aria-expanded="true"] { background: #fdfaf3; }
.tanach-milui-summary:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }
.tanach-milui-summary:disabled { cursor: default; opacity: .72; }
.tanach-milui-summary__label { align-items: flex-start; display: flex; flex-direction: column; min-width: 0; }
.tanach-milui-summary__label .eyebrow { color: var(--navy); margin: 0; }
.tanach-milui-summary__label small { color: var(--text-secondary); font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: .86rem; line-height: 1.55; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tanach-milui-summary__value { align-items: baseline; display: flex; flex: 0 0 auto; gap: 6px; }
.tanach-milui-summary__value b { color: var(--gold); font-size: 1.35rem; }
.tanach-milui-summary__value strong { color: var(--navy); font-size: 1.05rem; }
.milui-load-error { border-top: 1px solid var(--border); color: #9b2c2c; font-size: .76rem; margin: 0; padding: 10px 17px; }
.milui-load-error button { background: transparent; border: 0; color: inherit; cursor: pointer; font: inherit; text-decoration: underline; }
.word-breakdown { background: white; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.word-breakdown summary { padding: 13px 17px; cursor: pointer; color: var(--navy); font-weight: 700; }
.word-result { padding: 10px 17px; border-top: 1px solid #eee9e0; }
.word-result div { display: flex; justify-content: space-between; }
.word-result div span, .word-result small { color: var(--text-secondary); }
.summary-column { display: flex; flex-direction: column; gap: 12px; }
.summary-card { padding: 17px; }
.range-mode { display: flex; justify-content: space-between; border-bottom: 1px solid #eee9e0; padding-bottom: 12px; font-size: .8rem; }
.range-mode b { color: var(--gold); }
.current-letter { text-align: center; padding-top: 15px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.current-letter strong { font-size: 2.3rem; color: var(--navy); }
.current-letter span:not(.eyebrow) { color: var(--text-secondary); font-size: .75rem; }
.current-letter b { margin-top: 7px; font-size: 1.25rem; color: var(--gold); }
.summary-card dl div { display: flex; justify-content: space-between; padding: 7px 0; font-size: .8rem; }
.summary-card dt { color: var(--text-secondary); }
.summary-card dd { font-weight: 700; color: var(--navy); }
.progress-track { height: 6px; margin: 13px 0 7px; border-radius: 4px; background: #eee9e0; overflow: hidden; direction: rtl; }
.progress-track span { display: block; height: 100%; background: var(--gold); border-radius: inherit; }
.progress-card b { font-size: .75rem; color: var(--text-secondary); }
.source-note { margin-top: 14px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: .72rem; color: var(--text-secondary); }
.reader-state { min-height: 50vh; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 9px; color: var(--text-secondary); text-align: center; }
.reader-state .mdi { font-size: 2rem; color: var(--gold); }
.reader-state--error strong { color: var(--navy); }
.save-error { color: #c62828; font-size: .78rem; }
@media (max-width: 1050px) {
  .tanach-layout { grid-template-columns: minmax(0, 1fr) 220px; }
  .navigator-card { position: static; grid-column: 1 / -1; }
  .summary-column { top: 78px; }
}
@media (max-width: 720px) {
  .tanach-layout { display: flex; flex-direction: column; }
  .navigator-card, .reader-column, .summary-column { width: 100%; position: static; }
  .reader-column { order: -1; }
  .verse-card { padding: 16px; min-height: 0; }
  .verse-toolbar { flex-direction: column; }
  .verse-display { padding: 30px 5px; font-size: 2rem; line-height: 1.8; }
  .summary-column { display: grid; grid-template-columns: 1fr 1fr; }
  .summary-column .progress-card { grid-column: 1 / -1; }
}
@media (max-width: 470px) {
  .secondary-results, .summary-column { grid-template-columns: 1fr; }
  .summary-column .progress-card { grid-column: auto; }
  .primary-result { align-items: flex-start; gap: 12px; }
  .primary-value strong { font-size: 1.8rem; }
  .tanach-milui-summary { gap: 9px; padding-inline: 13px; }
  .tanach-milui-summary__label small { max-width: 175px; }
  .tanach-milui-summary__value b { font-size: 1.15rem; }
}
</style>