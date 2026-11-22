<template>
  <div ref="root" class="parsha-browser">
    <button
      ref="trigger"
      type="button"
      class="parsha-browser-trigger"
      :class="{ active }"
      aria-label="לפי פרשה"
      :aria-expanded="open"
      aria-controls="parsha-discovery-panel"
      @click="toggle"
    >
      <span class="mdi mdi-book-open-variant-outline" aria-hidden="true"></span>
      <span>לפי פרשה</span>
      <span v-if="active" class="selected-parsha">{{
        selectedName || "כל הפרשיות"
      }}</span>
      <span class="ui-chevron ui-chevron--down" aria-hidden="true"></span>
    </button>
    <div
      v-if="open"
      id="parsha-discovery-panel"
      ref="panel"
      class="parsha-browser-panel"
      role="region"
      aria-label="התאמות לפי פרשה"
      @keydown.esc.stop.prevent="close(true)"
    >
      <header class="parsha-browser-header">
        <div>
          <strong>לפי פרשה</strong><span>חמשת חומשי תורה · לפי סדר הקריאה</span>
        </div>
        <button
          type="button"
          class="parsha-browser-close"
          aria-label="סגור בחירת פרשה"
          @click="close(true)"
        >
          <span class="mdi mdi-close" aria-hidden="true"></span>
        </button>
      </header>
      <div
        v-if="loading && !summary"
        class="parsha-browser-state"
        role="status"
      >
        טוען את ההתאמות בפרשיות…
      </div>
      <div
        v-else-if="error && !summary"
        class="parsha-browser-state"
        role="alert"
      >
        <span>{{ error }}</span
        ><button type="button" @click="$emit('retry')">נסה שוב</button>
      </div>
      <template v-else-if="summary">
        <button
          type="button"
          class="all-parshiot"
          :aria-pressed="active && !selectedId"
          @click="$emit('select', '')"
        >
          <span>כל הפרשיות</span
          ><span class="parsha-count" dir="ltr">{{
            number(summary.total)
          }}</span>
        </button>
        <p v-if="summary.weeklyParshah" class="weekly-parsha-note">
          פרשת השבוע: <strong>{{ summary.weeklyParshah.nameHe }}</strong>
        </p>
        <div class="parsha-book-list">
          <details
            v-for="book in summary.books"
            :key="book.bookSlug"
            class="parsha-book"
            :open="
              book.parshiot.some(
                (item) => item.id === selectedId || item.isCurrent,
              ) ||
              (!selectedId && book.canonicalOrder === 1)
            "
          >
            <summary>
              <span>{{ book.bookName }}</span
              ><span class="parsha-count" dir="ltr">{{
                number(book.total)
              }}</span
              ><span
                class="ui-chevron ui-chevron--down"
                aria-hidden="true"
              ></span>
            </summary>
            <div class="parsha-options">
              <button
                v-for="portion in book.parshiot"
                :key="portion.id"
                type="button"
                class="parsha-option"
                :class="{ selected: portion.id === selectedId }"
                :data-parsha-id="portion.id"
                :aria-label="`פרשת ${portion.nameHe}, ${number(portion.total)} התאמות`"
                :aria-pressed="portion.id === selectedId"
                @click="$emit('select', portion.id)"
              >
                <span>{{ portion.nameHe }}</span
                ><span v-if="portion.isCurrent" class="weekly-indicator"
                  >השבוע</span
                ><span class="parsha-count" dir="ltr">{{
                  number(portion.total)
                }}</span>
              </button>
            </div>
          </details>
        </div>
      </template>
      <footer>
        <button type="button" @click="exit">חזרה לכל התנ״ך</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
const props = defineProps({
  active: Boolean,
  selectedId: { type: String, default: "" },
  selectedName: { type: String, default: "" },
  summary: { type: Object, default: null },
  loading: Boolean,
  error: { type: String, default: "" },
});
const emit = defineEmits(["activate", "select", "exit", "retry"]);
const root = ref(null),
  trigger = ref(null),
  panel = ref(null),
  open = ref(false);
function number(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString("he-IL")
    : "—";
}
async function toggle() {
  if (open.value) {
    close(true);
    return;
  }
  open.value = true;
  if (!props.active) emit("activate");
  await nextTick();
  if (open.value)
    panel.value?.querySelector("button")?.focus({ preventScroll: true });
}
function close(restore = false) {
  open.value = false;
  if (restore) trigger.value?.focus({ preventScroll: true });
}
function exit() {
  close(true);
  emit("exit");
}
function outside(event) {
  if (open.value && !root.value?.contains(event.target)) close();
}
watch(
  () => props.active,
  (active) => {
    if (!active) close();
  },
);
document.addEventListener("pointerdown", outside);
document.addEventListener("focusin", outside);
onDeactivated(() => close());
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("focusin", outside);
});
</script>

