<template>
  <section
    :id="`saved-entry-detail-${entry.id}`"
    :data-detail-entry-id="entry.id"
    class="entry-detail detail-panel"
    aria-label="פרטי הערך השמור"
  >
    <div v-if="entry.tanach_book_slug" class="detail-row detail-reference">
      <span class="detail-label">מקור בתנ״ך:</span>
      <span class="detail-value">{{ formatTanachReference(entry) }}</span>
      <span class="detail-gematria">אותיות {{ entry.tanach_start + 1 }}–{{ entry.tanach_end + 1 }}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">ראשי תיבות:</span>
      <span class="detail-value">{{ entry.initials }}</span>
      <span class="detail-gematria">{{ entry.initials_gematria }} · {{ entry.initials_gematria_hebrew }}</span>
    </div>

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
import { getWordBreakdown, toHebrewNumber } from '@/composables/useGematria.js';

defineProps({
  entry: { type: Object, required: true },
});

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
</script>

<style scoped>
.entry-detail {
  background: #fafaf7;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  grid-column: 1 / -1;
  padding: 18px 22px;
  width: 100%;
}

.detail-row {
  align-items: center;
  display: flex;
  font-size: .88rem;
  gap: 8px;
}

.detail-reference {
  border-bottom: 1px solid #eee9e0;
  padding-bottom: 12px;
}

.detail-label {
  color: var(--text-secondary);
  font-size: .82rem;
  font-weight: 500;
  white-space: nowrap;
}

.detail-value { color: var(--navy); font-size: 1rem; font-weight: 600; }
.detail-gematria { color: var(--text-secondary); font-size: .82rem; margin-right: auto; }
.detail-words { font-size: .88rem; }
.detail-words-title { margin-bottom: 8px; }

.detail-word-row {
  border-bottom: 1px solid #f0ece4;
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
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
  padding: 6px 0 9px;
}

.detail-letter { white-space: nowrap; }

.detail-meta {
  align-items: center;
  color: #aaad;
  display: flex;
  font-size: .75rem;
  gap: 4px;
}

@media (max-width: 680px) {
  .entry-detail { gap: 12px; padding: 15px 16px; }
  .detail-row { align-items: flex-start; flex-wrap: wrap; }
}
</style>