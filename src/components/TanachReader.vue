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
            placeholder="חפש ספר או טקסט..."
            aria-label="חיפוש בתנ״ך"
            @input="scheduleSearch"
          />
        </div>

        <div v-if="searchQuery.trim().length >= 2" class="search-results">
          <button
            v-for="item in searchResults"
            :key="`${item.book_slug}-${item.chapter}-${item.verse}`"
            @click="openSearchResult(item)"
          >
            <strong>{{ item.book_name }} {{ toHebrewNumber(item.chapter) }}:{{ toHebrewNumber(item.verse) }}</strong>
            <span>{{ item.display_text }}</span>
          </button>
          <div v-if="!searchLoading && searchResults.length === 0" class="empty-search">לא נמצאו תוצאות</div>
        </div>

        <template v-else>
          <div class="reference-selectors">
            <label>
              <span>ספר</span>
              <select v-model="selectedBookSlug" @change="onBookChange">
                <optgroup
                  v-for="canonical in canonicalBooks"
                  :key="canonical.order"
                  :label="canonical.name"
                >
                  <option v-for="segment in canonical.segments" :key="segment.slug" :value="segment.slug">
                    {{ segment.hebrew_name }}
                  </option>
                </optgroup>
              </select>
            </label>
            <label>
              <span>פרק</span>
              <select v-model.number="selectedChapter" @change="loadChapter()">
                <option v-for="chapter in selectedBook?.chapter_count || 1" :key="chapter" :value="chapter">
                  {{ toHebrewNumber(chapter) }}
                </option>
              </select>
            </label>
          </div>

          <div class="verse-list" aria-label="פסוקי הפרק">
            <button
              v-for="item in verses"
              :key="item.verse"
              :class="{ active: item.verse === selectedVerseNumber }"
              @click="selectVerse(item.verse)"
            >
              <span class="verse-number">{{ toHebrewNumber(item.verse) }}</span>
              <span class="verse-preview">{{ item.display_text }}</span>
            </button>
          </div>
        </template>
      </aside>

      <main class="reader-column">
        <section class="verse-card panel-card">
          <header class="verse-toolbar">
            <div>
              <h2>{{ referenceLabel }}</h2>
              <span>פסוק {{ selectedVerseNumber }} מתוך {{ verses.length }}</span>
            </div>
            <div class="verse-nav">
              <button @click="moveVerse(-1)" title="הפסוק הקודם">
                <span class="mdi mdi-chevron-right"></span> קודם
              </button>
              <button @click="moveVerse(1)" title="הפסוק הבא">
                הבא <span class="mdi mdi-chevron-left"></span>
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
            <button
              class="save-range"
              :class="{ saved: saveStatus === 'saved' || matches.isAlreadySaved }"
              :disabled="saveStatus === 'loading' || matches.isAlreadySaved"
              @click="saveRange"
            >
              <span class="mdi" :class="saveStatus === 'loading' ? 'mdi-loading mdi-spin' : 'mdi-bookmark-outline'"></span>
              {{ matches.isAlreadySaved ? 'כבר שמור' : saveStatus === 'saved' ? 'נשמר' : 'שמור טווח' }}
            </button>
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
import MatchPanel from './MatchPanel.vue';

const canonicalBooks = ref([]);
const books = ref([]);
const verses = ref([]);
const source = ref(null);
const stats = ref({});
const selectedBookSlug = ref('Genesis');
const selectedChapter = ref(1);
const selectedVerseNumber = ref(1);
const anchorLetterIndex = ref(0);
const focusLetterIndex = ref(0);
const isDragging = ref(false);
const loadingBooks = ref(true);
const loadError = ref('');
const searchQuery = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const saveStatus = ref('idle');
const saveError = ref('');
const verseDisplay = ref(null);
let searchTimer;

const selectedBook = computed(() => books.value.find(book => book.slug === selectedBookSlug.value));
const selectedVerse = computed(() => verses.value.find(verse => verse.verse === selectedVerseNumber.value));
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
const { matches } = useLiveMatching(result);

watch(selectedVerse, () => {
  anchorLetterIndex.value = 0;
  focusLetterIndex.value = 0;
  isDragging.value = false;
  saveStatus.value = 'idle';
  saveError.value = '';
  nextTick(() => verseDisplay.value?.focus());
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
    source.value = data.source;
    stats.value = data.stats;
    if (!books.value.some(book => book.slug === selectedBookSlug.value)) {
      selectedBookSlug.value = books.value[0].slug;
    }
    await loadChapter();
  } catch (error) {
    loadError.value = error.message;
  } finally {
    loadingBooks.value = false;
  }
}

