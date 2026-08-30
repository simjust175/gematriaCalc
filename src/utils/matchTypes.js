export const MATCH_TYPE_META = Object.freeze({
  full_gematria: Object.freeze({
    label: 'גימטריה מלאה',
    badgeClass: 'match-badge--full',
  }),
  initials_text: Object.freeze({
    label: 'ראשי תיבות',
    badgeClass: 'match-badge--initials',
  }),
  initials_gematria: Object.freeze({
    label: 'גימטריית ר״ת',
    badgeClass: 'match-badge--initials-gematria',
  }),
  saved_word: Object.freeze({
    label: 'התאמה בתיבה',
    badgeClass: 'match-badge--word',
  }),
  milui_gematria: Object.freeze({
    label: 'גימטריית מילוי',
    badgeClass: 'match-badge--milui',
  }),
});

export function getMatchTypeMeta(type) {
  return MATCH_TYPE_META[type] || {
    label: type,
    badgeClass: 'match-badge--default',
  };
}