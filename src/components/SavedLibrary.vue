<template>
  <div class="library-page">
    <header class="library-header">
      <h1 ref="libraryHeading" class="library-title" tabindex="-1">שמורים</h1>
      <p class="library-subtitle">הספרייה האישית שלך</p>
    </header>

    <div class="search-bar">
      <label class="sr-only" for="saved-library-search">חיפוש בספרייה</label>
      <span class="mdi mdi-magnify search-icon" aria-hidden="true"></span>
      <input
        id="saved-library-search"
        v-model="searchQuery"
        class="search-input"
        type="search"
        placeholder="חפש לפי טקסט, מספר גימטריה או ראשי תיבות..."
        dir="rtl"
        @input="onSearch"
      />
      <button
        v-if="searchQuery"
        class="clear-btn"
        type="button"
        aria-label="נקה חיפוש"
        @click="clearSearch"
      >
        <span class="mdi mdi-close" aria-hidden="true"></span>
      </button>
    </div>

    <div class="library-toolbar">
      <div class="library-summary" aria-live="polite">
        <strong>{{ stats.saved }} שמורים</strong>
        <span aria-hidden="true">·</span>
        <span>{{ stats.distinctValues }} ערכים שונים</span>
        <span aria-hidden="true">·</span>
        <span>{{ stats.sharedValues }} ערכים משותפים</span>
      </div>

      <div class="library-controls">
        <label class="sort-control">
          <span>מיון</span>
          <select v-model="sort" aria-label="מיון הספרייה" @change="onSortChange">
            <option value="recent">אחרונים</option>
            <option value="oldest">ישנים</option>
            <option value="gematria">לפי גימטריה</option>
            <option value="alphabetical">א״ב</option>
          </select>
          <span class="select-chevron ui-chevron ui-chevron--down" aria-hidden="true"></span>
        </label>

        <div class="view-switcher" role="group" aria-label="תצוגת הספרייה">
          <button
            type="button"
            class="view-btn"
            :class="{ active: viewMode === 'grid' }"
            :aria-pressed="viewMode === 'grid'"
            title="תצוגת כרטיסים"
            @click="setViewMode('grid')"
          >
            <span class="mdi mdi-view-grid-outline" aria-hidden="true"></span>
            <span class="sr-only">כרטיסים</span>
          </button>
          <button
            type="button"
            class="view-btn"
            :class="{ active: viewMode === 'list' }"
            :aria-pressed="viewMode === 'list'"
            title="תצוגת רשימה"
            @click="setViewMode('list')"
          >
            <span class="mdi mdi-view-list-outline" aria-hidden="true"></span>
            <span class="sr-only">רשימה</span>
          </button>
        </div>

        <label class="group-toggle">
          <input v-model="groupByGematria" type="checkbox" @change="onGroupChange" />
          <span class="group-toggle__track" aria-hidden="true"><span></span></span>
          <span>קבץ לפי גימטריה</span>
        </label>
      </div>
    </div>

    <div v-if="loading" class="loading-spinner" role="status">
      <span class="mdi mdi-loading mdi-spin" aria-hidden="true"></span>
      טוען...
    </div>

    <div v-else-if="error" class="library-state error-state" role="alert">
      <strong>לא ניתן לטעון את הספרייה</strong>
      <span>{{ error }}</span>
      <button type="button" class="state-action" @click="refreshEntries">נסה שוב</button>
    </div>

    <div v-else-if="entries.length === 0" class="library-state empty-state">
      <span class="mdi mdi-bookshelf empty-icon" aria-hidden="true"></span>
      <strong v-if="!searchQuery">עדיין לא נשמרו ערכים</strong>
      <strong v-else>לא נמצאו תוצאות</strong>
      <span v-if="!searchQuery">חזור למחשבון ולחץ <b>שמור</b> כדי להוסיף לספרייה.</span>
      <span v-else>נסה לחפש לפי טקסט, גימטריה או ראשי תיבות אחרים.</span>
    </div>

    <div
      v-else
      class="entries-list"
      :class="{ 'list-mode': viewMode === 'list', 'grouped-mode': groupByGematria }"
    >
      <template v-if="groupByGematria">
        <template v-for="item in groupedFlow" :key="item.key">
          <section v-if="item.type === 'shared'" class="entry-group shared-group">
            <header class="group-header">
              <div class="group-value">
                <strong>{{ item.group.value }}</strong>
                <span>·</span>
                <span>{{ item.group.hebrewValue }}</span>
              </div>
              <span>{{ item.group.entries.length }} ערכים שמורים</span>
            </header>
            <div class="group-entries">
              <template v-for="(entry, index) in item.group.entries" :key="entry.id">
                <SavedEntryCard
                  :entry="entry"
                  :expanded="expandedId === entry.id"
                  :menu-open="menuOpenId === entry.id"
                  :search-query="searchQuery"
                  :shared-value="true"
                  @toggle="toggleExpand"
                  @toggle-menu="toggleMenu"
                  @copy="copyEntry"
                  @delete="confirmDelete"
                />
                <SavedEntryDetail
                  v-if="shouldShowDetailAfter(index, item.group.entries)"
                  :entry="expandedEntry"
                  :milui-mapping="miluiMapping"
                />
              </template>
            </div>
          </section>

          <template v-else>
            <SavedEntryCard
              :entry="item.entry"
              :expanded="expandedId === item.entry.id"
              :menu-open="menuOpenId === item.entry.id"
              :search-query="searchQuery"
              :shared-value="false"
              @toggle="toggleExpand"
              @toggle-menu="toggleMenu"
              @copy="copyEntry"
              @delete="confirmDelete"
            />
            <SavedEntryDetail
              v-if="item.detailEntry"
              :entry="item.detailEntry"
              :milui-mapping="miluiMapping"
            />
          </template>
        </template>
      </template>

      <template v-else>
        <template v-for="(entry, index) in entries" :key="entry.id">
          <SavedEntryCard
            :entry="entry"
            :expanded="expandedId === entry.id"
            :menu-open="menuOpenId === entry.id"
            :search-query="searchQuery"
            :shared-value="sharedValueIds.has(entry.id)"
            @toggle="toggleExpand"
            @toggle-menu="toggleMenu"
            @copy="copyEntry"
            @delete="confirmDelete"
          />
          <SavedEntryDetail
            v-if="shouldShowDetailAfter(index, entries)"
            :entry="expandedEntry"
            :milui-mapping="miluiMapping"
          />
        </template>
      </template>
    </div>

    <button
      v-if="hasMore && !loading"
      class="load-more-btn"
      type="button"
      @click="loadMore"
    >
      הצג עוד ({{ total - entries.length }} נותרו)
    </button>

    <div v-if="copyNotice" class="copy-notice" role="status">{{ copyNotice }}</div>

    <div v-if="deleteTarget" class="modal-overlay" @click.self="closeDeleteDialog">
      <div
        ref="deleteDialog"
        class="modal-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        @keydown="onDialogKeydown"
      >
        <p id="delete-title" class="modal-text">
          למחוק את <strong>{{ deleteTarget.original_text }}</strong>?
        </p>
        <p v-if="deleteError" class="modal-error" role="alert">{{ deleteError }}</p>
        <div class="modal-actions">
          <button ref="cancelDeleteButton" type="button" class="modal-btn cancel" @click="closeDeleteDialog">ביטול</button>
          <button type="button" class="modal-btn confirm" @click="doDelete">מחק</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import SavedEntryCard from '@/components/SavedEntryCard.vue';
