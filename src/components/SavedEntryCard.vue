<template>
  <article
    class="entry-card"
    :class="{
      'match-row': relationship,
      'is-focused': focused,
      'menu-active': menuOpen,
    }"
    :data-entry-key="entryKey"
    :data-entry-id="entry.id"
    :data-match-key="relationship ? entryKey : undefined"
    :data-parent-entry-id="relationship ? entry.parentId : undefined"
    tabindex="-1"
  >
    <template v-if="relationship">
      <span class="original-expression" dir="auto">{{
        entry.parentOriginalText
      }}</span>
      <span class="relationship-arrow" aria-label="מתאים ל־">←</span>
      <span
        v-if="entry.gematriaValue != null"
        class="gematria-number"
        :aria-label="`גימטריה ${entry.gematriaValue}`"
        dir="ltr"
        >{{ entry.gematriaValue }}</span
      >
      <span v-else class="gematria-spacer" aria-hidden="true"></span>
      <span class="matching-expression" dir="rtl">{{
        entry.originalText
      }}</span>
    </template>
    <template v-else>
      <span class="entry-text" dir="auto">{{ entry.original_text }}</span>
      <span
        class="gematria-number"
        :aria-label="`גימטריה ${entry.full_gematria}`"
        dir="ltr"
        >{{ entry.full_gematria }}</span
      >
    </template>
    <button
      ref="menuButton"
      class="menu-btn"
      type="button"
      :aria-label="`פעולות עבור ${relationship ? entry.originalText : entry.original_text}`"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :aria-controls="menuOpen ? menuId : undefined"
      @click="toggleMenu"
      @keydown.down.prevent="openMenu()"
      @keydown.up.prevent="openMenu(true)"
    >
      <span aria-hidden="true">•••</span>
    </button>
    <Teleport to="body">
      <div
        v-if="menuOpen"
        :id="menuId"
        ref="menu"
        class="saved-actions-menu"
        role="menu"
        aria-label="פעולות בשמורים"
        dir="rtl"
        :style="menuStyle"
        @keydown="onMenuKeydown"
      >
        <button
          v-if="hasSource"
          type="button"
          role="menuitem"
          @click="choose('open-source')"
        >
          <span class="mdi mdi-book-open-variant" aria-hidden="true"></span
          >למקור
        </button>
        <button type="button" role="menuitem" @click="choose('details')">
          <span class="mdi mdi-format-list-bulleted" aria-hidden="true"></span
          >פירוט מילים
        </button>
        <button
          v-if="!relationship"
          type="button"
          role="menuitem"
          @click="choose('copy')"
        >
          <span class="mdi mdi-content-copy" aria-hidden="true"></span>העתק
        </button>
        <button
          type="button"
          role="menuitem"
          class="danger-action"
          @click="choose('delete')"
        >
          <span class="mdi mdi-trash-can-outline" aria-hidden="true"></span>הסר
          משמורים
        </button>
      </div>
    </Teleport>
  </article>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { tefillotContextOf, tanachContextOf } from "@/utils/tefillotContext.js";
const props = defineProps({
  entry: { type: Object, required: true },
  relationship: Boolean,
  menuOpen: Boolean,
  focused: Boolean,
});
const emit = defineEmits([
  "toggle-menu",
  "details",
  "open-source",
  "copy",
  "delete",
]);
const entryKey = computed(() =>
  props.relationship
    ? props.entry.key
    : `${props.entry.sourceType || props.entry.source_type || "manual"}:${props.entry.id}`,
);
const menuId = computed(
  () =>
    `saved-actions-${props.relationship ? "match" : "entry"}-${entryKey.value.replace(/[^a-z0-9-]/gi, "-")}`,
);
const hasSource = computed(
  () =>
    props.relationship ||
    tefillotContextOf(props.entry) ||
    props.entry.tanach_book_slug ||
    tanachContextOf(props.entry),
);
const menuButton = ref(null);
const menu = ref(null);
const menuStyle = ref({});
let focusLast = false;
function toggleMenu() {
  emit("toggle-menu", props.menuOpen ? null : entryKey.value);
}
function openMenu(last = false) {
  focusLast = last;
  if (!props.menuOpen) emit("toggle-menu", entryKey.value);
  else focusItem(last ? -1 : 0);
}
function closeMenu(restore = false) {
  emit("toggle-menu", null);
  if (restore) menuButton.value?.focus();
}
function choose(action) {
  closeMenu(true);
  emit(action, props.entry);
}
function focusItem(index) {
  const items = menu.value?.querySelectorAll('[role="menuitem"]');
  if (items?.length)
    items[(index + items.length) % items.length].focus({ preventScroll: true });
}
function positionMenu() {
  if (!menuButton.value || !menu.value) return;
  const trigger = menuButton.value.getBoundingClientRect();
  const rect = menu.value.getBoundingClientRect();
  const left = Math.max(
    12,
    Math.min(trigger.left, window.innerWidth - rect.width - 12),
  );
  const below = trigger.bottom + 9;
  const top =
    below + rect.height <= window.innerHeight - 12
      ? below
      : Math.max(12, trigger.top - rect.height - 9);
  menuStyle.value = { left: `${left}px`, top: `${top}px` };
}
function onOutside(event) {
  if (
    !menu.value?.contains(event.target) &&
    !menuButton.value?.contains(event.target)
  )
    closeMenu();
}
function onFocusOut(event) {
  if (!menu.value?.contains(event.target) && event.target !== menuButton.value)
    closeMenu();
}
function onMenuKeydown(event) {
  const index = [...menu.value.querySelectorAll('[role="menuitem"]')].indexOf(
    document.activeElement,
  );
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusItem(index + (event.key === "ArrowDown" ? 1 : -1));
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    focusItem(event.key === "Home" ? 0 : -1);
  } else if (event.key === "Tab") closeMenu(true);
}
function removeListeners() {
  document.removeEventListener("pointerdown", onOutside);
  document.removeEventListener("focusin", onFocusOut);
  window.removeEventListener("resize", positionMenu);
  window.removeEventListener("scroll", positionMenu, true);
}
watch(
  () => props.menuOpen,
  async (open) => {
    removeListeners();
    if (!open) return;
    await nextTick();
    if (!props.menuOpen || !menu.value || !menuButton.value) return;
    positionMenu();
    await nextTick();
    if (!props.menuOpen || !menu.value || !menuButton.value) return;
    focusItem(focusLast ? -1 : 0);
    focusLast = false;
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("focusin", onFocusOut);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
  },
);
onBeforeUnmount(removeListeners);
</script>

