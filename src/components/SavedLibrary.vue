<template>
  <div class="library-page">
    <!-- Header -->
    <div class="library-header">
      <h1 class="library-title">שמורים</h1>
      <p class="library-subtitle">הספרייה האישית שלך</p>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <span class="mdi mdi-magnify search-icon"></span>
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="חפש לפי טקסט או מספר גימטריה..."
        dir="rtl"
        @input="onSearch"
      />
      <button v-if="searchQuery" class="clear-btn" @click="clearSearch">
        <span class="mdi mdi-close"></span>
      </button>
    </div>

    <!-- Stats -->
    <div class="library-stats" v-if="!searchQuery">
      <span>{{ total }} רשומות שמורות</span>
    </div>
    <div class="library-stats" v-else>
      <span>{{ total }} תוצאות עבור &ldquo;{{ searchQuery }}&rdquo;</span>
    </div>

    <!-- Loading -->
    <div class="loading-spinner" v-if="loading">
      <span class="mdi mdi-loading mdi-spin"></span>
      טוען...
    </div>

    <!-- Empty state -->
    <div class="empty-state" v-else-if="entries.length === 0 && !loading">
      <div class="empty-icon">
        <span class="mdi mdi-bookshelf" style="font-size:3rem;color:#D0CBB4;"></span>
      </div>
      <div class="empty-text" v-if="!searchQuery">
        עדיין אין רשומות שמורות.<br/>
        <small>חזור למחשבון ולחץ <strong>שמור</strong> כדי להוסיף.</small>
      </div>
      <div class="empty-text" v-else>
        לא נמצאו תוצאות.
      </div>
    </div>

    <!-- Entry list -->
    <div class="entries-list" v-else>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="entry-card"
        :class="{ expanded: expandedId === entry.id }"
      >
        <!-- Card header -->
        <div class="entry-header" @click="toggleExpand(entry.id)">
          <div class="entry-main-info">
            <div class="entry-text">{{ entry.original_text }}</div>
            <div v-if="entry.tanach_book_slug" class="tanach-reference">
              <span class="mdi mdi-book-open-page-variant-outline"></span>
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
          </div>
          <div class="entry-actions">
            <button
              class="delete-btn"
              @click.stop="confirmDelete(entry)"
              title="מחק"
            >
              <span class="mdi mdi-delete-outline"></span>
            </button>
            <span class="expand-icon mdi" :class="expandedId === entry.id ? 'mdi-chevron-up' : 'mdi-chevron-down'"></span>
          </div>
        </div>

        <!-- Expanded detail -->
        <div class="entry-detail" v-if="expandedId === entry.id">
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

          <div class="detail-words" v-if="entry.words && entry.words.length > 0">
            <div class="detail-label" style="margin-bottom:8px;">פירוט מילים:</div>
            <div class="detail-word-block" v-for="w in getEntryBreakdown(entry.original_text)" :key="w.position">
              <div class="detail-word-row">
                <span class="word-text">{{ w.word }}</span>
                <span class="word-gematria">{{ w.gematria }}</span>
              </div>
              <div class="detail-letter-list">
                <span v-for="letter in w.letters" :key="letter.letter + letter.value" class="detail-letter">
                  {{ letter.letter }} · {{ letter.value }}
                </span>
              </div>
            </div>
          </div>

          <div class="detail-meta">
            <span class="mdi mdi-clock-outline"></span>
            {{ formatDate(entry.created_at) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Load more -->
    <button
      v-if="entries.length < total && !loading"
      class="load-more-btn"
      @click="loadMore"
    >
      הצג עוד ({{ total - entries.length }} נותרו)
    </button>

    <!-- Delete confirm dialog -->
    <div class="modal-overlay" v-if="deleteTarget" @click.self="deleteTarget = null">
      <div class="modal-box">
        <p class="modal-text">למחוק את <strong>{{ deleteTarget.original_text }}</strong>?</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="deleteTarget = null">ביטול</button>
          <button class="modal-btn confirm" @click="doDelete">מחק</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getWordBreakdown, toHebrewNumber } from '@/composables/useGematria.js';

const entries = ref([]);
const total = ref(0);
const loading = ref(false);
const searchQuery = ref('');
const expandedId = ref(null);
const deleteTarget = ref(null);
const offset = ref(0);
const LIMIT = 20;
let debounceTimer = null;

async function fetchEntries(reset = true) {
  loading.value = true;
  if (reset) {
    offset.value = 0;
    entries.value = [];
  }
  try {
    const params = new URLSearchParams({ limit: LIMIT, offset: offset.value });
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());
    const res = await fetch(`/api/entries?${params}`);
    const data = await res.json();
    if (reset) {
      entries.value = data.entries;
    } else {
      entries.value.push(...data.entries);
    }
    total.value = data.total;
    offset.value += data.entries.length;
  } catch (e) {
    console.error(e);
  }
  loading.value = false;
}

function onSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => fetchEntries(true), 300);
}

function clearSearch() {
  searchQuery.value = '';
  fetchEntries(true);
}

