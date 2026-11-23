<template>
  <div class="library-page" dir="rtl">
    <header class="library-header">
      <span
        class="mdi mdi-bookmark-outline library-emblem"
        aria-hidden="true"
      ></span>
      <div>
        <h1 ref="libraryHeading" class="library-title" tabindex="-1">
          הספרייה השמורה
        </h1>
        <p class="library-subtitle">ההתאמות והערכים ששמרת</p>
      </div>
    </header>

    <div class="library-tabs" role="tablist" aria-label="סוג השמורים">
      <button
        id="saved-matches-tab"
        role="tab"
        type="button"
        :aria-selected="activeTab === 'matches'"
        :tabindex="activeTab === 'matches' ? 0 : -1"
        aria-controls="saved-library-panel"
        @click="setTab('matches')"
        @keydown="onTabKeydown($event, 'matches')"
      >
        <span class="mdi mdi-link-variant" aria-hidden="true"></span
        ><span>התאמות שמורות</span
        ><span
          class="tab-count"
          :aria-busy="countsLoading && counts.matches === null"
          :title="countLabel('matches')"
          >{{ countText("matches") }}</span
        >
      </button>
      <button
        id="saved-entries-tab"
        role="tab"
        type="button"
        :aria-selected="activeTab === 'entries'"
        :tabindex="activeTab === 'entries' ? 0 : -1"
        aria-controls="saved-library-panel"
        @click="setTab('entries')"
        @keydown="onTabKeydown($event, 'entries')"
      >
        <span class="mdi mdi-file-document-outline" aria-hidden="true"></span
        ><span>ערכים שמורים</span
        ><span
          class="tab-count"
          :aria-busy="countsLoading && counts.entries === null"
          :title="countLabel('entries')"
          >{{ countText("entries") }}</span
        >
      </button>
    </div>

    <div class="library-tools">
      <div class="search-bar">
        <label class="sr-only" for="saved-library-search">חיפוש בספרייה</label>
        <span class="mdi mdi-magnify search-icon" aria-hidden="true"></span>
        <input
          id="saved-library-search"
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="חיפוש במילה, בהתאמה או בגימטריה…"
          dir="rtl"
          @input="onSearch"
          @keydown="onHebrewKeydown"
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
      <div ref="filterWrap" class="filter-wrap">
        <button
          ref="filterButton"
          type="button"
          class="filter-button"
          :class="{ 'has-filters': filtersActive }"
          :aria-description="filtersActive ? 'סינון פעיל' : undefined"
          :aria-expanded="filterOpen"
          aria-controls="saved-library-filters"
          @click="toggleFilters"
        >
          <span class="mdi mdi-tune-variant" aria-hidden="true"></span
          >סינון<span
            v-if="filtersActive"
            class="filter-dot"
            aria-hidden="true"
          ></span>
        </button>
        <div
          v-if="filterOpen"
          id="saved-library-filters"
          ref="filterPanel"
          class="filter-panel"
          role="dialog"
          aria-label="סינון הספרייה"
          @keydown.esc.stop.prevent="closeFilters(true)"
        >
          <div class="filter-heading">
            <strong>סינון ומיון</strong
            ><button
              type="button"
              aria-label="סגור סינון"
              @click="closeFilters(true)"
            >
              <span class="mdi mdi-close" aria-hidden="true"></span>
            </button>
          </div>
          <label v-if="activeTab === 'matches'"
            >מקור<select
              v-model="source"
              aria-label="מקור ההתאמה"
              @change="onSourceFilterChange"
            >
              <option value="">כל המקורות</option>
              <option value="tanach">תנ״ך</option>
              <option value="tefillot">תפילות</option>
            </select></label
          >
          <label v-if="activeTab === 'matches'"
            >סוג התאמה<select
              v-model="matchType"
              aria-label="סוג התאמה"
              @change="refreshEntries"
            >
              <option value="">כל ההתאמות</option>
              <option value="full_gematria">גימטריה</option>
              <option value="initials_text">ראשי תיבות</option>
              <option value="initials_gematria">גימטריית ראשי תיבות</option>
              <option value="finals_text">סופי תיבות</option>
              <option value="finals_gematria">גימטריית סופי תיבות</option>
              <option value="saved_word">מילה שמורה</option>
              <option value="milui_gematria">מילוי</option>
            </select></label
          >
          <label v-if="activeTab === 'matches'"
            >פרשה
            <select
              ref="parshaSelect"
              v-model="savedParshaId"
              aria-label="פרשה"
              :disabled="parshaOptionsLoading || !!parshaOptionsError"
              @change="onParshaFilterChange"
            >
              <option value="">
                {{ parshaOptionsLoading ? "טוען פרשיות…" : "כל הפרשיות" }}
              </option>
              <optgroup
                v-for="book in savedParshaGroups"
                :key="book.label"
                :label="book.label"
              >
                <option
                  v-for="portion in book.portions"
                  :key="portion.id"
                  :value="portion.id"
                >
                  {{ portion.name_he }}
                </option>
              </optgroup>
            </select>
          </label>
          <p
            v-if="activeTab === 'matches' && parshaOptionsError"
            class="parsha-filter-error"
            role="status"
          >
            {{ parshaOptionsError }}
            <button type="button" @click="fetchParshaOptions">נסה שוב</button>
          </p>
          <label
            >מיון<span
              v-if="activeTab === 'matches' && (savedParshaId || savedParshaScope || savedWeekly)"
              class="canonical-order-note"
              >לפי סדר הפסוקים</span
            ><select
              v-else
              v-model="sort"
              aria-label="מיון הספרייה"
              @change="refreshEntries"
            >
              <option value="recent">אחרונים תחילה</option>
              <option value="oldest">ישנים תחילה</option>
              <option value="gematria">לפי גימטריה</option>
              <option value="alphabetical">א״ב</option>
            </select></label
          >
          <template v-if="activeTab === 'entries'">
            <label
              >תצוגה<select
                v-model="viewMode"
                aria-label="תצוגת הספרייה"
                @change="saveView"
              >
                <option value="list">רשימה</option>
                <option value="grid">כרטיסים</option>
              </select></label
            >
            <label class="group-toggle"
              ><input
                v-model="groupByGematria"
                type="checkbox"
                @change="refreshEntries"
              />קבץ לפי גימטריה</label
            >
          </template>
          <button
            v-if="filtersActive"
            type="button"
            class="reset-filters"
            @click="resetFilters"
          >
            איפוס סינון
          </button>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'matches'" class="saved-match-tools" role="toolbar" aria-label="כלי התאמות שמורות">
      <button type="button" aria-label="פרשת השבוע" :aria-pressed="savedWeekly" :title="weeklyParshah?.nameHe" @click="toggleSavedWeekly">
        <span class="mdi mdi-calendar-week-outline" aria-hidden="true"></span>פרשת השבוע
      </button>
      <button type="button" aria-label="לפי פרשה" :aria-pressed="savedParshaScope && !savedWeekly" @click="browseSavedParsha">
        <span class="mdi mdi-book-open-variant-outline" aria-hidden="true"></span>לפי פרשה
      </button>
      <button type="button" aria-label="הורד PDF" :disabled="loading || !!error || !total || pdfLoading" :aria-busy="pdfLoading" @click="exportSavedPdf">
        <span class="mdi" :class="pdfLoading ? 'mdi-loading mdi-spin' : 'mdi-file-download-outline'" aria-hidden="true"></span>{{ pdfLoading ? 'מכין PDF…' : 'הורד PDF' }}
      </button>
      <span v-if="savedScopeLabel" class="saved-scope-label" role="status">{{ savedScopeLabel }}</span>
    </div>
    <p v-if="activeTab === 'matches' && pdfError" class="page-error" role="alert">{{ pdfError }}</p>

    <section
      id="saved-library-panel"
      role="tabpanel"
      :aria-labelledby="
        activeTab === 'matches' ? 'saved-matches-tab' : 'saved-entries-tab'
      "
      :aria-busy="loading"
      :data-state="
        loading && !rows.length
          ? 'loading'
          : error
            ? errorKind === 'auth'
              ? 'authentication-error'
              : 'server-error'
            : rows.length
              ? 'results'
              : 'empty'
      "
      tabindex="0"
    >
      <p class="sr-only" role="status">
        {{
          loading ? "טוען את הספרייה" : error ? errorTitle : `${total} תוצאות`
        }}
      </p>
      <div
        v-if="loading && !rows.length"
        class="library-state loading-state"
        role="status"
      >
        <span class="mdi mdi-loading mdi-spin" aria-hidden="true"></span>טוען את
        השמורים…
      </div>
      <div
        v-else-if="error && !rows.length"
        class="library-state error-state"
        role="alert"
      >
        <strong>{{ errorTitle }}</strong
        ><span>{{ error }}</span
        ><button
          class="state-action"
          type="button"
          @click="
            errorKind === 'auth' || errorKind === 'compatibility'
              ? reloadApplication()
              : retryLibrary()
          "
        >
          {{ errorActionLabel }}
        </button>
      </div>
      <div v-else-if="!rows.length" class="library-state empty-state">
        <span
          class="mdi mdi-bookmark-outline empty-icon"
          aria-hidden="true"
        ></span>
        <strong>{{
          savedScopeLabel
            ? "אין התאמות שמורות בסינון שנבחר"
            : searchQuery || filtersActive
            ? "לא נמצאו תוצאות"
            : activeTab === "matches"
              ? "ההתאמות שלך יופיעו כאן"
              : "עדיין לא נשמרו ערכים"
        }}</strong>
        <span v-if="savedScopeLabel">{{ savedScopeLabel }} · אפשר לבחור פרשה אחרת או לשנות את הסינון.</span>
        <span v-else-if="searchQuery || filtersActive"
          >אפשר לנסות חיפוש אחר או לשנות את הסינון.</span
        >
        <span v-else-if="activeTab === 'matches'"
          >מצאת התאמה במחשבון? לחיצה על ״שמור התאמה״ תוסיף אותה לכאן.</span
        >
        <span v-else>שמירת ביטוי במחשבון תוסיף אותו לספרייה שלך.</span>
        <button
          v-if="searchQuery || filtersActive"
          class="state-action"
          type="button"
          @click="clearAll"
        >
          נקה חיפוש וסינון
        </button>
        <button
          v-else
          class="state-action"
          type="button"
          @click="$emit('open-calculator')"
        >
          למחשבון
        </button>
      </div>
      <button
        v-if="rows.length && loadedStartOffset > 0"
        class="show-all-btn"
        type="button"
        @click="refreshEntries"
      >
        הצג את כל השמורים
      </button>
      <div
        v-if="rows.length"
        class="entries-list"
        :class="{
          'grid-mode': activeTab === 'entries' && viewMode === 'grid',
          'grouped-mode': activeTab === 'entries' && groupByGematria,
        }"
      >
        <template v-for="item in displayFlow" :key="item.key">
          <h2 v-if="item.parshaGroup" class="saved-parsha-heading" :data-parsha-id="item.parshaId">{{ item.label }}</h2>
          <h2 v-else-if="item.group" class="group-header">
            <span dir="ltr">{{ item.value }}</span
            ><span>{{ item.count }} ערכים שמורים</span>
          </h2>
          <SavedEntryCard
            v-else
            :entry="item.entry"
            :relationship="activeTab === 'matches'"
            :focused="focusedKey === rowKey(item.entry)"
            :menu-open="menuOpenId === rowKey(item.entry)"
            @toggle-menu="menuOpenId = $event"
            @details="showDetail"
            @open-source="openSource"
            @copy="copyEntry"
            @delete="confirmDelete"
          />
        </template>
      </div>
      <div v-if="error && rows.length" class="page-error" role="alert">
        {{ error
        }}<button
          type="button"
          class="state-action"
          @click="
            errorKind === 'auth' || errorKind === 'compatibility'
              ? reloadApplication()
              : fetchRows(false)
          "
        >
          {{ errorActionLabel }}
        </button>
      </div>
      <button
        v-if="hasMore && rows.length"
        class="load-more-btn"
        type="button"
        :disabled="loading"
        @click="fetchRows(false)"
      >
        {{
          loading
            ? "טוען…"
            : groupByGematria && activeTab === "entries"
              ? "הצג עוד"
              : `הצג עוד (${Math.max(0, total - loadedStartOffset - rows.length)} נותרו)`
        }}
      </button>
    </section>
    <div v-if="notice" class="library-notice" role="status">{{ notice }}</div>

    <Teleport to="body">
      <dialog
        ref="detailDialog"
        class="library-detail-dialog"
        aria-label="פירוט מילים"
        @close="onDetailClosed"
        @click="onDetailBackdrop"
      >
        <template v-if="detailEntry">
          <p v-if="detailMatch" class="detail-relationship">
            {{ detailMatch.parentOriginalText
            }}<span aria-hidden="true"> ← </span>{{ detailMatch.originalText }}
          </p>
          <SavedEntryDetail
            :entry="detailEntry"
            :milui-mapping="miluiMapping"
            :words-open="true"
            @close="closeDetail"
            @open-curated="openSource"
            @open-entry-tefillot="openPrayerFromDetail"
            @remove-curated="confirmNestedDelete"
          />
        </template>
      </dialog>
      <dialog
        ref="deleteDialog"
        class="library-delete-dialog"
        aria-labelledby="saved-delete-title"
        aria-describedby="saved-delete-description"
        @cancel="onDeleteCancel"
        @close="onDeleteClosed"
        @click="onDeleteBackdrop"
      >
        <template v-if="deleteTarget">
          <h2 id="saved-delete-title">
            {{ deleteIsMatch ? "להסיר את ההתאמה?" : "להסיר את הערך מהשמורים?" }}
          </h2>
          <p class="delete-expression">
            {{
              deleteIsMatch
                ? deleteTarget.originalText
                : deleteTarget.original_text
            }}
          </p>
          <p id="saved-delete-description">
            {{
              deleteIsMatch
                ? "הביטוי המקורי ושאר ההתאמות שלו יישארו שמורים."
                : "הערך וההתאמות המשויכות אליו יוסרו מהספרייה."
            }}
          </p>
          <p v-if="deleteError" class="delete-error" role="alert">
            {{ deleteError }}
          </p>
          <div class="delete-actions">
            <button
              ref="cancelDeleteButton"
              type="button"
              class="modal-cancel"
              :disabled="deleting"
              @click="closeDelete"
            >
              ביטול</button
            ><button
              type="button"
              class="modal-remove"
              :disabled="deleting"
              @click="doDelete"
            >
              {{ deleting ? "מסיר…" : "הסר משמורים" }}
            </button>
          </div>
        </template>
      </dialog>
    </Teleport>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useAutomaticHebrewKeyboard } from "@/composables/useAutomaticHebrewKeyboard.js";