<style scoped>
.parsha-browser {
  position: relative;
  max-width: 100%;
}
.parsha-browser-trigger {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  max-width: 100%;
  padding: 7px 11px;
  border: 1px solid #ded6c7;
  border-radius: 8px;
  background: #fffdf8;
  color: var(--navy);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.parsha-browser-trigger.active {
  border-color: #c8ad73;
  background: #f7efdd;
}
.parsha-browser-trigger .mdi {
  color: #8a6b2e;
  font-size: 1.05rem;
}
.parsha-browser-trigger .ui-chevron {
  margin-inline-start: 3px;
  width: 0.42rem;
  height: 0.42rem;
}
.selected-parsha {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #79633d;
  font-size: 0.76rem;
}
.parsha-browser-panel {
  position: absolute;
  z-index: 60;
  inset-inline-start: 0;
  top: calc(100% + 8px);
  width: min(650px, calc(100vw - 32px));
  max-height: min(540px, 70dvh);
  overflow-y: auto;
  padding: 14px;
  border: 1px solid #e1d8c8;
  border-radius: 13px;
  background: #fffefa;
  box-shadow: 0 10px 28px #1a274420;
  color: var(--navy);
}
.parsha-browser-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}
.parsha-browser-header > div {
  display: grid;
  gap: 3px;
}
.parsha-browser-header strong {
  font-size: 0.98rem;
}
.parsha-browser-header > div > span {
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.parsha-browser-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  cursor: pointer;
}
.all-parshiot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 42px;
  padding: 8px 11px;
  border: 1px solid #e3d9c5;
  border-radius: 8px;
  background: #faf6ed;
  color: inherit;
  text-align: start;
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
}
.all-parshiot[aria-pressed="true"] {
  border-color: #c4a76a;
  background: #f4ead3;
}
.weekly-parsha-note {
  margin: 10px 1px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.weekly-parsha-note strong {
  color: #876823;
}
.parsha-book-list {
  display: grid;
  gap: 4px;
  margin-top: 9px;
}
.parsha-book {
  border-bottom: 1px solid #eee7db;
}
.parsha-book summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 7px 5px;
  border-radius: 6px;
  cursor: pointer;
  list-style: none;
  color: #20364d;
  font-size: 0.89rem;
  font-weight: 600;
}
.parsha-book summary::-webkit-details-marker {
  display: none;
}
.parsha-book summary .parsha-count {
  margin-inline-start: auto;
}
.parsha-book summary .ui-chevron {
  width: 0.4rem;
  height: 0.4rem;
  margin-inline: 2px;
}
.parsha-book[open] summary .ui-chevron {
  transform: translateY(15%) rotate(225deg);
}
.parsha-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 8px;
  padding: 0 0 9px;
}
.parsha-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 38px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #27374e;
  font: inherit;
  font-size: 0.81rem;
  text-align: start;
  cursor: pointer;
}
.parsha-option.selected {
  border-color: #d9c89f;
  background: #f7efdd;
}
.parsha-option .parsha-count {
  margin-inline-start: auto;
}
.parsha-count {
  min-width: 23px;
  color: #7b6b4b;
  font-size: 0.77rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.weekly-indicator {
  color: #8c6b25;
  font-size: 0.65rem;
  white-space: nowrap;
}
.parsha-browser-panel footer {
  padding-top: 11px;
  text-align: end;
}
.parsha-browser-panel footer button,
.parsha-browser-state button {
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: #78602c;
  font: inherit;
  font-size: 0.78rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.parsha-browser-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 10px;
  color: var(--text-secondary);
  font-size: 0.84rem;
}
button:hover,
summary:hover {
  background-color: #f5eee0;
}
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
@media (max-width: 560px) {
  .parsha-browser-trigger {
    min-height: 44px;
  }
  .selected-parsha {
    max-width: 120px;
  }
  .parsha-browser-panel {
    position: fixed;
    top: auto;
    bottom: 16px;
    inset-inline-start: 16px;
    width: calc(100vw - 32px);
    padding: 12px;
    max-height: 65dvh;
  }
  .parsha-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
  }
  .parsha-option {
    min-height: 44px;
    padding-inline: 7px;
  }
  .all-parshiot,
  .parsha-book summary,
  .parsha-browser-panel footer button {
    min-height: 44px;
  }
  .parsha-browser-close {
    width: 44px;
    height: 44px;
  }
}
</style>
