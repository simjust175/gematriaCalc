<template>
  <div class="match-panel" v-if="hasInput">
    <div class="matches-section">
      <div class="matches-header">
        <div>
          <div class="matches-title">התאמות שמורות</div>
          <div class="matches-context" v-if="gematria">
            התאמות לחישוב הנוכחי:
            <strong class="primary-accent">{{ gematria }} · {{ currentGematriaHebrew }}</strong>
          </div>
        </div>
      </div>

      <div v-if="isAlreadySaved" class="already-saved-badge">כבר שמור</div>

      <div v-if="error" class="matches-error" role="status">לא ניתן לטעון התאמות כרגע</div>
      <template v-else-if="matches.length > 0">
        <div
          v-for="match in visibleMatches"
          :key="match.id"
          class="match-item"
          :class="{ 'match-item--full': hasMatchType(match, 'full_gematria') }"
        >
          <div class="match-item__main">
            <div class="match-text">
              <template v-for="(part, index) in phraseParts(match)" :key="`${match.id}-part-${index}`">
                <span
                  :class="{ 'match-text__word': part.wordHighlighted }"
                >
                  <template v-if="part.segments">
                    <span
                      v-for="(segment, segmentIndex) in part.segments"
                      :key="`${match.id}-part-${index}-segment-${segmentIndex}`"
                      :class="{ 'match-text__initial': segment.derivedHighlighted }"
                    >{{ segment.text }}</span>
                  </template>
                  <template v-else>{{ part.text }}</template>
                </span>
              </template>
            </div>
            <div v-if="gematria" class="match-value" dir="ltr">{{ gematria }}</div>
          </div>

          <div class="match-item__meta">
            <div class="match-badges" aria-label="סיבות להתאמה">
              <span
                v-for="type in match.matchTypes"
                :key="type"
                class="match-badge"
                :class="getMatchTypeMeta(type).badgeClass"
              >
                {{ getMatchTypeMeta(type).label }}
              </span>
            </div>

            <div class="match-details">
              <span v-if="hasMatchType(match, 'initials_text')" class="match-detail">
                ר״ת: {{ match.initials }}
              </span>
              <span v-if="hasMatchType(match, 'initials_gematria')" class="match-detail">
                גימטריית ר״ת: {{ match.initials_gematria }}
              </span>
              <span v-if="hasMatchType(match, 'finals_text')" class="match-detail">
                ס״ת: {{ match.finals }}
              </span>
              <span v-if="hasMatchType(match, 'finals_gematria')" class="match-detail">
                גימטריית סופי תיבות: {{ match.finals_gematria }}
              </span>
              <span v-if="hasMatchType(match, 'milui_gematria')" class="match-detail">
                מילוי: {{ matchedMiluiSummary(match) }}
              </span>
            </div>
          </div>

          <div v-if="match.matched_words?.length" class="matched-word-detail">
            <span>{{ match.matched_words.length > 1 ? 'תיבות מתאימות:' : 'תיבה מתאימה:' }}</span>
            <strong>{{ matchedWordNames(match) }}</strong>
          </div>
        </div>
        <button v-if="matches.length > showCount" class="show-more" @click="showCount += 5">
          הצג עוד ({{ matches.length - showCount }})
        </button>
      </template>
      <div v-else-if="gematria" class="no-matches">אין התאמות</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { getMatchTypeMeta } from '@/utils/matchTypes.js';
import { normalize, toHebrewNumber } from '@/composables/useGematria.js';
import {
  mapFinalsToOriginalText,
  mapInitialsToOriginalText,
} from '@/utils/initialsHighlight.js';

const props = defineProps({
  matches: { type: Array, default: () => [] },
  gematria: { type: Number, default: 0 },
  isAlreadySaved: { type: Boolean, default: false },
  hasInput: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
});

const showCount = ref(5);

// Reset pagination when match set changes
watch(() => props.matches, () => { showCount.value = 5; });

const visibleMatches = computed(() => props.matches.slice(0, showCount.value));
const currentGematriaHebrew = computed(() => (
  props.gematria ? toHebrewNumber(props.gematria) : ''
));

function hasMatchType(match, type) {
  return match.matchTypes?.includes(type);
}

function phraseParts(match) {
  const matchingWords = new Set(
    (match.matched_words || []).map(word => normalize(String(word.word || ''))).filter(Boolean)
  );
  const shouldHighlightInitials = hasMatchType(match, 'initials_text')
    || hasMatchType(match, 'initials_gematria');
  const shouldHighlightFinals = hasMatchType(match, 'finals_text')
    || hasMatchType(match, 'finals_gematria');
  const mapped = shouldHighlightFinals
    ? mapFinalsToOriginalText(match.original_text, match.finals)
    : shouldHighlightInitials
    ? mapInitialsToOriginalText(match.original_text, match.initials)
    : null;
  const parts = mapped || String(match.original_text || '')
    .split(/(\s+)/)
    .map(text => ({ text, segments: null }));
  return parts.map(part => ({
    ...part,
    wordHighlighted: !/^\s+$/.test(part.text)
      && matchingWords.has(normalize(part.text)),
  }));
}

