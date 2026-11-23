<template>
  <button
    ref="trigger"
    class="discovery-more"
    type="button"
    aria-label="פעולות נוספות להתאמה"
    aria-haspopup="menu"
    :aria-expanded="open"
    @click="toggle"
    @keydown.down.prevent="show"
  >
    <span aria-hidden="true">•••</span>
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menu"
      class="discovery-menu"
      :style="position"
      role="menu"
      dir="rtl"
      @keydown="onMenuKeydown"
    >
      <button type="button" role="menuitem" @click="choose('open-source')">
        <span
          class="mdi mdi-book-open-page-variant-outline"
          aria-hidden="true"
        ></span
        >למקור
      </button>
      <button
        type="button"
        role="menuitem"
        :disabled="saved || saving"
        @click="choose('save-entry')"
      >
        <span class="mdi mdi-file-document-outline" aria-hidden="true"></span
        >{{
          saved ? "הטקסט כבר שמור כערך" : saving ? "שומר…" : "שמור כערך עצמאי"
        }}
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onDeactivated, ref } from "vue";
defineProps({ saved: Boolean, saving: Boolean });
const emit = defineEmits(["open-source", "save-entry"]);
const trigger = ref(null),
  menu = ref(null),
  open = ref(false),
  position = ref({});
async function show() {
  open.value = true;
  await nextTick();
  positionMenu();
  await nextTick();
  if (!open.value || !menu.value) return;
  menu.value
    ?.querySelector("button:not(:disabled)")
    ?.focus({ preventScroll: true });
}
function positionMenu() {
  if (!open.value || !trigger.value || !menu.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const rect = menu.value.getBoundingClientRect();
  const below = anchor.bottom + 7;
  const top =
    below + rect.height <= window.innerHeight - 8
      ? below
      : Math.max(8, anchor.top - rect.height - 7);
  position.value = {
    top: `${top}px`,
    left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`,
  };
}
function close(restore = false) {
  open.value = false;
  if (restore) trigger.value?.focus({ preventScroll: true });
}
function toggle() {
  open.value ? close(true) : show();
}
function choose(action) {
  close(true);
  emit(action);
}
function onMenuKeydown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close(true);
    return;
  }
  const items = [...menu.value.querySelectorAll("button:not(:disabled)")];
  const index = items.indexOf(document.activeElement);
  let next;
  if (event.key === "ArrowDown") next = (index + 1) % items.length;
  if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = items.length - 1;
  if (next !== undefined) {
    event.preventDefault();
    items[next]?.focus({ preventScroll: true });
  }
}
function outside(event) {
  if (
    open.value &&
    !trigger.value?.contains(event.target) &&
    !menu.value?.contains(event.target)
  )
    close();
}
function dismiss() {
  close();
}
document.addEventListener("pointerdown", outside);
window.addEventListener("resize", positionMenu);
window.addEventListener("scroll", positionMenu, true);
onDeactivated(dismiss);
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", positionMenu);
  window.removeEventListener("scroll", positionMenu, true);
});
</script>

<style scoped>
.discovery-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--navy);
  background: #fff;
  cursor: pointer;
  font: inherit;
  letter-spacing: 2px;
}
.discovery-menu {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2500;
  width: 225px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 8px 25px #1a274420;
  color: var(--navy);
  font: inherit;
}
.discovery-menu button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 43px;
  padding: 8px 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  text-align: right;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
}
.discovery-menu button:hover:not(:disabled),
.discovery-menu button:focus-visible {
  background: var(--gold-light);
}
.discovery-more:focus-visible,
.discovery-menu button:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.discovery-menu button:disabled {
  color: var(--text-secondary);
  cursor: default;
}
</style>
