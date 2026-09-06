<template>
  <div ref="root" class="save-split" dir="rtl">
    <button class="save-split__main" type="button" :disabled="disabled" @click="$emit('primary')">
      <slot name="icon"></slot>{{ primaryLabel }}
    </button>
    <button ref="toggle" class="save-split__toggle" type="button" aria-label="אפשרויות שמירה" :aria-expanded="open" aria-haspopup="menu" @click="toggleMenu"><span class="save-split__chevron" aria-hidden="true"></span></button>
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
.save-split{position:relative;display:inline-flex;max-width:100%;border:1px solid #c09840;border-radius:8px;overflow:visible}
.save-split button{font:inherit;cursor:pointer}
.save-split__main,.save-split__toggle{height:36px;border:0;background:rgba(192,152,64,.1);color:#a07c2e}
.save-split__main{min-width:0;padding:0 11px;border-radius:0 7px 7px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.save-split__toggle{width:30px;flex:0 0 30px;padding:0;border-inline-start:1px solid #c09840;border-radius:7px 0 0 7px;display:inline-flex;align-items:center;justify-content:center}
.save-split__chevron{width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg)}
.save-split button:hover:not(:disabled){background:#c09840;color:#fff}
.save-split button:focus-visible{position:relative;z-index:1;outline:2px solid var(--navy);outline-offset:-3px}
.save-split:focus-within{border-color:var(--navy)}
.save-split button:disabled{opacity:.6;cursor:default}
.save-split__menu{position:absolute;top:calc(100% + 5px);right:0;z-index:30;min-width:160px;max-width:calc(100vw - 24px);padding:3px;background:#fffdf8;border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 20px rgba(26,39,68,.14)}
.save-split__menu button{width:100%;padding:7px 9px;border:0;background:transparent;color:var(--navy);text-align:right;white-space:nowrap}
.save-split__menu button:hover:not(:disabled){background:var(--gold-light);color:var(--navy)}
@media (max-width:420px){.save-split__main{padding-inline:9px}.save-split__toggle{width:28px;flex-basis:28px}}
</style>