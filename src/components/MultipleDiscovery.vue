<template>
  <section class="multiple-disclosure" dir="rtl">
    <button
      class="multiple-toggle"
      type="button"
      :aria-expanded="open"
      aria-controls="multiple-discovery-panel"
      @click="emit('toggle')"
    >
      <span class="advanced-toggle__copy">
        <span class="advanced-toggle__label">כפולות</span>
        <small class="advanced-toggle__subtitle">קשרים מספריים מדויקים</small>
      </span>
      <span
        class="multiple-toggle__chevron ui-chevron"
        :class="open ? 'ui-chevron--up' : 'ui-chevron--down'"
        aria-hidden="true"
      ></span>
    </button>

    <div v-if="open" id="multiple-discovery-panel" class="multiple-panel">
      <div v-if="state.loading" class="multiple-state" role="status">
        <span class="multiple-spinner" aria-hidden="true"></span>
        בודק כפולות בערכים השמורים…
      </div>
      <div v-else-if="state.error" class="multiple-state multiple-state--error" role="alert">
        לא ניתן לטעון כפולות כרגע
      </div>
      <template v-else>
        <div v-if="!hasResults" class="multiple-state">
          לא נמצאו כפולות מדויקות בערכים השמורים
        </div>

        <section
          v-for="group in nonEmptyGroups"
          v-else
          :key="group.key"
          class="multiple-group"
        >
          <header class="multiple-group__header">
            <h3>{{ group.label }}</h3>
            <span>{{ group.entries.length }} {{ group.entries.length === 1 ? 'תוצאה' : 'תוצאות' }}</span>
          </header>

          <article
            v-for="entry in visibleEntries(group)"
            :key="`${group.key}-${entry.entryId}`"
            class="multiple-entry"
          >
            <div class="multiple-entry__phrase">{{ entry.originalText }}</div>
            <div
              v-for="relationship in entry.relationships"
              :key="relationshipKey(relationship)"
              class="multiple-relationship"
            >
              <div class="multiple-relationship__source">
                <span class="multiple-source-label">{{ relationship.sourceLabel }}</span>
                <span v-if="relationship.sourceWord" class="multiple-source-word">
                  «{{ relationship.sourceWord }}»
                </span>
                <span class="multiple-source-value">{{ relationship.sourceValue }}</span>
              </div>
              <div class="multiple-equation-row">
                <span
                  class="multiple-equation"
                  dir="ltr"
                  :aria-label="equationLabel(group, relationship)"
                >
                  {{ equation(group, relationship) }}
                </span>
                <span class="multiple-factor">
                  פי {{ toHebrewNumber(relationship.multiplier) }}
                </span>
              </div>
            </div>
          </article>

          <button
            v-if="group.entries.length > visibleCount(group)"
            type="button"
            class="multiple-show-more"
            @click="showMore(group.key)"
          >
            הצג עוד ({{ group.entries.length - visibleCount(group) }})
          </button>
        </section>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { toHebrewNumber } from '@/composables/useGematria.js';

const INITIAL_VISIBLE = 4;
const STEP = 4;

const props = defineProps({
  open: { type: Boolean, default: false },
  state: {
    type: Object,
    default: () => ({ currentValue: 0, groups: [], loading: false, error: false }),
  },
});

const emit = defineEmits(['toggle']);
const counts = ref({});

watch(() => props.state.groups, () => {
  counts.value = {};
});

const nonEmptyGroups = computed(() => (
  props.state.groups.filter(group => group.entries?.length)
));
const hasResults = computed(() => nonEmptyGroups.value.length > 0);

function visibleCount(group) {
  return counts.value[group.key] || INITIAL_VISIBLE;
}

function visibleEntries(group) {
  return group.entries.slice(0, visibleCount(group));
}

function showMore(key) {
  counts.value = {
    ...counts.value,
    [key]: (counts.value[key] || INITIAL_VISIBLE) + STEP,
  };
}

function relationshipKey(relationship) {
  return [
    relationship.sourceType,
    relationship.sourceValue,
    relationship.sourceWord || '',
    relationship.multiplier,
  ].join('|');
}

function equation(group, relationship) {
  if (group.key === 'into_current') {
    return `${relationship.sourceValue} × ${relationship.multiplier} = ${props.state.currentValue}`;
  }
  return `${props.state.currentValue} × ${relationship.multiplier} = ${relationship.sourceValue}`;
}

