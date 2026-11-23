<template>
  <button
    ref="trigger"
    type="button"
    class="weekly-save"
    :class="{ 'weekly-save--saved': baseSaved || matchSaved }"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    :aria-label="`שמור · ${reference}`"
    :aria-busy="saving || undefined"
    @click="open ? close(true) : show()"
    @keydown.down.prevent="show"
    @keydown.up.prevent="show(true)"
  >
    <span :class="['mdi', saving ? 'mdi-loading mdi-spin' : baseSaved || matchSaved ? 'mdi-check' : 'mdi-bookmark-outline']" aria-hidden="true"></span>
    {{ saving ? 'שומר…' : 'שמור' }}
    <span class="mdi mdi-chevron-down chevron" aria-hidden="true"></span>
  </button>
  <Teleport to="body">
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      class="weekly-actions-menu"
      :style="position"
      role="menu"
      :aria-label="`פעולות · ${reference}`"
      dir="rtl"
      @keydown="onKeydown"
    >
      <button type="button" role="menuitem" :disabled="baseSaved || checkingBase || saving" @click="choose('save-base')">
        <span :class="['mdi', baseSaved ? 'mdi-check' : 'mdi-key-variant']" aria-hidden="true"></span>
        {{ baseSaved ? 'נשמר כמילת יסוד' : 'שמור כמילת יסוד' }}
      </button>
      <button type="button" role="menuitem" :disabled="matchSaved || checkingMatch || saving" @click="choose('save-match')">
        <span :class="['mdi', matchSaved ? 'mdi-check' : 'mdi-bookmark-outline']" aria-hidden="true"></span>
        {{ matchSaved ? 'נשמר כהתאמה' : 'שמור כהתאמה' }}
      </button>
      <div class="menu-divider" role="separator"></div>
      <button type="button" role="menuitem" @click="choose('open-tanach')">
        <span class="mdi mdi-book-open-outline" aria-hidden="true"></span>
        פתח בתנ״ך
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { getCurrentInstance, nextTick, onBeforeUnmount, onDeactivated, ref } from 'vue';

defineProps({
  reference: { type: String, required: true },
  baseSaved: Boolean,
  matchSaved: Boolean,
  checkingBase: Boolean,
  checkingMatch: Boolean,
  saving: Boolean,
});
const emit = defineEmits(['check', 'save-base', 'save-match', 'open-tanach']);
const menuId = `weekly-actions-${getCurrentInstance().uid}`;
const trigger = ref(null), menu = ref(null), open = ref(false), position = ref({});

async function show(last = false) {
  if (open.value) return;
  open.value = true;
  emit('check');
  document.addEventListener('pointerdown', outside);
  document.addEventListener('focusin', outside);
  window.addEventListener('resize', positionMenu);
  window.addEventListener('scroll', positionMenu, true);
  await nextTick();
  positionMenu();
  const items = menu.value?.querySelectorAll('button:not(:disabled)');
  (last === true ? items?.[items.length - 1] : items?.[0])?.focus({ preventScroll: true });
}
function positionMenu() {
  if (!open.value || !trigger.value || !menu.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const rect = menu.value.getBoundingClientRect();
  const below = anchor.bottom + 6;
  position.value = {
    top: `${below + rect.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - rect.height - 6)}px`,
    left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`,
  };
}
function close(restore = false) {
  open.value = false;
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('focusin', outside);
  window.removeEventListener('resize', positionMenu);
  window.removeEventListener('scroll', positionMenu, true);
  if (restore) trigger.value?.focus({ preventScroll: true });
}
function outside(event) {
  if (!trigger.value?.contains(event.target) && !menu.value?.contains(event.target)) close();
}
function choose(action) {
  close(true);
  emit(action);
}
function onKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
  if (event.key === 'Tab') { close(true); return; }
  const items = [...menu.value.querySelectorAll('button:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  const next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
  if (next !== undefined) { event.preventDefault(); items[next]?.focus({ preventScroll: true }); }
}
onDeactivated(() => close());
onBeforeUnmount(() => close());
</script>

<style scoped>
.weekly-save {display:inline-flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0;min-height:36px;padding:6px 9px;border:1px solid #e5dccb;border-radius:8px;background:#fffdf8;color:#876a31;font:inherit;font-size:.77rem;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s;}
.weekly-save:hover,.weekly-save[aria-expanded="true"] {background:#f7f0e1;border-color:#cbb582;}
.weekly-save--saved {color:#54715d;}
.chevron {font-size:.85rem;opacity:.65;}
.weekly-actions-menu {position:fixed;top:0;left:0;z-index:2500;width:208px;max-width:calc(100vw - 16px);padding:5px;border:1px solid #e5dccb;border-radius:12px;background:#fffefa;color:#1a2744;box-shadow:0 8px 28px #1a27441c;}
.weekly-actions-menu button {display:flex;align-items:center;gap:9px;width:100%;min-height:42px;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:inherit;text-align:start;font:inherit;font-size:.8rem;cursor:pointer;}
.weekly-actions-menu .mdi {font-size:1rem;color:#a38447;}
.weekly-actions-menu button:hover:not(:disabled),.weekly-actions-menu button:focus-visible {background:#f6efdf;}
.weekly-save:focus-visible,.weekly-actions-menu button:focus-visible {outline:2px solid #ae8738;outline-offset:2px;}
.weekly-actions-menu button:disabled {color:#7b827c;cursor:default;}
.weekly-actions-menu button:disabled .mdi {color:inherit;}
.menu-divider {height:1px;background:#eee7da;margin:4px 7px;}
@media(max-width:560px) {.weekly-save{min-height:40px}.weekly-actions-menu button{min-height:44px}}
</style>