import SavedEntryCard from "@/components/SavedEntryCard.vue";
import SavedEntryDetail from "@/components/SavedEntryDetail.vue";
import { computeAll } from "@/composables/useGematria.js";
import { normalizeMiluiMapping } from "@/utils/milui.js";
import { tanachContextOf, tefillotContextOf } from "@/utils/tefillotContext.js";
import { downloadSavedMatchesPdf } from "@/utils/savedLibraryPdf.js";
const props = defineProps({ focusMatch: { type: Object, default: null } });
const emit = defineEmits([
  "open-tanach",
  "open-tefillot",
  "open-calculator",
  "focus-consumed",
]);
const { onHebrewKeydown } = useAutomaticHebrewKeyboard();
const activeTab = ref("matches");
const rows = ref([]);
const counts = ref({ matches: null, entries: null });
const countsLoading = ref(true);
const total = ref(0);
const hasMore = ref(false);
const offset = ref(0);
const loadedStartOffset = ref(0);
const loading = ref(true);
const error = ref("");
const errorKind = ref("");
const errorTitle = computed(() =>
  errorKind.value === "auth"
    ? "נדרשת כניסה מחדש"
    : errorKind.value === "compatibility"
      ? "גרסת הספרייה אינה זמינה כרגע"
      : "לא ניתן לטעון את הספרייה",
);
const errorActionLabel = computed(() =>
  errorKind.value === "auth"
    ? "כניסה מחדש"
    : errorKind.value === "compatibility"
      ? "רענן את היישום"
      : "נסה שוב",
);
const searchQuery = ref("");
const source = ref("");
const savedParshaId = ref("");
const savedParshaScope = ref(false);
const savedWeekly = ref(false);
const weeklyParshah = ref(null);
const parshaSelect = ref(null);
const pdfLoading = ref(false);
const pdfError = ref("");
let pdfController;
const savedScopeLabel = computed(() => {
  if (savedWeekly.value) return weeklyParshah.value ? `פרשת השבוע · ${weeklyParshah.value.nameHe}` : "השבוע אין קריאת פרשה רגילה";
  if (savedParshaId.value) {
    const portion = savedParshaGroups.value.flatMap(book => book.portions).find(item => item.id === savedParshaId.value);
    return portion ? `פרשת ${portion.name_he}` : "הפרשה שנבחרה";
  }
  return savedParshaScope.value ? "כל הפרשיות · לפי סדר הפסוקים" : "";
});
const savedParshaGroups = ref([]);
const parshaOptionsLoading = ref(false);
const parshaOptionsError = ref("");
const matchType = ref("");
const sort = ref("recent");
const viewMode = ref("list");
const groupByGematria = ref(false);
const filterOpen = ref(false);
const filterWrap = ref(null);
const filterButton = ref(null);
const filterPanel = ref(null);
const libraryHeading = ref(null);
const menuOpenId = ref(null);
const focusedKey = ref(null);
const detailDialog = ref(null);
const detailEntry = ref(null);
const detailMatch = ref(null);
const deleteDialog = ref(null);
const cancelDeleteButton = ref(null);
const deleteTarget = ref(null);
const deleteIsMatch = ref(false);
const deleteError = ref("");
const deleting = ref(false);
const notice = ref("");
const miluiMapping = ref(null);
let activeController;
let countsController;
let countsRequestId = 0;
const countVersions = { matches: 0, entries: 0 };
let requestId = 0;
let searchTimer;
let noticeTimer;
let restoreKey = null;
let mounted = false;
const filtersActive = computed(() =>
  Boolean(
    source.value ||
      savedParshaId.value ||
      savedParshaScope.value || savedWeekly.value ||
      matchType.value ||
      sort.value !== "recent" ||
      (activeTab.value === "entries" && groupByGematria.value),
  ),
);
function rowKey(entry) {
  return activeTab.value === "matches"
    ? entry.key
    : `${entry.sourceType || entry.source_type || "manual"}:${entry.id}`;
}
const displayFlow = computed(() => {
  if (activeTab.value === "matches" && (savedParshaScope.value || savedWeekly.value || savedParshaId.value)) {
    let previous;
    return rows.value.flatMap(entry => {
      const heading = entry.parshaId && entry.parshaId !== previous;
      previous = entry.parshaId;
      return [
        ...(heading ? [{ key: `parsha-${entry.parshaId}`, parshaGroup: true, parshaId: entry.parshaId,
          label: `${entry.tanachContext?.bookLabel || ''} · פרשת ${entry.parshaName}` }] : []),
        { key: rowKey(entry), entry },
      ];
    });
  }
  if (activeTab.value !== "entries" || !groupByGematria.value)
    return rows.value.map((entry) => ({ key: rowKey(entry), entry }));
  const groups = new Map();
  for (const entry of rows.value) {
    const key = entry.full_gematria;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups].flatMap(([value, entries]) => [
    { key: `group-${value}`, group: true, value, count: entries.length },
    ...entries.map((entry) => ({ key: rowKey(entry), entry })),
  ]);
});
async function fetchRows(reset = true, focus = null) {
  clearTimeout(searchTimer);
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const currentRequest = ++requestId;
  loading.value = true;
  pdfError.value = "";
  error.value = "";
  errorKind.value = "";
  menuOpenId.value = null;
  if (reset) {
    offset.value = 0;
    loadedStartOffset.value = 0;
    rows.value = [];
  }
  try {
    const params = new URLSearchParams({
      limit:
        activeTab.value === "entries" && groupByGematria.value ? "20" : "40",
      offset: String(offset.value),
      sort: sort.value,
    });
    const isMatch = activeTab.value === "matches";
    if (isMatch) {
      for (const [key, value] of savedMatchParams()) params.set(key, value);
      if (focus) params.set("focus", focus);
    } else {
      if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
      params.set("grouped", String(groupByGematria.value));
    }
    const response = await fetch(
      `/api/entries${isMatch ? "/curated-matches" : ""}?${params}`,
      { signal: controller.signal },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(data.error || "load");
      failure.status = response.status;
      throw failure;
    }
    if (currentRequest !== requestId) return false;
    const incoming = isMatch ? data.matches : data.entries;
    if (
      !Array.isArray(incoming) ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0
    )
      throw new Error("invalid_library_response");
    rows.value = reset ? incoming : [...rows.value, ...incoming];
    if (reset) loadedStartOffset.value = data.pagination?.offset || 0;
    total.value = data.total;
    if (isMatch && Object.hasOwn(data, "weeklyParshah")) weeklyParshah.value = data.weeklyParshah;
    hasMore.value = data.pagination?.hasMore ?? rows.value.length < data.total;
    offset.value =
      data.pagination?.nextOffset ?? offset.value + incoming.length;
    applyKnownCounts(data.counts);
    if (!isMatch && !params.has("search"))
      setCount("entries", data.stats?.saved ?? data.total);
    if (focus) {
      focusedKey.value = data.focusedKey;
      await nextTick();
      const target = [...document.querySelectorAll("[data-match-key]")].find(
        (node) => node.dataset.matchKey === focus,
      );
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "center", behavior: "instant" });
      } else showNotice("ההתאמה אינה נמצאת עוד בשמורים");
    }
    return true;
  } catch (err) {
    if (err.name !== "AbortError" && currentRequest === requestId) {
      errorKind.value = [401, 403].includes(err.status)
        ? "auth"
        : err.status === 404
          ? "compatibility"
          : "server";
      error.value =
        errorKind.value === "auth"
          ? "תוקף הכניסה פג. יש להיכנס מחדש כדי לראות את השמורים."
          : errorKind.value === "compatibility"
            ? "אפשר לרענן את היישום ולנסות שוב."
            : "הטעינה נכשלה. אפשר לנסות שוב בעוד רגע.";
    }
    return false;
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}
function refreshEntries() {
  focusedKey.value = null;
  return fetchRows();
}
function retryLibrary() {
  fetchCounts();
  if (activeTab.value === "matches" && props.focusMatch)
    return focusSaved(props.focusMatch);
  return refreshEntries();
}
function reloadApplication() {
  window.location.reload();
}
function onSearch() {
  clearTimeout(searchTimer);
  activeController?.abort();
  searchTimer = setTimeout(refreshEntries, 250);
}
function clearSearch() {
  searchQuery.value = "";
  refreshEntries();
}
function clearAll() {
  searchQuery.value = "";
  resetFilters();
}
function onSourceFilterChange() {
  if (source.value === "tefillot") {
    savedParshaId.value = "";
    savedParshaScope.value = false;
    savedWeekly.value = false;
  }
  refreshEntries();
}
function onParshaFilterChange() {
  source.value = "tanach";
  savedParshaScope.value = true;
  savedWeekly.value = false;
  refreshEntries();
}
function savedMatchParams() {
  const params = new URLSearchParams({ sort: sort.value });
  if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
  if (source.value) params.set("source", source.value);
  if (matchType.value) params.set("matchType", matchType.value);
  if (savedWeekly.value) params.set("parsha", "current");
  else if (savedParshaId.value) params.set("parsha_id", savedParshaId.value);
  if (savedParshaScope.value) params.set("parsha_scope", "torah");
  return params;
}
function toggleSavedWeekly() {
  savedWeekly.value = !savedWeekly.value;
  savedParshaId.value = "";
  savedParshaScope.value = savedWeekly.value;
  if (savedWeekly.value) source.value = "tanach";
  closeFilters();
  refreshEntries();
}
async function browseSavedParsha() {
  savedWeekly.value = false;
  savedParshaScope.value = true;
  source.value = "tanach";
  refreshEntries();
  filterOpen.value = true;
  menuOpenId.value = null;
  await nextTick();
  parshaSelect.value?.focus();
}
async function exportSavedPdf() {
  if (loading.value || error.value || !total.value || pdfLoading.value) return;
  pdfController = new AbortController();
  pdfLoading.value = true;
  pdfError.value = "";
  try {
    await downloadSavedMatchesPdf({ params: savedMatchParams() }, { signal: pdfController.signal });
  } catch (failure) {
    if (failure.name !== "AbortError") pdfError.value = failure.userMessage || "לא ניתן להוריד את הקובץ כרגע. אפשר לנסות שוב.";
  } finally {
    pdfLoading.value = false;
  }
}
async function fetchParshaOptions() {
  parshaOptionsLoading.value = true;
  parshaOptionsError.value = "";
  try {
    const response = await fetch("/api/tanach/books");
    if (!response.ok) throw new Error("parshiot");
    const data = await response.json();
    if (!mounted) return;
    if (!Array.isArray(data.parshiot) || data.parshiot.length !== 54)
      throw new Error("parshiot");
    const groups = new Map();
    for (const portion of [...data.parshiot].sort(
      (a, b) => a.canonical_order - b.canonical_order,
    )) {
      if (!groups.has(portion.start_book_slug))
        groups.set(portion.start_book_slug, {
          label: portion.start_book_name,
          portions: [],
        });
      groups.get(portion.start_book_slug).portions.push(portion);
    }
    savedParshaGroups.value = [...groups.values()];
  } catch {
    if (mounted) parshaOptionsError.value = "לא ניתן לטעון את הפרשיות כרגע.";
  } finally {
    if (mounted) parshaOptionsLoading.value = false;
  }
}
function resetFilters() {
  source.value = "";
  savedParshaId.value = "";
  savedParshaScope.value = false;
  savedWeekly.value = false;
  matchType.value = "";
  sort.value = "recent";
  groupByGematria.value = false;
  refreshEntries();
}
function setTab(tab) {
  if (activeTab.value === tab) return;
  activeTab.value = tab;
  closeFilters();
  source.value = "";
  savedParshaId.value = "";
  savedParshaScope.value = false;
  savedWeekly.value = false;
  matchType.value = "";
  refreshEntries();
}
function onTabKeydown(event, tab) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? "matches"
      : event.key === "End"
        ? "entries"
        : tab === "matches"
          ? "entries"
          : "matches";
  setTab(next);
  document.getElementById(`saved-${next}-tab`)?.focus();
}
async function toggleFilters() {
  filterOpen.value = !filterOpen.value;
  if (filterOpen.value) {
    menuOpenId.value = null;
    await nextTick();
    filterPanel.value?.querySelector("select")?.focus();
  }
}
function closeFilters(restore = false) {
  filterOpen.value = false;
  if (restore) filterButton.value?.focus();
}
function outsideFilter(event) {
  if (filterOpen.value && !filterWrap.value?.contains(event.target))
    closeFilters();
}
function saveView() {
  try {
    localStorage.setItem("gematria-library-view", viewMode.value);
  } catch {}
}
async function focusSaved(value) {
  if (!value) return;
  activeTab.value = "matches";
  searchQuery.value = "";
  source.value = "";
  savedParshaId.value = "";
  savedParshaScope.value = false;
  savedWeekly.value = false;
  matchType.value = "";
  sort.value = "recent";
  filterOpen.value = false;
  const success = await fetchRows(
    true,
    `${value.sourceType || "tanach"}:${value.id}`,
  );
  if (success) emit("focus-consumed", value.requestId);
}
function sourceContext(entry) {
  const prayer = tefillotContextOf(entry);
  if (prayer) return { type: "tefillot", context: prayer };
  if (entry.tanach_book_slug)
    return {
      type: "tanach",
      context: {
        bookSlug: entry.tanach_book_slug,
        chapter: entry.tanach_chapter,
        verse: entry.tanach_verse,
        start: entry.tanach_start,
        end: entry.tanach_end,
      },
    };
  return { type: "tanach", context: tanachContextOf(entry) };
}
function openSource(entry) {
  const result = sourceContext(entry);
  if (!result.context) return;
  closeDetail();
  emit(`open-${result.type}`, result.context);
}
function openPrayerFromDetail(context) {
  closeDetail();
  emit("open-tefillot", context);
}
function asDetail(match) {
  const c =
    match.calculation || computeAll(match.originalText || match.original_text);
  const context = tanachContextOf(match);
  return {
    id: match.id,
    original_text: match.originalText || match.original_text,
    full_gematria: c?.fullGematria,
    full_gematria_hebrew: c?.fullHebrewNumber,
    initials: c?.initials,
    initials_gematria: c?.initialsGematria,
    initials_gematria_hebrew: c?.initialsHebrewNumber,
    finals: c?.finals,
    finals_gematria: c?.finalsGematria,
    finals_gematria_hebrew: c?.finalsHebrewNumber,
    words: c?.words || [],
    tefillotContext: tefillotContextOf(match),
    ...(context
      ? {
          tanach_book_slug: context.bookSlug,
          tanach_book_label:
            match.bookLabel ||
            match.tanachContext?.bookLabel ||
            context.bookSlug,
          tanach_chapter: context.chapter,
          tanach_verse: context.verse,
          tanach_start: context.start,
          tanach_end: context.end,
        }
      : {}),
  };
}
async function showDetail(entry) {
  restoreKey = rowKey(entry);
  detailMatch.value = activeTab.value === "matches" ? entry : null;
  detailEntry.value = detailMatch.value ? asDetail(entry) : entry;
  await nextTick();
  detailDialog.value.showModal();
}
function closeDetail() {
  detailDialog.value?.close();
}
function restoreRowFocus(key) {
  nextTick(() => {
    const row = [...document.querySelectorAll("[data-entry-key]")].find(
      (node) => node.dataset.entryKey === key,
    );
    (row?.querySelector(".menu-btn") || libraryHeading.value)?.focus();
  });
}
function onDetailClosed() {
  detailEntry.value = null;
  detailMatch.value = null;
  restoreRowFocus(restoreKey);
}
function backdrop(event, dialog) {
  if (event.target !== dialog) return false;
  const r = dialog.getBoundingClientRect();
  return (
    event.clientX < r.left ||
    event.clientX > r.right ||
    event.clientY < r.top ||
    event.clientY > r.bottom
  );
}
function onDetailBackdrop(event) {
  if (backdrop(event, detailDialog.value)) closeDetail();
}
async function confirmDelete(entry) {
  restoreKey = rowKey(entry);
  deleteIsMatch.value = activeTab.value === "matches";
  deleteTarget.value = entry;
  deleteError.value = "";
  await nextTick();
  deleteDialog.value.showModal();
  cancelDeleteButton.value?.focus();
}
async function confirmNestedDelete({ entry, match }) {
  deleteIsMatch.value = true;
  deleteTarget.value = {
    ...match,
    parentId: entry.id,
    sourceType: match.sourceType || match.source_type || "tanach",
    originalText: match.originalText || match.original_text,
  };
  deleteError.value = "";
  await nextTick();
  deleteDialog.value.showModal();
  cancelDeleteButton.value?.focus();
}
function closeDelete() {
  if (!deleting.value) deleteDialog.value?.close();
}
function onDeleteCancel(event) {
  if (deleting.value) event.preventDefault();
}
function onDeleteClosed() {
  deleteTarget.value = null;
  deleteError.value = "";
  if (detailDialog.value?.open)
    detailDialog.value.querySelector("button")?.focus();
  else restoreRowFocus(restoreKey);
}
function onDeleteBackdrop(event) {
  if (backdrop(event, deleteDialog.value)) closeDelete();
}
async function doDelete() {
  if (!deleteTarget.value || deleting.value) return;
  deleting.value = true;
  deleteError.value = "";
  try {
    const target = deleteTarget.value;
    const url = deleteIsMatch.value
      ? `/api/entries/${target.parentId}/curated-matches/${target.id}${target.sourceType === "tefillot" ? "?source=tefillot" : ""}`
      : `/api/entries/${target.id}`;
    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) throw new Error("delete");
    if (detailEntry.value?.curated_matches && deleteIsMatch.value)
      detailEntry.value.curated_matches =
        detailEntry.value.curated_matches.filter(
          (item) =>
            !(
              item.id === target.id &&
              (item.sourceType || item.source_type || "tanach") ===
                target.sourceType
            ),
        );
    deleteDialog.value.close();
    showNotice(
      deleteIsMatch.value ? "ההתאמה הוסרה מהשמורים" : "הערך הוסר מהשמורים",
    );
    await refreshEntries();
    await fetchCounts();
  } catch {
    deleteError.value = "לא ניתן להסיר כרגע. אפשר לנסות שוב.";
  } finally {
    deleting.value = false;
  }
}
function showNotice(text) {
  notice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 4000);
}
async function copyEntry(entry) {
  try {
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(entry.original_text);
    else {
      const helper = document.createElement("textarea");
      helper.value = entry.original_text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      try {
        if (!document.execCommand("copy")) throw new Error("copy");
      } finally {
        helper.remove();
      }
    }
    showNotice("הטקסט הועתק");
  } catch {
    showNotice("לא ניתן להעתיק כרגע");
  }
}
function setCount(key, value) {
  if (!Number.isSafeInteger(value) || value < 0) return;
  counts.value[key] = value;
  countVersions[key] += 1;
}
function applyKnownCounts(incoming) {
  if (!incoming) return;
  for (const key of ["matches", "entries"]) setCount(key, incoming[key]);
}
function countText(key) {
  const value = counts.value[key];
  return value === null
    ? countsLoading.value
      ? "…"
      : "—"
    : value.toLocaleString("he-IL");
}
function countLabel(key) {
  if (counts.value[key] !== null)
    return key === "matches" ? "התאמות שמורות" : "ערכים שמורים";
  return countsLoading.value
    ? "טוען את מספר השמורים"
    : "מספר השמורים אינו זמין כרגע";
}
async function fetchCounts() {
  countsController?.abort();
  pdfController?.abort();
  const controller = new AbortController();
  countsController = controller;
  const currentRequest = ++countsRequestId;
  const versions = { ...countVersions };
  countsLoading.value = true;
  try {
    const response = await fetch("/api/entries/counts", {
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (currentRequest !== countsRequestId) return;
    for (const key of ["matches", "entries"]) {
      if (countVersions[key] !== versions[key]) continue;
      const value = data.counts?.[key];
      counts.value[key] =
        Number.isSafeInteger(value) && value >= 0 ? value : null;
      countVersions[key] += 1;
    }
  } catch (failure) {
    if (failure.name !== "AbortError" && currentRequest === countsRequestId) {
      for (const key of ["matches", "entries"]) {
        if (countVersions[key] === versions[key]) counts.value[key] = null;
      }
    }
  } finally {
    if (currentRequest === countsRequestId) countsLoading.value = false;
  }
}
async function fetchMiluiMapping() {
  try {
    const response = await fetch("/api/settings/milui");
    if (response.ok) {
      const checked = normalizeMiluiMapping((await response.json()).mapping);
      if (checked.valid) miluiMapping.value = checked.mapping;
    }
  } catch {}
}
watch(
  () => props.focusMatch,
  (value) => {
    if (mounted && value) focusSaved(value);
  },
);
onMounted(() => {
  mounted = true;
  try {
    const saved = localStorage.getItem("gematria-library-view");
    if (["list", "grid"].includes(saved)) viewMode.value = saved;
  } catch {}
  document.addEventListener("pointerdown", outsideFilter);
  if (props.focusMatch) focusSaved(props.focusMatch);
  else refreshEntries();
  fetchCounts();
  fetchParshaOptions();
  fetchMiluiMapping();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(searchTimer);
  clearTimeout(noticeTimer);
  activeController?.abort();
  countsController?.abort();
  countsRequestId += 1;
  document.removeEventListener("pointerdown", outsideFilter);
});
</script>

<style scoped>
.saved-match-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 13px 0 16px;
}
.saved-match-tools button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 7px 11px;
  border: 1px solid #e0d7c7;
  border-radius: 8px;
  background: #fffdf9;
  color: #344960;
  font: inherit;
  font-size: 0.83rem;
  cursor: pointer;
}
.saved-match-tools button[aria-pressed="true"] {
  background: #f6edda;
  border-color: #c6ab70;
  color: #765f30;
}
.saved-match-tools button:hover:not(:disabled) { background: #f8f1e4; }
.saved-match-tools button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.saved-match-tools button:disabled { opacity: 0.5; cursor: default; }
.saved-scope-label { color: #7e6c4e; font-size: 0.79rem; margin-inline-start: 7px; }
.saved-parsha-heading { color: #765f30; font-size: 0.9rem; font-weight: 600; margin: 8px 0 0; grid-column: 1 / -1; }
@media (max-width: 560px) {
  .saved-match-tools { gap: 5px; }
  .saved-match-tools button { flex: 1; min-height: 44px; padding-inline: 6px; font-size: 0.79rem; }
  .saved-scope-label { flex-basis: 100%; margin: 3px 1px 0; }
}
.library-page {
  width: 100%;
  max-width: 1540px;
  margin: 0 auto;
}
.library-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 4px 0 26px;
}
.library-emblem {
  color: #b88c25;
  font-size: 2.5rem;
  line-height: 1;
}
.library-title {
  color: #112740;
  font-size: 2.05rem;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.5px;
}
.library-title:focus {
  outline: none;
}
.library-subtitle {
  margin-top: 6px;
  color: #7a879d;
  font-size: 1rem;
}
.library-tabs {
  display: flex;
  width: min(100%, 560px);
  gap: 4px;
  padding: 4px;
  border: 1px solid #e5dfd5;
  border-radius: 13px;
  background: #eeeae3;
}
.library-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #69758a;
  font: inherit;
  font-size: 1.02rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.library-tabs button[aria-selected="true"] {
  color: #18324b;
  background: #fffefb;
  border-color: #e0d7c6;
  box-shadow: 0 1px 3px #1a27440a;
}
.library-tabs button:hover:not([aria-selected="true"]) {
  color: var(--navy);
  background: #f5f2ec;
}
.library-tabs .mdi {
  font-size: 1.18rem;
}
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 24px;
  padding: 1px 8px;
  border-radius: 99px;
  background: #e6e1d9;
  color: #657184;
  font-size: 0.83rem;
  font-variant-numeric: tabular-nums;
}
[aria-selected="true"] .tab-count {
  background: #f4ecdc;
  color: #79602b;
}
.library-tools {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-height: 50px;
  margin: 20px 0 22px;
  border: 1px solid #dddcd7;
  border-radius: 12px;
  background: #fffefb;
}
.library-tools:focus-within {
  border-color: #b4a078;
  box-shadow: 0 0 0 2px #c0984010;
}
.search-bar {
  display: flex;
  align-items: center;
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 48px;
}
.search-icon {
  color: #1a2744;
  font-size: 1.35rem;
  margin-inline: 14px 10px;
}
.search-input {
  min-width: 0;
  width: 100%;
  padding: 11px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--navy);
  font: inherit;
  font-size: 0.98rem;
}
.search-input::placeholder {
  color: #7c89a1;
  opacity: 1;
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.clear-btn {
  flex: 0 0 44px;
  height: 44px;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  cursor: pointer;
}
.filter-wrap {
  position: relative;
  flex: 0 0 auto;
}
.filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 104px;
  height: 48px;
  padding: 8px 16px;
  border: 0;
  border-inline-start: 1px solid #e9e4da;
  border-radius: 11px 0 0 11px;
  background: transparent;
  color: var(--navy);
  font: inherit;
  font-size: 0.94rem;
  cursor: pointer;
}
.filter-button .mdi {
  font-size: 1.2rem;
}
.filter-button:hover,
.filter-button[aria-expanded="true"] {
  background: #f5f0e6;
}
.filter-dot {
  width: 6px;
  height: 6px;
  background: var(--gold);
  border-radius: 50%;
}
.filter-panel {
  position: absolute;
  z-index: 40;
  top: calc(100% + 10px);
  left: 0;
  width: 286px;
  max-width: calc(100vw - 32px);
  padding: 18px;
  border: 1px solid #e9e2d5;
  border-radius: 15px;
  background: #fff;
  box-shadow: 0 8px 28px #1a27441c;
}
.filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.filter-heading button {
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}
.filter-panel label {
  display: grid;
  gap: 6px;
  margin-top: 13px;
  font-size: 0.88rem;
  color: var(--text-secondary);
}
.filter-panel select {
  width: 100%;
  min-height: 43px;
  padding: 7px 10px;
  border: 1px solid #e6dfd2;
  border-radius: 8px;
  color: var(--navy);
  background: #fffdf9;
  font: inherit;
}
.canonical-order-note {
  color: #765f30;
  font-size: 0.85rem;
  padding: 8px 0;
}
.parsha-filter-error {
  color: #9a4a3b;
  font-size: 0.76rem;
  margin-top: 8px;
}
.parsha-filter-error button {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.filter-panel .group-toggle {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 36px;
  color: var(--navy);
}
.group-toggle input {
  accent-color: #18324c;
  width: 16px;
  height: 16px;
}
.reset-filters {
  margin-top: 17px;
  border: 0;
  background: transparent;
  color: #86621d;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.entries-list {
  display: grid;
  gap: 14px;
}
.entries-list.grid-mode {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.group-header {
  display: flex;
  align-items: center;
  gap: 14px;
  grid-column: 1 / -1;
  padding: 12px 4px 2px;
  color: #77591e;
  font-size: 1.1rem;
}
.group-header span + span {
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 400;
}
.library-state {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 14px;
  min-height: 270px;
  padding: 38px 20px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.65;
}
.library-state strong {
  color: var(--navy);
  font-size: 1.2rem;
}
.empty-icon {
  font-size: 2.7rem;
  color: #bd9b55;
}
.loading-state .mdi {
  font-size: 1.8rem;
  color: var(--gold);
}
.state-action {
  padding: 8px 15px;
  border: 1px solid #dfd1b6;
  border-radius: 9px;
  background: #fffaf0;
  color: #7b5c20;
  font: inherit;
  cursor: pointer;
}
.load-more-btn {
  display: block;
  min-width: 180px;
  min-height: 46px;
  margin: 25px auto 0;
  padding: 10px 20px;
  background: #fffdf8;
  border: 1px solid #e2d7c3;
  border-radius: 11px;
  color: var(--navy);
  font: inherit;
  cursor: pointer;
}
.load-more-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.show-all-btn {
  display: block;
  margin: 0 0 14px;
  padding: 7px 0;
  border: 0;
  background: none;
  color: #80601d;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.page-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  margin-top: 20px;
  color: #a33b35;
}
.library-notice {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 210;
  max-width: calc(100vw - 32px);
  padding: 13px 23px;
  border-radius: 11px;
  background: #172d45;
  color: #fff;
  box-shadow: 0 4px 20px #1a274424;
  text-align: center;
}
.library-detail-dialog,
.library-delete-dialog {
  position: fixed;
  inset: 0;
  width: min(780px, calc(100vw - 32px));
  max-height: calc(100dvh - 40px);
  margin: auto;
  padding: 0;
  overflow-y: auto;
  border: 1px solid #e6dfd2;
  border-radius: 17px;
  background: #fffcf7;
  color: var(--navy);
  box-shadow: 0 16px 60px #15243d33;
  direction: rtl;
}
.library-detail-dialog::backdrop,
.library-delete-dialog::backdrop {
  background: #11274055;
}
.detail-relationship {
  padding: 18px 21px 0;
  color: #7b6743;
  font-size: 1rem;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.library-detail-dialog :deep(.entry-detail) {
  border: 0;
  background: transparent;
  padding: 18px 22px 22px;
}
.library-delete-dialog {
  width: min(430px, calc(100vw - 32px));
  padding: 27px;
}
.library-delete-dialog h2 {
  margin-bottom: 13px;
  font-size: 1.25rem;
}
.delete-expression {
  font-family: "Noto Serif Hebrew", serif;
  font-size: 1.15rem;
  line-height: 1.9;
  max-height: 180px;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
#saved-delete-description {
  margin-top: 14px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.65;
}
.delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 25px;
}
.delete-actions button {
  min-height: 43px;
  padding: 8px 16px;
  border-radius: 9px;
  cursor: pointer;
  font: inherit;
}
.modal-cancel {
  border: 1px solid #e0d9cd;
  color: var(--navy);
  background: #fff;
}
.modal-remove {
  border: 1px solid #ad3034;
  background: #ad3034;
  color: #fff;
}
.delete-error {
  color: #ad3034;
  margin-top: 15px;
}
button:focus-visible,
select:focus-visible,
input:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}
.search-input:focus-visible {
  outline: 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 700px) {
  .library-header {
    gap: 12px;
    margin: 2px 0 22px;
  }
  .library-emblem {
    font-size: 2.1rem;
  }
  .library-title {
    font-size: 1.65rem;
  }
  .library-subtitle {
    font-size: 0.95rem;
  }
  .library-tabs {
    gap: 3px;
    padding: 3px;
  }
  .library-tabs button {
    min-height: 44px;
    gap: 6px;
    padding: 7px 8px;
    font-size: 0.88rem;
    border-radius: 8px;
  }
  .library-tabs .mdi {
    display: none;
  }
  .tab-count {
    min-width: 24px;
    min-height: 22px;
    padding: 1px 6px;
    font-size: 0.76rem;
  }
  .library-tools {
    min-height: 46px;
    margin: 16px 0 17px;
  }
  .search-bar {
    min-height: 44px;
  }
  .search-icon {
    font-size: 1.35rem;
    margin-inline: 11px 7px;
  }
  .search-input {
    font-size: 0.9rem;
  }
  .filter-button {
    min-width: 48px;
    width: 48px;
    height: 44px;
    padding: 7px;
    gap: 0;
    font-size: 0;
  }
  .filter-button .mdi {
    font-size: 1.25rem;
  }
  .filter-dot {
    position: absolute;
    top: 8px;
    left: 8px;
  }
  .entries-list,
  .entries-list.grid-mode {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .library-detail-dialog {
    max-height: calc(100dvh - 24px);
  }
  .library-detail-dialog :deep(.entry-detail) {
    padding: 14px;
  }
  .library-delete-dialog {
    padding: 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mdi-spin {
    animation: none;
  }
}
</style>
