<template>
  <section class="milui-panel" dir="rtl" aria-labelledby="milui-result-title">
    <div class="milui-panel__header">
      <div>
        <div id="milui-result-title" class="milui-panel__title">שם האות במילואה</div>
      </div>
      <button
        class="milui-settings-link"
        type="button"
        :disabled="settingsDisabled"
        @click="emit('open-settings')"
      >
        <span class="mdi mdi-tune-variant" aria-hidden="true"></span>
        הגדרות מילוי
      </button>
    </div>

    <div class="milui-expanded-text">{{ calculation.expandedText }}</div>

    <div class="milui-total-row">
      <div>
        <div class="milui-label">גימטריית המילוי המלא</div>
        <div class="milui-value">
          <span>{{ calculation.fullGematria }}</span>
          <span class="milui-dot">·</span>
          <span class="milui-hebrew-number">{{ calculation.fullHebrewNumber }}</span>
        </div>
      </div>
      <div class="milui-secondary-total">
        <div class="milui-label">מילוי בלבד</div>
        <div class="milui-secondary-value">
          {{ calculation.fillingOnlyGematria }}
          <span class="milui-dot">·</span>
          {{ calculation.fillingOnlyHebrewNumber }}
        </div>
      </div>
    </div>

    <details class="milui-details">
      <summary>
        <span>פירוט מילים ואותיות</span>
        <span class="milui-summary-chevron ui-chevron ui-chevron--down" aria-hidden="true"></span>
      </summary>
      <div class="milui-word-list">
        <details v-for="word in calculation.words" :key="`${word.position}-${word.word}`" class="milui-word">
          <summary>
            <span class="milui-word-name">{{ word.word }}</span>
            <span class="milui-word-total">
              {{ word.fullGematria }} · {{ word.fullHebrewNumber }}
            </span>
            <span class="milui-summary-chevron ui-chevron ui-chevron--down" aria-hidden="true"></span>
          </summary>
          <div class="milui-word-expanded">{{ word.expandedText }}</div>
          <div class="milui-letter-list">
            <div v-for="(letter, index) in word.letters" :key="index" class="milui-letter">
              <span class="milui-letter__original">{{ letter.letter }}</span>
              <span class="milui-letter__arrow">←</span>
              <span class="milui-letter__spelling">{{ letter.spelling }}</span>
              <span class="milui-letter__values">
                {{ letter.fullValue }} · {{ letter.fillingOnly }} ({{ letter.fillingOnlyValue }})
              </span>
            </div>
          </div>
        </details>
      </div>
    </details>
  </section>
</template>

<script setup>
defineProps({
  calculation: {
    type: Object,
    required: true,
  },
  settingsDisabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['open-settings']);
</script>

<style scoped>
.milui-panel {
  background: #fff;
  border: 0;
  border-radius: 0;
  overflow: hidden;
}

.milui-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px 9px;
}

.milui-label {
  color: var(--text-secondary);
  font-size: .71rem;
  font-weight: 600;
  letter-spacing: .06em;
}

.milui-panel__title {
  color: var(--navy);
  font-size: .88rem;
  font-weight: 600;
  margin-top: 2px;
}

.milui-settings-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: .78rem;
  padding: 5px;
}

.milui-settings-link:hover,
.milui-settings-link:focus-visible {
  color: var(--navy);
}

.milui-settings-link:disabled {
  cursor: default;
  opacity: .5;
}

.milui-expanded-text {
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: clamp(1.2rem, 2.2vw, 1.65rem);
  line-height: 1.8;
  padding: 2px 18px 13px;
  overflow-wrap: anywhere;
}

.milui-total-row {
  align-items: end;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 28px;
  justify-content: flex-start;
  padding: 13px 18px 14px;
}

.milui-value {
  align-items: baseline;
  color: var(--navy);
  display: flex;
  font-size: 1.45rem;
  font-weight: 700;
  gap: 6px;
  margin-top: 3px;
}

.milui-hebrew-number {
  font-size: 1.12rem;
  font-weight: 600;
}

.milui-dot {
  color: #d4c9b0;
  font-weight: 300;
}

.milui-secondary-total {
  border-inline-start: 1px solid var(--border);
  padding-inline-start: 28px;
}

.milui-secondary-value {
  color: var(--text-secondary);
  font-size: .95rem;
  font-weight: 600;
  margin-top: 6px;
}

.milui-details {
  border-top: 1px solid var(--border);
}

.milui-details > summary,
.milui-word > summary {
  cursor: pointer;
  list-style: none;
}

.milui-details > summary::-webkit-details-marker,
.milui-word > summary::-webkit-details-marker {
  display: none;
}

.milui-details > summary {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  font-size: .8rem;
  font-weight: 600;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 18px;
}

.milui-summary-chevron {
  color: var(--gold);
  height: 8px;
  width: 8px;
}

.milui-details[open] > summary .milui-summary-chevron,
.milui-word[open] > summary .milui-summary-chevron {
  transform: translateY(15%) rotate(225deg);
}

.milui-details > summary:hover,
.milui-word > summary:hover {
  background: #fafaf6;
}

.milui-word-list {
  border-top: 1px solid #f2ede4;
}

.milui-word {
  border-bottom: 1px solid #f2ede4;
}

.milui-word:last-child {
  border-bottom: 0;
}

.milui-word > summary {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 18px;
}

.milui-word-name {
  color: var(--navy);
  font-weight: 600;
}

.milui-word-total {
  color: var(--gold);
  font-size: .84rem;
  font-weight: 600;
  margin-inline-start: auto;
}

.milui-word-expanded {
  background: #fdfaf5;
  color: var(--navy);
  font-family: "Noto Serif Hebrew", "Times New Roman", serif;
  font-size: .98rem;
  line-height: 1.7;
  padding: 7px 18px;
}

.milui-letter-list {
  background: #fdfaf5;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 4px 18px 12px;
}

.milui-letter {
  align-items: baseline;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: .8rem;
  gap: 7px;
}

.milui-letter__original {
  color: var(--navy);
  font-size: 1rem;
  font-weight: 700;
  min-width: 20px;
}

.milui-letter__arrow {
  color: #d4c9b0;
}

.milui-letter__spelling {
  color: var(--navy-light);
  font-weight: 600;
}

.milui-letter__values {
  color: var(--text-secondary);
  font-size: .75rem;
}

@media (max-width: 480px) {
  .milui-panel__header {
    align-items: flex-start;
  }

  .milui-settings-link {
    font-size: .72rem;
  }

  .milui-total-row {
    align-items: flex-start;
    gap: 16px;
    justify-content: space-between;
  }

  .milui-secondary-total {
    padding-inline-start: 16px;
  }

  .milui-letter__values {
    flex-basis: 100%;
    padding-inline-start: 27px;
  }
}
</style>