import SavedEntryDetail from '@/components/SavedEntryDetail.vue';
import { normalizeMiluiMapping } from '@/utils/milui.js';

const LIMIT = 100;
const GROUP_LIMIT = 20;
const VIEW_STORAGE_KEY = 'gematria-library-view';
const entries = ref([]);
const total = ref(0);
const hasMore = ref(false);
const stats = ref({ saved: 0, distinctValues: 0, sharedValues: 0 });
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');
const sort = ref('recent');
const viewMode = ref('grid');
const groupByGematria = ref(false);
const expandedId = ref(null);
const menuOpenId = ref(null);
const deleteTarget = ref(null);
const deleteDialog = ref(null);
const cancelDeleteButton = ref(null);
const libraryHeading = ref(null);
const deleteError = ref('');
const copyNotice = ref('');
const miluiMapping = ref(null);
const offset = ref(0);
const isWideViewport = ref(true);
let debounceTimer = null;
let copyNoticeTimer = null;
let requestId = 0;
let activeController = null;
let viewportMedia = null;
let updateViewport = null;

const sharedValueIds = computed(() => {
  const counts = new Map();
  for (const entry of entries.value) {
    counts.set(entry.full_gematria, (counts.get(entry.full_gematria) || 0) + 1);
  }
  return new Set(entries.value
    .filter(entry => Number(entry.value_entry_count) > 1 || counts.get(entry.full_gematria) > 1)
    .map(entry => entry.id));
});