function matchedWordNames(match) {
  return [...new Set((match.matched_words || []).map(word => word.word).filter(Boolean))].join(' ו');
}

function matchedMiluiSummary(match) {
  const variants = Array.isArray(match.matched_milui_variants)
    ? match.matched_milui_variants
    : [];
  const labels = variants
    .map(variant => variant.expandedText)
    .filter(Boolean);
  if (!labels.length && match.full_milui_gematria) {
    labels.push(`ערך ${match.full_milui_gematria}`);
  }
  return [...new Set(labels)].join(' | ');
}
</script>

<style scoped>
.match-panel {
  display: flex;
  flex-direction: column;
  direction: rtl;
}

.matches-section {
  background: #fffdfa;
  border: 1px solid #e6dfd0;
  border-radius: 12px;
  padding: 13px 15px 11px;
  box-shadow: 0 2px 8px rgba(26, 39, 68, 0.035);
}

.matches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.matches-title {
  color: #1a2744;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.matches-context {
  margin-top: 3px;
  color: #77849a;
  font-size: 0.73rem;
  line-height: 1.35;
}

.primary-accent {
  color: #a27b2d;
  font-variant-numeric: tabular-nums;
}

.already-saved-badge {
  color: #71806f;
  font-size: 0.68rem;
  font-weight: 600;
  margin: -2px 0 5px;
}

.match-item {
  padding: 9px 2px 10px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 5px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #eee9df;
  transition: background 0.15s ease;
}

.match-item:last-of-type { border-bottom: 0; }

.match-item:hover,
.match-item--full:hover { background: #fcfaf5; }

.match-item__main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.match-text {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #192844;
  font-size: 0.96rem;
  font-weight: 700;
  direction: rtl;
  text-align: right;
  line-height: 1.35;
}

.match-value {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: baseline;
  color: #a27b2d;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.match-item__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px 10px;
  flex-wrap: wrap;
}

.match-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  direction: rtl;
}

.match-badge {
  display: inline-flex;
  align-items: center;
  min-height: 19px;
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.2;
  border: 1px solid transparent;
  white-space: nowrap;
}

.match-badge--full {
  color: #765b17;
  background: #f5ecd6;
  border-color: #eadbb9;
}

.match-badge--initials {
  color: #435c7d;
  background: #eaf0f6;
  border-color: #d8e2ec;
}

.match-badge--initials-gematria {
  color: #66527c;
  background: #eee9f3;
  border-color: #e0d8e9;
}

.match-badge--finals {
  color: #48677a;
  background: #e8f0f2;
  border-color: #d5e2e6;
}

.match-badge--finals-gematria {
  color: #625675;
  background: #eeeaf2;
  border-color: #ded7e5;
}

.match-badge--word, .match-badge--default {
  color: #4b695e;
  background: #eaf1ed;
  border-color: #d9e6de;
}

.match-badge--milui {
  color: #756044;
  background: #f1ece5;
  border-color: #e5ddd2;
}

.match-details {
  display: flex;
  flex-wrap: wrap;
  gap: 3px 9px;
  direction: rtl;
  color: #77849a;
  font-size: 0.69rem;
  line-height: 1.35;
}

.match-detail {
  overflow-wrap: anywhere;
}

.match-detail--full {
  color: #a27b2d;
  font-weight: 700;
}

.matched-word-detail {
  width: 100%;
  border-top: 1px solid #edf1f4;
  padding-top: 5px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  direction: rtl;
  color: #8290a2;
  font-size: 0.68rem;
  line-height: 1.35;
}

.matched-word-detail strong {
  color: #395676;
  font-weight: 700;
}

.match-text__word {
  display: inline;
  padding: 1px 4px;
  border-radius: 4px;
  background: #f5e8c5;
  color: #624a13;
}

.match-text__initial {
  display: inline-block;
  width: auto;
  min-width: 0;
  margin-inline: .02em;
  padding: .03em .14em;
  border-radius: 4px;
  background: rgba(213, 173, 79, 0.25);
  color: #192844;
  line-height: 1.08;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.show-more {
  width: 100%;
  margin-top: 7px;
  padding: 6px;
  font-size: 0.72rem;
  color: #718096;
  background: none;
  border: 1px dashed #d0cbbe;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  direction: rtl;
}

.show-more:hover { background: #f1f4f6; color: #1a2744; }

.no-matches {
  font-size: 0.78rem;
  color: #9aa5b2;
  text-align: center;
  padding: 15px 0 12px;
  direction: rtl;
}

.matches-error {
  color: #9b4a4a;
  direction: rtl;
  font-size: .76rem;
  padding: 12px 0;
  text-align: center;
}

@media (max-width: 520px) {
  .matches-section {
    padding-inline: 12px;
  }

  .match-item__main {
    align-items: flex-start;
  }

  .match-value {
    padding-top: 2px;
  }

  .match-item__meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }
}

</style>
