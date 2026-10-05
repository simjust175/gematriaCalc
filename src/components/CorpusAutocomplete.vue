<template>
  <div
    v-if="open && (suggestions.length || loading || error)"
    class="corpus-dropdown"
    dir="rtl"
  >
    <ul
      v-if="suggestions.length"
      id="calculator-corpus-suggestions"
      class="corpus-list"
      role="listbox"
      aria-label="מקורות תואמים"
    >
      <li
        v-for="(suggestion, index) in suggestions"
        :id="`corpus-suggestion-${index}`"
        :key="suggestion.id"
        :ref="element => setOptionRef(element, index)"
        class="corpus-option"
        :class="{ 'corpus-option--active': activeIndex === index }"
        role="option"
        :aria-selected="activeIndex === index"
        @pointerdown.prevent
        @pointerenter="emit('activate', index)"
        @click="emit('select', index)"
      >
        <span class="corpus-option__meta">
          <span
            class="corpus-source"
            :class="`corpus-source--${suggestion.sourceType}`"
          >{{ sourceLabel(suggestion.sourceType) }}</span>
          <span class="corpus-context">{{ suggestion.context }}</span>
        </span>
        <span class="corpus-snippet" lang="he">
          <span>{{ suggestion.snippet.before }}</span><mark>{{ suggestion.snippet.match }}</mark><span>{{ suggestion.snippet.after }}</span>
        </span>
      </li>
    </ul>
    <p v-else-if="loading" class="corpus-state" role="status">מחפש במקורות…</p>
    <p v-else-if="error" class="corpus-state corpus-state--error" role="status">{{ error }}</p>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  suggestions: { type: Array, default: () => [] },
  open: { type: Boolean, default: false },
  activeIndex: { type: Number, default: -1 },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['select', 'activate', 'dismiss']);
const optionElements = ref([]);

function setOptionRef(element, index) {
  if (element) optionElements.value[index] = element;
}

function sourceLabel(sourceType) {
  return sourceType === 'tefillot' ? 'תפילות' : 'תנ״ך';
}

watch(() => props.activeIndex, async index => {
  if (index < 0) return;
  await nextTick();
  optionElements.value[index]?.scrollIntoView?.({ block: 'nearest' });
});
</script>

<style scoped>
.corpus-dropdown {
  position: absolute;
  z-index: 30;
  inset-inline: 0;
  top: calc(100% + 5px);
  max-height: min(320px, 48vh);
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid #e3d8be;
  border-radius: 11px;
  background: #fffdf8;
  box-shadow: 0 9px 24px rgba(26, 39, 68, .14), 0 2px 5px rgba(26, 39, 68, .06);
  color: #1a2744;
  text-align: right;
  animation: corpus-enter 130ms ease-out both;
}

.corpus-list {
  display: grid;
  margin: 0;
  padding: 4px;
  list-style: none;
}

.corpus-option {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 8px 10px 9px;
  border-bottom: 1px solid #f0ebdf;
  border-radius: 7px;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.corpus-option:last-child { border-bottom-color: transparent; }
.corpus-option:hover,
.corpus-option--active { background: #f8f2e5; }

.corpus-option__meta {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.corpus-source {
  flex: 0 0 auto;
  padding: 2px 6px;
  border: 1px solid #dfd2ad;
  border-radius: 999px;
  background: #faf5e8;
  color: #80621f;
  font-size: .64rem;
  font-weight: 700;
  line-height: 1.35;
}
.corpus-source--tefillot {
  border-color: #d5dbe3;
  background: #f2f4f6;
  color: #46546c;
}
.corpus-context {
  min-width: 0;
  overflow: hidden;
  color: #817b6f;
  font-size: .68rem;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.corpus-snippet {
  display: block;
  overflow: hidden;
  color: #263450;
  font-family: "Noto Serif Hebrew", "Source Sans Pro", sans-serif;
  font-size: .9rem;
  font-weight: 550;
  line-height: 1.55;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.corpus-snippet mark {
  border-radius: 2px;
  background: #f0e2b9;
  color: #624a16;
  font-weight: 750;
}
.corpus-state {
  margin: 0;
  padding: 10px 13px;
  color: #817b6f;
  font-size: .75rem;
}
.corpus-state--error { color: #956c61; }

.corpus-option:focus-visible {
  outline: 2px solid #a17b30;
  outline-offset: -2px;
}

@keyframes corpus-enter {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .corpus-dropdown { animation: none; }
  .corpus-option { transition: none; }
}
</style>
