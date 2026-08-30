<template>
  <div ref="root" class="scope-select">
    <span class="scope-select__label">{{ label }}</span>
    <button
      ref="trigger"
      type="button"
      role="combobox"
      class="scope-select__trigger"
      :class="{ 'scope-select__trigger--open': open }"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="label"
      :aria-controls="listboxId"
      :aria-activedescendant="open && activeIndex >= 0 ? optionId(flatOptions[activeIndex]) : undefined"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="scope-select__value">{{ selectedOption?.label || emptyLabel }}</span>
      <span class="ui-chevron ui-chevron--down scope-select__chevron" aria-hidden="true"></span>
    </button>

    <div
      v-if="open"
      :id="listboxId"
      class="scope-select__menu"
      role="listbox"
      :aria-label="label"
    >
      <button
        v-if="emptyLabel"
        :id="optionId(emptyOption)"
        type="button"
        class="scope-select__option"
        :class="{ 'scope-select__option--selected': !modelValue }"
        role="option"
        :aria-selected="!modelValue"
        @mouseenter="activeIndex = 0"
        @click="selectOption(emptyOption)"
      >
        <span>{{ emptyLabel }}</span>
        <span v-if="!modelValue" class="mdi mdi-check" aria-hidden="true"></span>
      </button>
      <template v-for="group in groups" :key="group.label">
        <div v-if="group.label" class="scope-select__group-label" role="presentation">{{ group.label }}</div>
        <button
          v-for="option in group.options"
          :id="optionId(option)"
          :key="String(option.value)"
          type="button"
          class="scope-select__option"
          :class="{ 'scope-select__option--selected': isSelected(option) }"
          role="option"
          :aria-selected="isSelected(option)"
          @mouseenter="activeIndex = indexOf(option)"
          @click="selectOption(option)"
        >
          <span>{{ option.label }}</span>
          <span v-if="isSelected(option)" class="mdi mdi-check" aria-hidden="true"></span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

let sequence = 0;
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  groups: { type: Array, default: () => [] },
  emptyLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const root = ref(null);
const trigger = ref(null);
const open = ref(false);
const activeIndex = ref(-1);
const listboxId = `tanach-scope-listbox-${++sequence}`;
const emptyOption = computed(() => ({ value: '', label: props.emptyLabel }));
const flatOptions = computed(() => [
  ...(props.emptyLabel ? [emptyOption.value] : []),
  ...props.groups.flatMap(group => group.options || []),
]);
const selectedOption = computed(() => flatOptions.value.find(option => isSelected(option)));

function isSelected(option) {
  return String(option?.value ?? '') === String(props.modelValue ?? '');
}

function indexOf(option) {
  return flatOptions.value.findIndex(item => String(item.value) === String(option.value));
}

function optionId(option) {
  const index = indexOf(option);
  return index >= 0 ? `${listboxId}-option-${index}` : undefined;
}

function syncActiveToSelection(fallback = 0) {
  const selectedIndex = flatOptions.value.findIndex(option => isSelected(option));
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : Math.min(fallback, flatOptions.value.length - 1);
}

async function openMenu() {
  if (props.disabled || !flatOptions.value.length) return;
  open.value = true;
  syncActiveToSelection();
  await nextTick();
  document.getElementById(optionId(flatOptions.value[activeIndex.value]))?.scrollIntoView({ block: 'nearest' });
}

function closeMenu({ restoreFocus = false } = {}) {
  open.value = false;
  activeIndex.value = -1;
  if (restoreFocus) nextTick(() => trigger.value?.focus());
}

function toggle() {
  if (open.value) closeMenu();
  else openMenu();
}

function selectOption(option) {
  emit('update:modelValue', option.value);
  closeMenu({ restoreFocus: true });
}

function moveActive(amount) {
  if (!flatOptions.value.length) return;
  if (!open.value) {
    openMenu();
    return;
  }
  const length = flatOptions.value.length;
  activeIndex.value = (activeIndex.value + amount + length) % length;
  nextTick(() => document.getElementById(optionId(flatOptions.value[activeIndex.value]))?.scrollIntoView({ block: 'nearest' }));
}

function onTriggerKeydown(event) {
  if (props.disabled) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActive(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActive(-1);
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    if (!open.value) openMenu();
    activeIndex.value = event.key === 'Home' ? 0 : flatOptions.value.length - 1;
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (!open.value) openMenu();
    else if (flatOptions.value[activeIndex.value]) selectOption(flatOptions.value[activeIndex.value]);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu({ restoreFocus: true });
  } else if (event.key === 'Tab') {
    closeMenu();
  }
}

function onDocumentPointerDown(event) {
  if (open.value && root.value && !root.value.contains(event.target)) closeMenu();
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));
</script>

<style scoped>
.scope-select { position: relative; display: grid; min-width: 0; gap: 1px; padding: 7px 12px 6px; border: 1px solid #dcd2bf; border-radius: 10px; background: #fffdf9; box-shadow: 0 2px 6px rgba(26,39,68,.025); transition: border-color .18s ease, box-shadow .18s ease; }
.scope-select:focus-within { z-index: 3; border-color: #bf9741; box-shadow: 0 0 0 3px rgba(192,152,64,.12), 0 2px 6px rgba(26,39,68,.025); }
.scope-select__label { color: #98752a; font-size: .64rem; font-weight: 800; line-height: 1.1; }
.scope-select__trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; min-width: 0; min-height: 22px; padding: 0; border: 0; background: transparent; color: var(--navy, #1a2744); font: inherit; font-size: .84rem; font-weight: 700; line-height: 1.25; text-align: right; cursor: pointer; }
.scope-select__trigger:disabled { color: #8c867c; cursor: wait; }
.scope-select__value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scope-select__chevron { align-self: center; width: 8px; height: 8px; margin-inline-start: 9px; color: #9a772d; transform: rotate(45deg); transition: transform .18s ease; }
.scope-select__trigger--open .scope-select__chevron { transform: rotate(225deg); }
.scope-select__menu { position: absolute; z-index: 20; top: calc(100% + 7px); right: 0; left: 0; max-height: min(360px, calc(100vh - 32px)); overflow-y: auto; padding: 6px; border: 1px solid #dfd1b2; border-radius: 11px; background: #fffdf9; box-shadow: 0 14px 30px rgba(26,39,68,.16); scrollbar-width: thin; scrollbar-color: #cfb46f transparent; }
.scope-select__menu::-webkit-scrollbar { width: 7px; }
.scope-select__menu::-webkit-scrollbar-thumb { border: 2px solid #fffdf9; border-radius: 8px; background: #cfb46f; }
.scope-select__group-label { margin: 6px 8px 3px; color: #9b7a31; font-size: .63rem; font-weight: 800; letter-spacing: .05em; }
.scope-select__group-label:not(:first-child) { padding-top: 6px; border-top: 1px solid #eee4d1; }
.scope-select__option { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 35px; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: #24324f; font: inherit; font-size: .8rem; text-align: right; cursor: pointer; }
.scope-select__option:hover, .scope-select__option:focus-visible { outline: 0; background: #fbf1d9; color: #735615; }
.scope-select__option--selected { background: #f2e2b8; color: #624a13; font-weight: 800; }
.scope-select__option .mdi { color: #99742a; font-size: .96rem; }
</style>