const groupedEntries = computed(() => {
  const groups = new Map();
  for (const entry of entries.value) {
    if (!groups.has(entry.full_gematria)) {
      groups.set(entry.full_gematria, {
        key: entry.full_gematria,
        value: entry.full_gematria,
        hebrewValue: entry.full_gematria_hebrew,
        entries: [],
      });
    }
    groups.get(entry.full_gematria).entries.push(entry);
  }
  return [...groups.values()];
});

const expandedEntry = computed(() =>
  entries.value.find(entry => entry.id === expandedId.value) || null
);

const gridColumns = computed(() =>
  viewMode.value === 'list' || !isWideViewport.value ? 1 : 2
);

const groupedFlow = computed(() => {
  const flow = [];
  let occupiedColumns = 0;

  for (const group of groupedEntries.value) {
    if (group.entries.length > 1) {
      if (occupiedColumns > 0 && flow.length > 0) {
        flow[flow.length - 1].rowEnd = true;
      }
      flow.push({ key: `group-${group.key}`, type: 'shared', group, rowEnd: true });
      occupiedColumns = 0;
      continue;
    }

    const entry = group.entries[0];
    occupiedColumns += 1;
    const rowEnd = occupiedColumns === gridColumns.value;
    flow.push({ key: `entry-${entry.id}`, type: 'unique', entry, rowEnd });
    if (rowEnd) occupiedColumns = 0;
  }

  if (occupiedColumns > 0 && flow.length > 0) {
    flow[flow.length - 1].rowEnd = true;
  }

  const selectedIndex = flow.findIndex(item =>
    item.type === 'unique' && item.entry.id === expandedId.value
  );
  if (selectedIndex >= 0) {
    let rowEndIndex = selectedIndex;
    while (rowEndIndex < flow.length - 1 && !flow[rowEndIndex].rowEnd) {
      rowEndIndex += 1;
    }
    flow[rowEndIndex].detailEntry = flow[selectedIndex].entry;
  }

  return flow;
});

function shouldShowDetailAfter(index, collection) {
  if (!expandedEntry.value) return false;
  const selectedIndex = collection.findIndex(entry => entry.id === expandedId.value);
  if (selectedIndex < 0) return false;
  const rowEndIndex = Math.min(
    Math.floor(selectedIndex / gridColumns.value) * gridColumns.value + gridColumns.value - 1,
    collection.length - 1
  );
  return index === rowEndIndex;
}