function loadMore() {
  fetchEntries(false);
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

function confirmDelete(entry) {
  deleteTarget.value = entry;
}

async function doDelete() {
  if (!deleteTarget.value) return;
  try {
    await fetch(`/api/entries/${deleteTarget.value.id}`, { method: 'DELETE' });
    entries.value = entries.value.filter(e => e.id !== deleteTarget.value.id);
    total.value = Math.max(0, total.value - 1);
    if (expandedId.value === deleteTarget.value.id) expandedId.value = null;
    deleteTarget.value = null;
  } catch (e) {
    console.error(e);
  }
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getEntryBreakdown(text) {
  return getWordBreakdown(text);
}

function formatTanachReference(entry) {
  const reference = `${entry.tanach_book_label} ${toHebrewNumber(entry.tanach_chapter)}:${toHebrewNumber(entry.tanach_verse)}`;
  return entry.parsha_name ? `${reference} · פרשת ${entry.parsha_name}` : reference;
}

onMounted(() => fetchEntries());
</script>

<style scoped>
.library-page { direction: rtl; }

.library-header {
  margin-bottom: 24px;
}
.library-title {
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 6px;
}
.library-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

/* Search */
.search-bar {
  display: flex;
  align-items: center;
  background: #fff;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  padding: 0 16px;
  margin-bottom: 20px;
  gap: 8px;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 2px 8px rgba(26, 39, 68, 0.05);
}
.search-bar:focus-within {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(192, 152, 64, 0.1);
}
.search-icon { color: var(--text-secondary); font-size: 1.1rem; }
.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 14px 0;
  font-size: 1rem;
  background: transparent;
  font-family: inherit;
  color: var(--text-primary);
  text-align: right;
}
.search-input::placeholder { color: #AAAD; }
.clear-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 50%;
}
.clear-btn:hover { color: var(--navy); }

.library-stats {
  font-size: 0.82rem;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.loading-spinner {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}
.empty-text { margin-top: 16px; line-height: 1.8; font-size: 0.95rem; }

.entries-list { display: flex; flex-direction: column; gap: 12px; }

/* Entry card */
.entry-card {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.entry-card:hover { box-shadow: var(--shadow); }
.entry-card.expanded { border-color: var(--gold); }

.entry-header {
  display: flex;
  align-items: center;
  padding: 18px 22px;
  cursor: pointer;
  gap: 12px;
}
.entry-card:not(.expanded) .entry-header { padding-block: 8px; gap: 10px; }
.entry-main-info { flex: 1; min-width: 0; }
.entry-text {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 5px;
  text-align: right;
  word-break: break-all;
}
.entry-card:not(.expanded) .entry-text { margin-bottom: 2px; line-height: 1.15; }
.tanach-reference {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--gold-light);
  color: #80601d;
  font-size: .72rem;
  font-weight: 600;
}
.entry-card:not(.expanded) .tanach-reference { margin-bottom: 2px; padding-block: 1px; font-size: .68rem; line-height: 1.1; }
.entry-gematria {
  display: flex;
  align-items: center;
  gap: 6px;
}
.entry-card:not(.expanded) .entry-gematria { gap: 5px; line-height: 1.05; }
.gematria-num {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--gold);
}
.entry-card:not(.expanded) .gematria-num { font-size: 1.15rem; }
.gematria-dot { color: #CCC; }
.gematria-heb {
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.entry-card:not(.expanded) .gematria-heb { font-size: .82rem; }

.entry-initials {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.entry-card:not(.expanded) .entry-initials { margin-top: 2px; gap: 3px; font-size: .7rem; line-height: 1.1; }
.entry-initials strong {
  color: var(--navy);
  font-size: 0.9rem;
}
.entry-card:not(.expanded) .entry-initials strong { font-size: .82rem; }
.initials-gematria-label {
  margin-right: 7px;
}
.entry-card:not(.expanded) .initials-gematria-label { margin-right: 4px; }

.entry-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #CCC;
  font-size: 1.1rem;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.15s;
  display: flex;
}
.delete-btn:hover { color: #D32F2F; background: #FFEBEE; }
.expand-icon { color: var(--text-secondary); font-size: 1.2rem; }

/* Expanded detail */
.entry-detail {
  border-top: 1px solid var(--border);
  padding: 18px 22px;
  background: #FAFAF7;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
}
.detail-reference {
  border-bottom: 1px solid #eee9e0;
  padding-bottom: 12px;
}
.detail-label {
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
}
.detail-value {
  font-weight: 600;
  color: var(--navy);
  font-size: 1rem;
}
.detail-gematria {
  color: var(--text-secondary);
  font-size: 0.82rem;
  margin-right: auto;
}

.detail-words { font-size: 0.88rem; }
.detail-word-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid #F0ECE4;
}
.detail-word-block:last-child .detail-word-row { border-bottom: none; }
.word-text { color: var(--navy); font-weight: 500; }
.word-gematria { color: var(--gold); font-weight: 600; }
.detail-letter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  padding: 6px 0 9px;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.detail-letter {
  white-space: nowrap;
}

.detail-meta {
  font-size: 0.75rem;
  color: #AAAD;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Load more */
.load-more-btn {
  width: 100%;
  margin-top: 16px;
  padding: 12px;
  font-size: 0.88rem;
  color: var(--text-secondary);
  background: #fff;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
  direction: rtl;
}
.load-more-btn:hover { background: var(--gold-light); border-color: var(--gold); color: var(--navy); }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(26,39,68,0.35);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-box {
  background: #fff;
  border-radius: var(--radius);
  padding: 28px 24px;
  max-width: 340px;
  width: 90%;
  text-align: center;
  box-shadow: 0 8px 40px rgba(26,39,68,0.18);
}
.modal-text {
  font-size: 0.95rem;
  color: var(--navy);
  margin-bottom: 20px;
  line-height: 1.5;
  direction: rtl;
}
.modal-actions { display: flex; gap: 10px; justify-content: center; }
.modal-btn {
  padding: 9px 24px;
  border-radius: 8px;
  border: none;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.modal-btn.cancel { background: #F0EDE7; color: var(--navy); }
.modal-btn.cancel:hover { background: #E6E0D5; }
.modal-btn.confirm { background: #D32F2F; color: #fff; }
.modal-btn.confirm:hover { background: #B71C1C; }
</style>
