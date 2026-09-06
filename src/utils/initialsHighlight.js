import { normalize } from '../composables/useGematria.js';

const HEBREW_LETTER = /^[\u05D0-\u05EA]$/;
const HEBREW_MARK = /^[\u0591-\u05C7]$/;

function splitGraphemeLikeClusters(text) {
  const clusters = [];
  for (const character of String(text || '')) {
    if (HEBREW_MARK.test(character) && clusters.length) {
      clusters[clusters.length - 1] += character;
    } else {
      clusters.push(character);
    }
  }
  return clusters;
}

function firstHebrewLetter(cluster) {
  return [...cluster].find(character => HEBREW_LETTER.test(character)) || '';
}

function mapDerivedLettersToOriginalText(originalText, expectedLetters, edge) {
  const parts = String(originalText || '').split(/(\s+)/);
  const tokenMappings = [];
  const reconstructedInitials = [];

  for (const [partIndex, text] of parts.entries()) {
    if (/^\s+$/.test(text) || !text) continue;
    const clusters = splitGraphemeLikeClusters(text);
    const hebrewIndexes = clusters
      .map((cluster, index) => (firstHebrewLetter(cluster) ? index : -1))
      .filter(index => index >= 0);
    const clusterIndex = edge === 'last'
      ? hebrewIndexes[hebrewIndexes.length - 1]
      : hebrewIndexes[0];
    if (clusterIndex < 0) continue;
    reconstructedInitials.push(firstHebrewLetter(clusters[clusterIndex]));
    tokenMappings.push({ partIndex, clusterIndex, clusters });
  }

  const expected = normalize(String(expectedLetters || '')).replace(/\s+/g, '');
  if (!expected || reconstructedInitials.join('') !== expected) return null;

  const highlightedByPart = new Map(
    tokenMappings.map(mapping => [mapping.partIndex, mapping])
  );
  return parts.map((text, partIndex) => {
    const mapping = highlightedByPart.get(partIndex);
    return {
      text,
      segments: mapping
        ? mapping.clusters.map((segmentText, clusterIndex) => ({
            text: segmentText,
            derivedHighlighted: clusterIndex === mapping.clusterIndex,
          }))
        : null,
    };
  });
}

export function mapInitialsToOriginalText(originalText, expectedInitials) {
  return mapDerivedLettersToOriginalText(originalText, expectedInitials, 'first');
}

export function mapFinalsToOriginalText(originalText, expectedFinals) {
  return mapDerivedLettersToOriginalText(originalText, expectedFinals, 'last');
}