async function fetchEntries(reset = true) {
  const currentRequestId = ++requestId;
  activeController?.abort();
  activeController = new AbortController();
  loading.value = true;
  error.value = '';
  if (reset) {
    offset.value = 0;
    entries.value = [];
    expandedId.value = null;
    menuOpenId.value = null;
  }

  try {
    const params = new URLSearchParams({
      limit: String(groupByGematria.value ? GROUP_LIMIT : LIMIT),
      offset: String(offset.value),
      sort: sort.value,
      grouped: String(groupByGematria.value),
    });
    if (searchQuery.value.trim()) params.set('search', searchQuery.value.trim());
    const response = await fetch(`/api/entries?${params}`, { signal: activeController.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'הבקשה נכשלה');
    if (currentRequestId !== requestId) return;
    if (reset) entries.value = data.entries;
    else entries.value.push(...data.entries);
    total.value = data.total;
    hasMore.value = data.pagination?.hasMore ?? entries.value.length < data.total;
    stats.value = data.stats || {
      saved: data.total,
      distinctValues: new Set(data.entries.map(entry => entry.full_gematria)).size,
      sharedValues: 0,
    };
    offset.value = data.pagination?.nextOffset ?? offset.value + data.entries.length;
    return true;
  } catch (requestError) {
    if (requestError.name !== 'AbortError' && currentRequestId === requestId) {
      error.value = 'אירעה שגיאה זמנית. אפשר לנסות שוב.';
    }
    return false;
  } finally {
    if (currentRequestId === requestId) loading.value = false;
  }
}

async function refreshEntries() {
  await fetchEntries();
}

async function fetchMiluiMapping() {
  try {
    const response = await fetch('/api/settings/milui');
    if (!response.ok) return;
    const payload = await response.json();
    const checked = normalizeMiluiMapping(payload.mapping);
    if (checked.valid) miluiMapping.value = checked.mapping;
  } catch {
    miluiMapping.value = null;
  }
}

function onSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => refreshEntries(), 300);
}

function clearSearch() {
  clearTimeout(debounceTimer);
  searchQuery.value = '';
  refreshEntries();
}

function onSortChange() {
  refreshEntries();
}

function onGroupChange() {
  refreshEntries();
}

function loadMore() {
  if (!loading.value && hasMore.value) fetchEntries(false);
}

function setViewMode(mode) {
  viewMode.value = mode;
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
  menuOpenId.value = null;
}

function toggleMenu(id) {
  menuOpenId.value = menuOpenId.value === id ? null : id;
}

async function copyEntry(entry) {
  menuOpenId.value = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(entry.original_text);
    } else {
      const helper = document.createElement('textarea');
      helper.value = entry.original_text;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } finally {
        helper.remove();
      }
      if (!copied) throw new Error('copy_failed');
    }
    copyNotice.value = 'הטקסט הועתק';
    clearTimeout(copyNoticeTimer);
    copyNoticeTimer = setTimeout(() => { copyNotice.value = ''; }, 1800);
  } catch {
    clearTimeout(copyNoticeTimer);
    copyNotice.value = 'לא ניתן להעתיק כרגע';
    copyNoticeTimer = setTimeout(() => { copyNotice.value = ''; }, 1800);
  }
}

async function confirmDelete(entry) {
  menuOpenId.value = null;
  deleteError.value = '';
  deleteTarget.value = entry;
  await nextTick();
  cancelDeleteButton.value?.focus();
}

function closeDeleteDialog() {
  const triggerId = deleteTarget.value?.id;
  deleteTarget.value = null;
  deleteError.value = '';
  nextTick(() => {
    document.querySelector(`[data-entry-id="${triggerId}"] .menu-btn`)?.focus();
  });
}

function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDeleteDialog();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...deleteDialog.value.querySelectorAll('button:not([disabled])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function doDelete() {
  if (!deleteTarget.value) return;
  const id = deleteTarget.value.id;
  try {
    const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('delete_failed');
    deleteTarget.value = null;
    deleteError.value = '';
    await refreshEntries();
    await nextTick();
    libraryHeading.value?.focus();
  } catch {
    deleteError.value = 'לא ניתן למחוק את הערך כרגע. נסה שוב.';
  }
}

function closeMenus(event) {
  if (!event.target.closest('.entry-menu-wrap')) menuOpenId.value = null;
}

