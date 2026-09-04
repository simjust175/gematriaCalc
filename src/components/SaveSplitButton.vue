<template>
  <div ref="root" class="save-split" dir="rtl">
    <button class="save-split__main" type="button" :disabled="disabled" @click="$emit('primary')">
      <slot name="icon"></slot>{{ primaryLabel }}
    </button>
    <button ref="toggle" class="save-split__toggle" type="button" aria-label="אפשרויות שמירה" :aria-expanded="open" aria-haspopup="menu" @click="toggleMenu">⌄</button>
    <div v-if="open" ref="menu" class="save-split__menu" role="menu" @keydown.esc.prevent="closeMenu">
      <button ref="menuItem" role="menuitem" :disabled="secondaryDisabled" @click="chooseSecondary">שמור כמילת יסוד</button>
    </div>
  </div>
</template>
<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
const props = defineProps({ primaryLabel: { type: String, default: 'שמור' }, disabled: Boolean, secondaryDisabled: Boolean });
const emit = defineEmits(['primary', 'base-word']);
const root = ref(null), toggle = ref(null), menuItem = ref(null), open = ref(false);
function closeMenu() { open.value = false; }
function toggleMenu() { open.value = !open.value; if (open.value) nextTick(() => menuItem.value?.focus()); }
function chooseSecondary() { emit('base-word'); closeMenu(); toggle.value?.focus(); }
function onKeydown(event) { if (event.key === 'Escape' && open.value) { closeMenu(); toggle.value?.focus(); } }
function onPointer(event) { if (open.value && !root.value?.contains(event.target)) closeMenu(); }
document.addEventListener('keydown', onKeydown); document.addEventListener('pointerdown', onPointer);
onBeforeUnmount(() => { document.removeEventListener('keydown', onKeydown); document.removeEventListener('pointerdown', onPointer); });
</script>
<style scoped>
.save-split{position:relative;display:flex}.save-split button{font:inherit;cursor:pointer}.save-split__main,.save-split__toggle{border:1px solid #c09840;background:rgba(192,152,64,.1);color:#a07c2e;padding:5px 9px}.save-split__main{border-radius:0 8px 8px 0}.save-split__toggle{border-inline-start:0;border-radius:8px 0 0 8px;padding-inline:7px}.save-split button:hover:not(:disabled){background:#c09840;color:#fff}.save-split button:focus-visible{outline:2px solid var(--navy);outline-offset:2px}.save-split button:disabled{opacity:.6;cursor:default}.save-split__menu{position:absolute;top:calc(100% + 5px);right:0;z-index:30;min-width:160px;padding:4px;background:#fffdf8;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 20px rgba(26,39,68,.14)}.save-split__menu button{width:100%;padding:8px;border:0;background:transparent;color:var(--navy);text-align:right}.save-split__menu button:hover:not(:disabled){background:var(--gold-light);color:var(--navy)}
</style>