async function loadChapter(preferredVerse = 1) {
  const response = await fetch(`/api/tanach/verses?book=${encodeURIComponent(selectedBookSlug.value)}&chapter=${selectedChapter.value}`);
  if (!response.ok) {
    loadError.value = 'לא ניתן לטעון את הפרק';
    return;
  }
  const data = await response.json();
  verses.value = data.verses;
  selectedVerseNumber.value = verses.value.some(item => item.verse === preferredVerse)
    ? preferredVerse
    : verses.value[0]?.verse || 1;
}

function onBookChange() {
  selectedChapter.value = 1;
  loadChapter();
}

function selectVerse(verse) {
  selectedVerseNumber.value = verse;
}

async function moveVerse(delta) {
  const index = verses.value.findIndex(item => item.verse === selectedVerseNumber.value);
  const next = verses.value[index + delta];
  if (next) {
    selectedVerseNumber.value = next.verse;
    return;
  }
  const nextChapter = selectedChapter.value + delta;
  if (nextChapter >= 1 && nextChapter <= (selectedBook.value?.chapter_count || 1)) {
    selectedChapter.value = nextChapter;
    await loadChapter(delta < 0 ? Number.MAX_SAFE_INTEGER : 1);
    if (delta < 0) selectedVerseNumber.value = verses.value.at(-1)?.verse || 1;
    return;
  }
  const bookIndex = books.value.findIndex(book => book.slug === selectedBookSlug.value);
  const adjacentBook = books.value[bookIndex + delta];
  if (adjacentBook) {
    selectedBookSlug.value = adjacentBook.slug;
    selectedChapter.value = delta > 0 ? 1 : adjacentBook.chapter_count;
    await loadChapter();
    if (delta < 0) selectedVerseNumber.value = verses.value.at(-1)?.verse || 1;
  }
}

function setCursor(index) {
  focusLetterIndex.value = cursor.value.clamp(index);
}

function selectSingleLetter(index) {
  const clamped = cursor.value.clamp(index);
  anchorLetterIndex.value = clamped;
  focusLetterIndex.value = clamped;
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
  selectedBookSlug.value = item.book_slug;
  selectedChapter.value = item.chapter;
  await loadChapter(item.verse);
  searchQuery.value = '';
  searchResults.value = [];
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
        tanachContext: {
          bookSlug: selectedBookSlug.value,
          chapter: selectedChapter.value,
          verse: selectedVerseNumber.value,
          start: rangeStart.value,
          end: rangeEnd.value,
        },
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

onMounted(loadBooks);
</script>

<style scoped>
.tanach-page { direction: rtl; }
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
.navigator-card { overflow: hidden; max-height: calc(100vh - 98px); display: flex; flex-direction: column; }
.panel-heading { padding: 17px 18px 12px; border-bottom: 1px solid #eee9e0; }
.panel-heading h1 { font-size: 1.45rem; color: var(--navy); }
.panel-heading span, .verse-toolbar span { font-size: .74rem; color: var(--text-secondary); }
.search-wrap { display: flex; align-items: center; gap: 7px; margin: 12px; padding: 0 11px; border: 1px solid var(--border); border-radius: 8px; }
.search-wrap:focus-within { border-color: var(--gold); }
.search-wrap input { width: 100%; border: 0; outline: 0; padding: 9px 0; font: inherit; background: none; }
.search-results { overflow-y: auto; padding: 0 9px 10px; }
.search-results button { display: flex; width: 100%; flex-direction: column; gap: 3px; border: 0; border-bottom: 1px solid #eee; background: none; padding: 9px; text-align: right; cursor: pointer; font: inherit; }
.search-results button span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: .76rem; color: var(--text-secondary); }
.empty-search { padding: 22px; text-align: center; color: var(--text-secondary); }
.reference-selectors { display: grid; grid-template-columns: 1fr 80px; gap: 8px; padding: 0 12px 10px; }
.reference-selectors label { display: flex; flex-direction: column; gap: 3px; font-size: .68rem; color: var(--text-secondary); }
.reference-selectors select { border: 1px solid var(--border); border-radius: 7px; background: #fff; padding: 7px; font: inherit; color: var(--navy); }
.verse-list { overflow-y: auto; padding: 0 9px 12px; }
.verse-list button { display: grid; grid-template-columns: 25px 1fr; gap: 7px; width: 100%; border: 0; border-radius: 7px; padding: 8px; background: none; text-align: right; cursor: pointer; font: inherit; }
.verse-list button:hover { background: #f8f5ef; }
.verse-list button.active { background: var(--gold-light); color: #765812; }
.verse-number { font-weight: 700; }
.verse-preview { font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: .76rem; line-height: 1.65; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.reader-column { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.verse-card { padding: 22px 24px 25px; min-height: 340px; }
.verse-toolbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; }
.verse-toolbar h2 { font-size: 1rem; color: var(--navy); margin-bottom: 2px; }
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
  .navigator-card { position: static; grid-column: 1 / -1; max-height: none; }
  .verse-list { max-height: 240px; }
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
}
</style>