onMounted(() => {
  try {
    const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
    if (savedView === 'grid' || savedView === 'list') viewMode.value = savedView;
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
  document.addEventListener('click', closeMenus);
  viewportMedia = window.matchMedia('(min-width: 801px)');
  updateViewport = event => { isWideViewport.value = event.matches; };
  isWideViewport.value = viewportMedia.matches;
  viewportMedia.addEventListener('change', updateViewport);
  Promise.all([refreshEntries(), fetchMiluiMapping()]);
});

onBeforeUnmount(() => {
  clearTimeout(debounceTimer);
  clearTimeout(copyNoticeTimer);
  activeController?.abort();
  document.removeEventListener('click', closeMenus);
  if (viewportMedia && updateViewport) {
    viewportMedia.removeEventListener('change', updateViewport);
  }
});
</script>

<style scoped>
.library-page {
  direction: rtl;
  margin-inline: auto;
  max-width: 1180px;
  width: 100%;
}

.library-header { margin-bottom: 22px; }
.library-title { color: var(--navy); font-size: 2.15rem; font-weight: 700; margin-bottom: 5px; }
.library-subtitle { color: var(--text-secondary); font-size: .92rem; }

.search-bar {
  align-items: center;
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 2px 8px rgba(26, 39, 68, .04);
  display: flex;
  gap: 9px;
  margin-bottom: 16px;
  padding: 0 16px;
  transition: border-color .15s, box-shadow .15s;
}

.search-bar:focus-within {
  border-color: var(--gold);
  box-shadow: 0 0 0 3px rgba(192, 152, 64, .1);
}

.search-icon { color: var(--text-secondary); font-size: 1.08rem; }
.search-input {
  background: transparent;
  border: 0;
  color: var(--text-primary);
  flex: 1;
  font-family: inherit;
  font-size: .98rem;
  min-width: 0;
  outline: 0;
  padding: 14px 0;
  text-align: right;
}

.search-input::-webkit-search-cancel-button { display: none; }
.search-input::placeholder { color: #9ba1ac; }

.clear-btn {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  font-size: 1rem;
  padding: 5px;
}

.clear-btn:hover { color: var(--navy); }
.clear-btn:focus-visible, .state-action:focus-visible, .modal-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.library-toolbar {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 16px;
  min-height: 34px;
}

.library-summary {
  align-items: baseline;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: .8rem;
  gap: 6px;
}

.library-summary strong { color: var(--navy); font-size: .87rem; }
.library-controls { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }

.sort-control {
  align-items: center;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: .78rem;
  gap: 6px;
  position: relative;
}

.sort-control select {
  appearance: none;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--navy);
  cursor: pointer;
  font-family: inherit;
  font-size: .78rem;
  min-width: 112px;
  padding: 6px 10px 6px 25px;
}

.sort-control select:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.select-chevron { color: var(--text-secondary); height: 7px; pointer-events: none; position: absolute; left: 9px; width: 7px; }

.view-switcher {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  overflow: hidden;
}

.view-btn {
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: .95rem;
  line-height: 1;
  padding: 7px 9px;
}

.view-btn + .view-btn { border-right: 1px solid var(--border); }
.view-btn:hover, .view-btn.active { background: var(--gold-light); color: var(--navy); }
.view-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: -2px; }

.group-toggle {
  align-items: center;
  color: var(--navy);
  cursor: pointer;
  display: inline-flex;
  font-size: .82rem;
  gap: 8px;
  user-select: none;
}

.group-toggle input { height: 1px; opacity: 0; position: absolute; width: 1px; }
.group-toggle__track {
  background: #c9c3b8;
  border: 1px solid #b7b0a3;
  border-radius: 999px;
  box-sizing: border-box;
  direction: ltr;
  height: 20px;
  padding: 1px;
  transition: background .15s, border-color .15s;
  width: 36px;
}

.group-toggle__track span {
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(32, 48, 71, .28);
  display: block;
  height: 16px;
  transform: translateX(0);
  transition: transform .15s;
  width: 16px;
}

