export const UXLC_REPRESENTATION_VERSION = 2;

function decodeXml(text) {
  return text.replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': '\'',
  }[entity]));
}

function cleanToken(inner) {
  return decodeXml(
    inner
      .replace(/<x\b[^>]*>[\s\S]*?<\/x>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
  );
}

/**
 * Resolve UXLC verse XML to the single pointed reading shown by the reader.
 *
 * UXLC represents ordinary words with <w>, unpointed ketiv with <k>, and the
 * pointed reading tradition with one or more <q> tokens. Editorial <x> payloads
 * are metadata, not Biblical text. The reader therefore keeps <w> and <q> in
 * source order while omitting <k> and <x>.
 */
export function resolveUxlcVerseText(inner = '') {
  const words = [...inner.matchAll(/<(w|q)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(match => cleanToken(match[2]))
    .filter(Boolean);

  return words.reduce((text, word) => (
    !text ? word : /[־-]$/.test(text) ? `${text}${word}` : `${text} ${word}`
  ), '');
}