function equationLabel(group, relationship) {
  return group.key === 'into_current'
    ? `${relationship.sourceValue} כפול ${relationship.multiplier} שווה ${props.state.currentValue}`
    : `${props.state.currentValue} כפול ${relationship.multiplier} שווה ${relationship.sourceValue}`;
}
</script>

<style scoped>
.multiple-disclosure {
  overflow: hidden;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
}

.multiple-toggle {
  align-items: center;
  display: flex;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 9px 16px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: #fffdf8;
  color: var(--navy);
  cursor: pointer;
  font: inherit;
  text-align: right;
  transition: background .16s, color .16s;
}

.multiple-toggle:hover,
.multiple-toggle:focus-visible,
.multiple-toggle[aria-expanded="true"] {
  background: #fbf8f1;
  border-bottom-color: var(--border);
}

.multiple-toggle:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: -3px;
}

.advanced-toggle__copy {
  align-items: baseline;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  text-align: right;
}

.advanced-toggle__label {
  color: var(--navy);
  font-size: .84rem;
  font-weight: 600;
}

.advanced-toggle__subtitle {
  color: var(--text-secondary);
  font-size: .69rem;
  font-weight: 500;
}

.multiple-toggle__chevron {
  color: var(--gold);
  height: 9px;
  width: 9px;
}

.multiple-panel {
  padding: 12px;
}

.multiple-state {
  color: var(--text-secondary);
  font-size: .78rem;
  padding: 15px 8px;
  text-align: center;
}

.multiple-state--error {
  color: #a45e46;
}

.multiple-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-inline-end: 6px;
  border: 2px solid #e4d9c3;
  border-top-color: var(--gold);
  border-radius: 50%;
  vertical-align: -1px;
  animation: multiple-spin .7s linear infinite;
}

@keyframes multiple-spin {
  to { transform: rotate(360deg); }
}

.multiple-group + .multiple-group {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid #eee8dc;
}

.multiple-group__header {
  align-items: baseline;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.multiple-group__header h3 {
  margin: 0;
  color: var(--navy);
  font-size: .8rem;
  font-weight: 700;
}

.multiple-group__header span {
  color: var(--text-secondary);
  font-size: .68rem;
}

.multiple-entry {
  padding: 9px 10px;
  border: 1px solid #e8e2d7;
  border-radius: 9px;
  background: #fdfcf9;
}

.multiple-entry + .multiple-entry {
  margin-top: 7px;
}

.multiple-entry__phrase {
  overflow-wrap: anywhere;
  color: var(--navy);
  font-size: .9rem;
  font-weight: 700;
  line-height: 1.35;
}

.multiple-relationship {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid #eee8dc;
}

.multiple-relationship__source,
.multiple-equation-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 5px 8px;
}

.multiple-relationship__source {
  color: var(--text-secondary);
  font-size: .71rem;
}

.multiple-source-label {
  background: var(--gold-light);
  border: 1px solid #e8d9b8;
  border-radius: 999px;
  color: #87671f;
  font-weight: 700;
  padding: 2px 7px;
}

.multiple-source-word {
  background: var(--gold-light);
  border-radius: 4px;
  color: var(--navy);
  font-weight: 600;
  padding: 1px 4px;
}

.multiple-source-value {
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.multiple-equation-row {
  direction: ltr;
  justify-content: flex-start;
  margin-top: 4px;
  gap: 9px;
}

.multiple-equation {
  color: var(--navy);
  font-size: .9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.multiple-factor {
  color: #98732b;
  direction: rtl;
  font-size: .77rem;
  font-weight: 700;
  white-space: nowrap;
}

.multiple-show-more {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 6px;
  border: 1px dashed #d0cbbe;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: .75rem;
}

.multiple-show-more:hover,
.multiple-show-more:focus-visible {
  background: #f7f4ef;
  color: var(--navy);
}

@media (max-width: 480px) {
  .multiple-panel { padding: 11px; }
  .advanced-toggle__copy { gap: 5px; }
  .advanced-toggle__subtitle { flex-basis: 100%; }
  .multiple-equation-row { align-items: flex-start; flex-direction: column; gap: 3px; }
  .multiple-equation { white-space: normal; }
}
</style>