.group-toggle input:checked + .group-toggle__track { background: var(--gold); border-color: #b99645; }
.group-toggle input:checked + .group-toggle__track span { transform: translateX(16px); }
.group-toggle input:focus-visible + .group-toggle__track { outline: 2px solid var(--gold); outline-offset: 2px; }

.entries-list { align-items: stretch; display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.entries-list.list-mode { grid-template-columns: minmax(0, 1fr); }
.entries-list.list-mode :deep(.entry-header) { min-height: 0; padding-block: 14px; }
.entry-group { display: contents; }
.group-header { display: none; }
.group-entries { display: contents; }

.grouped-mode .entry-group.shared-group {
  background: rgba(245, 237, 216, .28);
  border: 1px solid #e4d7b8;
  border-radius: var(--radius);
  box-sizing: border-box;
  display: block;
  grid-column: 1 / -1;
  padding: 14px;
  width: 100%;
}

.grouped-mode .entry-group:not(.shared-group) { display: contents; }

.grouped-mode .shared-group .group-header {
  align-items: baseline;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 11px;
}

.group-value { align-items: baseline; color: var(--navy); display: flex; gap: 6px; }
.group-value strong { color: var(--gold); font-size: 1.15rem; }
.group-value span { font-size: .85rem; }
.group-header > span { font-size: .75rem; }
.grouped-mode .shared-group .group-entries { align-items: stretch; display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grouped-mode.list-mode .shared-group .group-entries { grid-template-columns: minmax(0, 1fr); }

.detail-panel {
  animation: detail-reveal .18s ease-out;
  grid-column: 1 / -1;
}

@keyframes detail-reveal {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}

.loading-spinner {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  justify-content: center;
  min-height: 180px;
}

.library-state {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 8px;
  justify-content: center;
  min-height: 250px;
  text-align: center;
}

.empty-icon { color: #d0cbb4; font-size: 2.6rem; margin-bottom: 5px; }
.library-state strong { color: var(--navy); font-size: 1.05rem; }
.library-state span { font-size: .86rem; }
.error-state strong { color: #9a403a; }
.state-action { background: var(--gold-light); border: 1px solid var(--border); border-radius: 8px; color: var(--navy); cursor: pointer; font-family: inherit; margin-top: 4px; padding: 7px 14px; }

.load-more-btn {
  background: #fff;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-secondary);
  cursor: pointer;
  direction: rtl;
  font-family: inherit;
  font-size: .86rem;
  margin-top: 16px;
  padding: 11px;
  transition: background .15s, border-color .15s, color .15s;
  width: 100%;
}

.load-more-btn:hover { background: var(--gold-light); border-color: var(--gold); color: var(--navy); }
.load-more-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.copy-notice {
  background: var(--navy);
  border-radius: 8px;
  bottom: 22px;
  color: #fff;
  font-size: .8rem;
  left: 22px;
  padding: 9px 14px;
  position: fixed;
  z-index: 150;
}

.modal-overlay {
  align-items: center;
  background: rgba(26, 39, 68, .35);
  display: flex;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 200;
}

.modal-box { background: #fff; border-radius: var(--radius); box-shadow: 0 8px 40px rgba(26, 39, 68, .18); max-width: 340px; padding: 28px 24px; text-align: center; width: 90%; }
.modal-text { color: var(--navy); direction: rtl; font-size: .95rem; line-height: 1.5; margin-bottom: 20px; }
.modal-error { color: #9a403a; font-size: .8rem; line-height: 1.5; margin: -10px 0 16px; }
.modal-actions { display: flex; gap: 10px; justify-content: center; }
.modal-btn { border: 0; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: .9rem; font-weight: 600; padding: 9px 24px; }
.modal-btn.cancel { background: #f0ede7; color: var(--navy); }
.modal-btn.confirm { background: #d32f2f; color: #fff; }
.modal-btn.cancel:hover { background: #e6e0d5; }
.modal-btn.confirm:hover { background: #b71c1c; }

.sr-only {
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}

@media (max-width: 800px) {
  .library-toolbar { align-items: flex-start; flex-direction: column; gap: 12px; }
  .library-controls { width: 100%; }
  .entries-list, .grouped-mode .shared-group .group-entries { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 480px) {
  .library-title { font-size: 1.9rem; }
  .library-controls { gap: 8px; }
  .library-summary { line-height: 1.7; }
  .sort-control { flex: 1; justify-content: space-between; }
  .sort-control select { flex: 1; }
  .group-toggle { margin-inline-start: auto; }
  .copy-notice { bottom: 16px; left: 16px; }
}
</style>