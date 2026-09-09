<template>
  <article
    class="entry-card"
    :class="{ expanded, 'has-shared-value': sharedValue }"
    :data-entry-id="entry.id"
  >
    <div class="entry-body entry-header" @click="$emit('toggle', entry.id)">
      <div class="entry-main-info">
        <div class="entry-text">
          <template v-for="(part, index) in highlightedPhrase" :key="`${part.text}-${index}`">
            <mark v-if="part.match">{{ part.text }}</mark>
            <span v-else>{{ part.text }}</span>
          </template>
        </div>
        <div v-if="entry.tanach_book_slug" class="tanach-reference">
          <span class="mdi mdi-book-open-page-variant-outline" aria-hidden="true"></span>
          {{ formatTanachReference(entry) }}
        </div>
        <div class="entry-gematria">
          <span class="gematria-num">{{ entry.full_gematria }}</span>
          <span class="gematria-dot">·</span>
          <span class="gematria-heb">{{ entry.full_gematria_hebrew }}</span>
        </div>
        <div class="entry-initials">
          <span>ר״ת:</span>
          <strong>{{ entry.initials }}</strong>
          <span class="initials-gematria-label">גימטריית ר״ת:</span>
          <strong>{{ entry.initials_gematria }}</strong>
          <span class="gematria-dot">·</span>
          <span>{{ entry.initials_gematria_hebrew }}</span>
        </div>
        <div v-if="Number(entry.curated_match_count)" class="curated-count">
          <span class="mdi mdi-star-outline" aria-hidden="true"></span>
          {{ entry.curated_match_count }} התאמות שמורות
        </div>
        <div class="entry-initials">
          <span>ס״ת:</span>
          <strong>{{ entry.finals }}</strong>
          <span class="initials-gematria-label">גימטריית סופי תיבות:</span>
          <strong>{{ entry.finals_gematria }}</strong>
          <span class="gematria-dot">·</span>
          <span>{{ entry.finals_gematria_hebrew }}</span>
        </div>
      </div>

    </div>

    <div class="entry-footer" @click.stop>
      <button
        class="detail-btn"
        type="button"
        :aria-expanded="expanded"
        :aria-controls="expanded ? `saved-entry-detail-${entry.id}` : undefined"
        @click="$emit('toggle', entry.id)"
      >
        {{ expanded ? 'סגור' : 'פתח פירוט' }}
        <span
          class="expand-icon ui-chevron"
          :class="expanded ? 'ui-chevron--up' : 'ui-chevron--down'"
          aria-hidden="true"
        ></span>
      </button>

      <div class="entry-menu-wrap">
        <button
          class="menu-btn"
          type="button"
          :aria-label="`פעולות עבור ${entry.original_text}`"
          :aria-expanded="menuOpen"
          @click="$emit('toggle-menu', entry.id)"
        >
          <span aria-hidden="true">⋯</span>
        </button>
        <div v-if="menuOpen" class="entry-menu" role="menu">
          <button type="button" role="menuitem" @click="$emit('toggle', entry.id)">
            <span class="mdi mdi-open-in-new" aria-hidden="true"></span>
            {{ expanded ? 'סגור פירוט' : 'פתח פירוט' }}
          </button>
          <button type="button" role="menuitem" @click="$emit('copy', entry)">
            <span class="mdi mdi-content-copy" aria-hidden="true"></span>
            העתק
          </button>
          <button type="button" role="menuitem" class="danger-action" @click="$emit('delete', entry)">
            <span class="mdi mdi-delete-outline" aria-hidden="true"></span>
            מחק
          </button>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';
import { normalize, toHebrewNumber } from '@/composables/useGematria.js';

const props = defineProps({
  entry: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  menuOpen: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
  sharedValue: { type: Boolean, default: false },
});

defineEmits(['toggle', 'toggle-menu', 'copy', 'delete']);

const highlightedPhrase = computed(() => {
  const phrase = props.entry.original_text || '';
  const query = props.searchQuery.trim();
  const normalizedQuery = normalize(query);
  if (!query || /^\d+$/.test(query) || !normalizedQuery || normalizedQuery.length < 2) {
    return [{ text: phrase, match: false }];
  }
  const index = phrase.indexOf(query);
  if (index < 0) return [{ text: phrase, match: false }];
  return [
    { text: phrase.slice(0, index), match: false },
    { text: phrase.slice(index, index + query.length), match: true },
    { text: phrase.slice(index + query.length), match: false },
  ].filter(part => part.text);
});