<style scoped>
.entry-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 44px;
  align-items: center;
  gap: 24px;
  min-width: 0;
  min-height: 88px;
  padding: 18px 20px;
  border: 1px solid #ebe6de;
  border-radius: 17px;
  background: #fffefd;
  box-shadow: 0 2px 3px #1a274405;
}
.entry-card.match-row {
  grid-template-columns: minmax(100px, 1fr) 24px 78px minmax(0, 2.8fr) 44px;
}
.entry-card.is-focused,
.entry-card.menu-active {
  border-color: #bd923b;
  background: #fffcf5;
}
.entry-card:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}
.original-expression {
  justify-self: center;
  min-width: 0;
  max-width: min(100%, 180px);
  width: 100%;
  border-radius: 14px;
  background: #f9f3e9;
  padding: 8px 12px;
  text-align: center;
  font-size: 1.35rem;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.relationship-arrow {
  color: var(--navy);
  font-size: 1.5rem;
  text-align: center;
}
.gematria-number {
  justify-self: center;
  min-width: 68px;
  max-width: 100%;
  padding: 4px 12px;
  border-radius: 99px;
  background: #fcf0d9;
  color: #72541a;
  text-align: center;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.matching-expression,
.entry-text {
  min-width: 0;
  color: #17243b;
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1.85;
  overflow-wrap: anywhere;
}
.menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: #fff;
  color: var(--navy);
  border: 1px solid #eee8df;
  border-radius: 12px;
  box-shadow: 0 2px 3px #1a274410;
  cursor: pointer;
  font-size: 0.9rem;
  letter-spacing: 2px;
}
.menu-btn:hover,
.menu-btn[aria-expanded="true"] {
  background: var(--gold-light);
  border-color: #e7d9bd;
}
.menu-btn:focus-visible,
.saved-actions-menu button:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.saved-actions-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 200;
  width: 224px;
  max-width: calc(100vw - 24px);
  padding: 8px;
  border: 1px solid #ece5da;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 26px #1a274422;
  font-family: "Source Sans Pro", Arial, sans-serif;
}
.saved-actions-menu button {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 46px;
  padding: 9px 12px;
  background: none;
  border: 0;
  border-radius: 8px;
  color: var(--navy);
  cursor: pointer;
  text-align: right;
  font: inherit;
  font-size: 1rem;
}
.saved-actions-menu button .mdi {
  font-size: 1.3rem;
}
.saved-actions-menu button:hover,
.saved-actions-menu button:focus {
  background: #f8f3e9;
}
.saved-actions-menu .danger-action {
  color: #b72b30;
  margin-top: 5px;
  border-top: 1px solid #eee5d6;
  border-radius: 0 0 8px 8px;
  padding-top: 13px;
}
@media (max-width: 700px) {
  .entry-card {
    gap: 12px;
    padding: 15px 12px;
    border-radius: 14px;
  }
  .entry-card.match-row {
    grid-template-columns: minmax(0, 1fr) 22px minmax(56px, auto) 40px;
    gap: 10px;
  }
  .original-expression {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
    width: auto;
    font-size: 1.05rem;
    padding: 4px 11px;
  }
  .relationship-arrow {
    grid-column: 2;
    grid-row: 1;
    font-size: 1.2rem;
  }
  .match-row .gematria-number,
  .gematria-spacer {
    grid-column: 3;
    grid-row: 1;
  }
  .gematria-number {
    min-width: 54px;
    font-size: 1rem;
    padding: 3px 9px;
  }
  .matching-expression {
    grid-column: 1 / 4;
    grid-row: 2;
    font-size: 1.16rem;
    line-height: 1.95;
  }
  .match-row .menu-btn {
    grid-column: 4;
    grid-row: 1 / 3;
    align-self: center;
  }
  .menu-btn {
    width: 40px;
    height: 44px;
  }
  .entry-text {
    font-size: 1.15rem;
  }
}
</style>
