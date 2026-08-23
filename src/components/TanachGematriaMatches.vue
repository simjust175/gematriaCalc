<template>
  <section class="gematria-discovery" dir="rtl" aria-labelledby="matches-title">
    <header class="discovery-header">
      <div class="heading-block">
        <span class="section-kicker">הדים מספריים בתנ״ך</span>
        <h2 id="matches-title">איפה עוד מופיע הערך {{ formattedTarget }}?</h2>
        <p>חיפוש ממוקד במאגר התנ״ך, לפי הסדר הקנוני — כדי לתת למספר הקשר.</p>
      </div>
      <div class="total-mark" aria-live="polite">
        <strong>{{ allTotal.toLocaleString('he-IL') }}</strong>
        <span>התאמות</span>
      </div>
    </header>

    <div class="controls" role="toolbar" aria-label="סינון התאמות">
      <div class="filter-list" role="group" aria-label="סוג התאמה">
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
    </div>

    <div v-if="loading && !results.length" class="match-grid" aria-label="טוען התאמות" aria-busy="true">
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
      <strong>לא נמצאו התאמות מהסוג הזה</strong>
      <span>אפשר לבחור סיווג אחר או להמשיך לחקור ערך חדש במחשבון.</span>
    </div>
    <div v-else class="match-grid" aria-live="polite">
      <article v-for="(result, index) in results" :key="resultKey(result)" class="match-card">
        <div class="card-topline">
          <span class="type-label">{{ typeLabel(result.type) }}</span>
          <span class="match-index">{{ String(index + 1).padStart(2, '0') }}</span>
        </div>
        <div class="citation">
          <strong>{{ citation(result) }}</strong>
        </div>
        <p class="context-text">
          <span v-if="result.beforeText" class="muted-text">{{ result.beforeText }}</span>
          <mark>{{ result.text }}</mark>
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
            :class="{ saved: savedKeys.has(resultKey(result)), saving: savingKey === resultKey(result) }"
            :disabled="savingKey === resultKey(result) || savedKeys.has(resultKey(result))"
            @click="saveResult(result, resultKey(result))"
          >
            <span class="mdi" :class="savedKeys.has(resultKey(result)) ? 'mdi-bookmark-check-outline' : 'mdi-bookmark-outline'" aria-hidden="true"></span>
            {{ savedKeys.has(resultKey(result)) ? 'נשמר' : 'שמור טווח' }}
          </button>
        </footer>
        <span v-if="saveErrors.has(resultKey(result))" class="save-error" role="status">לא ניתן לשמור כרגע</span>
      </article>
    </div>

    <div v-if="loading && results.length" class="loading-note" role="status">טוען עוד התאמות…</div>
    <button v-if="hasMore && !loading" type="button" class="load-more" @click="loadMore">
      הצג התאמות נוספות <span class="mdi mdi-arrow-down" aria-hidden="true"></span>
    </button>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useTanachGematriaMatches } from '@/composables/useTanachGematriaMatches.js';
import { toHebrewNumber } from '@/composables/useGematria.js';

const props = defineProps({ target: { type: Number, required: true } });
const emit = defineEmits(['open', 'saved']);
const savedKeys = ref(new Set());
const saveErrors = ref(new Set());
const savingKey = ref('');
const filterOptions = [
  { value: 'all', label: 'הכול' },
  { value: 'whole_word', label: 'מילה שלמה' },
  { value: 'whole_phrase', label: 'צירוף שלם' },
  { value: 'partial', label: 'חלק ממילה' },
];
const { results, counts, total, loading, error, filter, hasMore, setFilter, loadMore, refresh } =
  useTanachGematriaMatches(computed(() => props.target));

const formattedTarget = computed(() => Number(props.target || 0).toLocaleString('he-IL'));
const allTotal = computed(() => Number(counts.value.all ?? total.value) || 0);

