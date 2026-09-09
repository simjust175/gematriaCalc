<template>
  <section
    :id="`saved-entry-detail-${entry.id}`"
    :data-detail-entry-id="entry.id"
    class="entry-detail detail-panel"
    aria-label="פרטי הערך השמור"
  >
    <header class="detail-header">
      <strong>פרטי החישוב</strong>
      <button type="button" class="detail-close" aria-label="סגור פירוט" @click="$emit('close')">
        <span class="mdi mdi-close" aria-hidden="true"></span>
        סגור
      </button>
    </header>

    <div class="derived-values">
      <div v-if="entry.tanach_book_slug" class="detail-row detail-reference">
        <span class="detail-label">מקור בתנ״ך</span>
        <span class="detail-value">{{ formatTanachReference(entry) }}</span>
        <span class="detail-gematria">אותיות {{ entry.tanach_start + 1 }}–{{ entry.tanach_end + 1 }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">ראשי תיבות</span>
        <span class="detail-value">{{ entry.initials }}</span>
        <span class="detail-gematria">{{ entry.initials_gematria }} · {{ entry.initials_gematria_hebrew }}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">סופי תיבות</span>
        <span class="detail-value">{{ entry.finals }}</span>
        <span class="detail-gematria">{{ entry.finals_gematria }} · {{ entry.finals_gematria_hebrew }}</span>
      </div>
      <div v-if="currentMilui" class="detail-row detail-row--milui">
        <span class="detail-label">מילוי נוכחי</span>
        <span class="detail-gematria">
          {{ currentMilui.fullGematria }} · {{ currentMilui.fullHebrewNumber }}
        </span>
      </div>
    </div>

    <section v-if="entry.curated_matches?.length" class="curated-section" aria-label="התאמות נבחרות">
      <h3>
        התאמות נבחרות
        <span>{{ entry.curated_matches.length }}</span>
      </h3>
      <article v-for="match in entry.curated_matches" :key="match.id" class="curated-match">
        <div class="curated-match__text">{{ match.original_text || match.originalText }}</div>
        <div class="curated-match__meta">
          <span>{{ matchReference(match) }}</span>
          <span v-for="reason in (match.reason_codes || match.reasonCodes || [])" :key="reason" class="reason-badge">{{ reasonLabel(reason) }}</span>
          <button type="button" @click="$emit('open-curated', match)">פתח בקורא</button>
          <button v-if="removingId !== match.id" type="button" class="remove-curated" @click="removingId = match.id">הסר</button>
          <template v-else>
            <span class="remove-confirm">להסיר?</span>
            <button type="button" class="remove-confirm-button" @click="$emit('remove-curated', { entry, match }); removingId = null">אישור</button>
            <button type="button" class="remove-cancel-button" @click="removingId = null">ביטול</button>
          </template>
        </div>
      </article>
    </section>

    <div v-if="entry.words && entry.words.length > 0" class="detail-words">
      <div class="detail-label detail-words-title">פירוט מילים:</div>
      <div v-for="word in getWordBreakdown(entry.original_text)" :key="word.position" class="detail-word-block">
        <div class="detail-word-row">
          <span class="word-text">{{ word.word }}</span>
          <span class="word-gematria">{{ word.gematria }}</span>
        </div>
        <div class="detail-letter-list">
          <span v-for="letter in word.letters" :key="`${word.position}-${letter.letter}-${letter.value}`" class="detail-letter">
            {{ letter.letter }} · {{ letter.value }}
          </span>
        </div>
      </div>
    </div>

    <div class="detail-meta">
      <span class="mdi mdi-clock-outline" aria-hidden="true"></span>
      {{ formatDate(entry.created_at) }}
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { getWordBreakdown, toHebrewNumber } from '@/composables/useGematria.js';
import { calculateMilui } from '@/utils/milui.js';

const props = defineProps({
  entry: { type: Object, required: true },
  miluiMapping: { type: Object, default: null },
});
defineEmits(['close', 'open-curated', 'remove-curated']);
const removingId = ref(null);

const currentMilui = computed(() => (
  props.miluiMapping
    ? calculateMilui(props.entry.original_text, props.miluiMapping)
    : null
));

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTanachReference(entry) {
  const reference = `${entry.tanach_book_label} ${toHebrewNumber(entry.tanach_chapter)}:${toHebrewNumber(entry.tanach_verse)}`;
  return entry.parsha_name ? `${reference} · פרשת ${entry.parsha_name}` : reference;
}
function reasonLabel(reason) {
  return {
    full_gematria: 'גימטריה',
    initials_text: 'ראשי תיבות',
    initials_gematria: 'גימטריית ר״ת',
    finals_text: 'סופי תיבות',
    finals_gematria: 'גימטריית ס״ת',
    saved_word: 'מילה שמורה',
    milui_gematria: 'מילוי',
  }[reason] || reason;
}
function matchReference(match) {
  const context = match.tanach_context || match.tanachContext || match;
  const book = match.book_label || match.bookLabel || match.book_name || match.bookName
    || context.book_label || context.bookLabel || context.book_name || context.bookName
    || context.book_slug || context.bookSlug || '';
  return `${book} ${toHebrewNumber(context.chapter)}:${toHebrewNumber(context.verse)}`.trim();
}
</script>

<style scoped>
.entry-detail {
  background: #fafaf7;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  grid-column: 1 / -1;
  padding: 13px 16px 11px;
  width: 100%;
}
.detail-header { align-items: center; display: flex; justify-content: space-between; min-height: 28px; }
.detail-header > strong { color: var(--navy); font-size: .86rem; }
.detail-close {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: .76rem;
  gap: 3px;
  padding: 4px 7px;
}
.detail-close:hover { background: var(--gold-light); border-color: #e1d1aa; color: var(--navy); }
.detail-close:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.derived-values { display: grid; gap: 6px; grid-template-columns: repeat(3, minmax(0, 1fr)); }

.detail-row {
  align-items: center;
  display: flex;
  font-size: .88rem;
  background: #fff;
  border: 1px solid #eee9e0;
  border-radius: 8px;
  gap: 6px;
  min-width: 0;
  padding: 7px 9px;
}

.detail-reference { grid-column: 1 / -1; }

.detail-label {
  color: var(--text-secondary);
  font-size: .82rem;
  font-weight: 500;
  white-space: nowrap;
}

.detail-value { color: var(--navy); font-size: 1rem; font-weight: 600; }
.detail-gematria { color: var(--text-secondary); font-size: .82rem; margin-right: auto; white-space: nowrap; }
.detail-words { border-top: 1px solid #eee9e0; display: grid; font-size: .84rem; gap: 0 14px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); padding-top: 8px; }
.detail-words-title { grid-column: 1 / -1; margin-bottom: 3px; }

.detail-word-row {
  border-bottom: 1px solid #f0ece4;
  display: flex;
  justify-content: space-between;
  padding: 3px 0;
}

.detail-word-block:last-child .detail-word-row { border-bottom: 0; }
.word-text { color: var(--navy); font-weight: 500; }
.word-gematria { color: var(--gold); font-weight: 600; }

.detail-letter-list {
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: .75rem;
  gap: 5px 10px;
  padding: 3px 0 5px;
}

.detail-letter { white-space: nowrap; }

.detail-meta {
  align-items: center;
  color: #aaad;
  display: flex;
  font-size: .75rem;
  gap: 4px;
}
.curated-section { background: #fffdf8; border: 1px solid #eadfca; border-radius: 9px; padding: 8px 10px; }
.curated-section h3 { align-items: center; color: var(--navy); display: flex; font-size: .86rem; gap: 6px; margin: 0 0 4px; }
.curated-section h3 span { background: var(--gold-light); border-radius: 999px; color: #80601d; font-size: .68rem; padding: 1px 6px; }
.curated-match { border-bottom: 1px solid #f0ece4; padding: 5px 0; }
.curated-match:last-child { border-bottom: 0; }
.curated-match__text { color: var(--navy); font-family: "Noto Serif Hebrew", serif; font-size: .92rem; line-height: 1.45; }
.curated-match__meta { align-items: center; display: flex; flex-wrap: wrap; gap: 6px; color: var(--text-secondary); font-size: .72rem; }
.reason-badge { background: var(--gold-light); border-radius: 999px; color: #80601d; padding: 2px 7px; }
.curated-match__meta button { border: 0; background: transparent; color: #80601d; cursor: pointer; font: inherit; }
.curated-match__meta .remove-curated { color: #9a5b50; }
.remove-confirm { color: #8b6a2a; }
.remove-confirm-button, .remove-cancel-button { padding: 2px 5px; }

@media (max-width: 680px) {
  .entry-detail { gap: 9px; padding: 11px 12px; }
  .derived-values { grid-template-columns: 1fr; }
  .detail-reference { grid-column: auto; }
  .detail-row { align-items: flex-start; flex-wrap: wrap; }
}
</style>