function formatTanachReference(entry) {
  const reference = `${entry.tanach_book_label} ${toHebrewNumber(entry.tanach_chapter)}:${toHebrewNumber(entry.tanach_verse)}`;
  return entry.parsha_name ? `${reference} · פרשת ${entry.parsha_name}` : reference;
}

</script>

<style scoped>
.entry-card {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: visible;
  position: relative;
  transition: box-shadow .15s, border-color .15s;
}

.entry-card:hover { box-shadow: var(--shadow); }
.entry-card.expanded {
  border-color: var(--gold);
  box-shadow: 0 0 0 1px rgba(192, 152, 64, .14);
}
.entry-card.has-shared-value:not(.expanded) { border-color: #d8c79f; }

.entry-header {
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: 18px;
  min-height: 112px;
  padding: 14px 18px;
}

.entry-body { flex: 1 1 auto; }
.entry-main-info { flex: 1; min-width: 0; }

.entry-text {
  color: var(--navy);
  font-size: 1.18rem;
  font-weight: 700;
  line-height: 1.4;
  margin-bottom: 5px;
  overflow-wrap: anywhere;
  text-align: right;
}

.entry-text mark {
  background: var(--gold-light);
  border-radius: 3px;
  color: inherit;
  padding: 0 2px;
}

.tanach-reference {
  align-items: center;
  background: var(--gold-light);
  border-radius: 999px;
  color: #80601d;
  display: inline-flex;
  font-size: .72rem;
  font-weight: 600;
  gap: 5px;
  margin-bottom: 5px;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 2px 8px;
}

.entry-gematria {
  align-items: center;
  display: flex;
  gap: 7px;
  line-height: 1.1;
}

.gematria-num {
  color: var(--gold);
  font-size: 1.38rem;
  font-weight: 700;
}

.gematria-dot { color: #ccc; }
.gematria-heb { color: var(--text-secondary); font-size: .91rem; }

.entry-initials {
  align-items: baseline;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: .78rem;
  gap: 5px;
  line-height: 1.3;
  margin-top: 6px;
}

.entry-initials strong {
  color: var(--navy);
  font-size: .88rem;
}

.initials-gematria-label { margin-right: 8px; }

.entry-menu-wrap { position: relative; }

.menu-btn,
.detail-btn {
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  font-family: inherit;
  justify-content: center;
  transition: background .15s, border-color .15s, color .15s;
}

.menu-btn {
  font-size: 1.45rem;
  height: 34px;
  line-height: 1;
  padding: 0 7px 8px;
  width: 36px;
}

.menu-btn:hover,
.menu-btn:focus-visible,
.detail-btn:hover,
.detail-btn:focus-visible {
  background: var(--gold-light);
  border-color: var(--border);
  color: var(--navy);
}

.menu-btn:focus-visible,
.detail-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.entry-menu {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(26, 39, 68, .12);
  min-width: 142px;
  overflow: hidden;
  position: absolute;
  bottom: 38px;
  left: 0;
  z-index: 10;
}

.entry-menu button {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--navy);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: .8rem;
  gap: 8px;
  padding: 10px 12px;
  text-align: right;
  width: 100%;
}

.entry-menu button:hover { background: var(--gold-light); }
.entry-menu .danger-action { color: #a33b35; }

.detail-btn {
  font-size: .75rem;
  gap: 8px;
  justify-content: flex-start;
  padding: 6px 8px;
  white-space: nowrap;
}

.expand-icon { height: 8px; width: 8px; }

.entry-footer {
  align-items: center;
  border-top: 1px solid #eee9e0;
  display: flex;
  justify-content: space-between;
  min-height: 42px;
  padding: 0 12px;
}

.entry-footer .detail-btn {
  color: var(--navy);
  font-weight: 600;
}

.entry-footer .detail-btn:hover,
.entry-footer .detail-btn:focus-visible {
  background: var(--gold-light);
}

.entry-footer .menu-btn {
  color: #8e8a82;
  height: 32px;
  padding: 0 6px 7px;
  width: 32px;
}

@media (max-width: 680px) {
  .entry-header { gap: 10px; min-height: 0; padding: 14px 16px; }
  .entry-text { font-size: 1.08rem; }
  .detail-btn { font-size: .7rem; padding-inline: 4px; }
  .entry-initials { gap: 4px; margin-top: 7px; }
  .initials-gematria-label { margin-right: 5px; }
}

@media (max-width: 420px) {
  .entry-header { align-items: flex-start; }
  .entry-footer { min-height: 42px; }
  .entry-menu { left: 0; }
}
</style>