function typeLabel(type) {
  return { whole_word: 'מילה שלמה', whole_phrase: 'צירוף שלם', partial: 'חלק ממילה' }[type] || 'התאמה';
}
function citation(item) {
  const book = item.bookName || item.book || item.bookSlug || '';
  return `${book} ${toHebrewNumber(item.chapter)}:${toHebrewNumber(item.verse)}`.trim();
}
function resultKey(item) {
  return item.id || `${item.bookSlug || item.book || ''}-${item.chapter}-${item.verse}-${item.start}-${item.end}`;
}
function openResult(item) {
  emit('open', item);
}
function retry() {
  refresh();
}
async function saveResult(item, key) {
  if (savingKey.value) return;
  savingKey.value = key;
  saveErrors.value = new Set([...saveErrors.value].filter(item => item !== key));
  try {
    const response = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalText: item.text,
        tanachContext: {
          bookSlug: item.bookSlug,
          chapter: item.chapter,
          verse: item.verse,
          start: item.start,
          end: item.end,
        },
      }),
    });
    if (!response.ok && response.status !== 409) throw new Error('save');
    savedKeys.value = new Set([...savedKeys.value, key]);
    emit('saved', item);
  } catch {
    saveErrors.value = new Set([...saveErrors.value, key]);
  } finally {
    savingKey.value = '';
  }
}
</script>

<style scoped>
.gematria-discovery { margin-top: 24px; color: var(--navy, #1a2744); }
.discovery-header { display: flex; justify-content: space-between; gap: 20px; align-items: end; padding: 20px 2px 15px; border-top: 1px solid var(--border, #e8e1d5); }
.section-kicker { color: #96732b; font-size: .7rem; font-weight: 800; letter-spacing: .12em; }
h2 { margin: 5px 0 4px; font-size: clamp(1.2rem, 2vw, 1.65rem); font-weight: 750; }
.heading-block p { margin: 0; color: var(--text-secondary, #74716a); font-size: .83rem; }
.total-mark { min-width: 86px; text-align: left; }
.total-mark strong { display: block; font-size: 1.65rem; font-variant-numeric: tabular-nums; color: #96732b; }
.total-mark span { color: var(--text-secondary, #74716a); font-size: .7rem; }
.controls { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.filter-list { display: flex; flex-wrap: wrap; gap: 6px; }
.filter-list button, .load-more, .card-actions button { border: 1px solid var(--border, #e8e1d5); background: #fff; color: var(--navy, #1a2744); border-radius: 7px; padding: 7px 10px; font: inherit; font-size: .74rem; cursor: pointer; transition: background .16s, color .16s, border-color .16s, transform .16s; }
.filter-list button:hover, .card-actions button:hover:not(:disabled), .load-more:hover { transform: translateY(-1px); border-color: #c09840; }
.filter-list button.active { background: var(--gold-light, #f6edda); color: #765812; border-color: #d4b96c; font-weight: 700; }
.filter-list button span { margin-inline-start: 4px; opacity: .7; font-variant-numeric: tabular-nums; }
.match-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.match-card { display: flex; flex-direction: column; min-height: 190px; padding: 14px 15px 12px; border: 1px solid var(--border, #e8e1d5); border-radius: 10px; background: #fff; box-shadow: 0 2px 10px rgba(26,39,68,.035); transition: transform .18s, box-shadow .18s; }
.match-card:hover { transform: translateY(-2px); box-shadow: 0 7px 18px rgba(26,39,68,.08); }
.card-topline, .card-actions { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.type-label { color: #8e6d2c; font-size: .68rem; font-weight: 800; }
.match-index { color: #c9c0b1; font-size: .68rem; font-variant-numeric: tabular-nums; }
.citation { margin-top: 12px; }
.citation strong { font-size: .94rem; }
.citation span { color: var(--text-secondary, #74716a); font-size: .68rem; }
.context-text { margin: 12px 0 16px; color: #5b5a56; font-family: "Noto Serif Hebrew", "Times New Roman", serif; font-size: 1.08rem; line-height: 1.9; }
.context-text mark { padding: 2px 4px; border-radius: 3px; background: #f2e4bd; color: #4e3b13; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.muted-text { color: #b0aaa0; }
.card-actions { margin-top: auto; padding-top: 10px; border-top: 1px solid #f0ece5; }
.card-actions button { padding: 6px 8px; border-color: transparent; background: transparent; font-size: .7rem; }
.reader-action { color: #69727b !important; }
.save-action { color: #98732b !important; }
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
@media (max-width: 560px) { .discovery-header { align-items: flex-start; }.match-grid { grid-template-columns: 1fr; }.total-mark { min-width: 60px; }.total-mark strong { font-size: 1.25rem; } }
</style>