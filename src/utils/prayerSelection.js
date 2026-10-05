import { computeAll, normalize } from '../composables/useGematria.js';

const EXCLUDED = 'button,a,input,textarea,select,[contenteditable],[aria-hidden="true"],[data-selection-exclude]';

/** Native DOM ranges, unlike Tanach's custom letter cursor, retain partial words and inline marks. */
export function readPrayerSelection(root, selection) {
  if (!root?.isConnected || !selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const parent = node => node.nodeType === 1 ? node : node.parentElement;
  for (const node of [range.startContainer, range.endContainer]) {
    if (!parent(node)?.closest('[data-prayer-unit]') || parent(node).closest(EXCLUDED)) return null;
  }
  // Even when both endpoints are valid, no intervening chrome may be included.
  for (const element of root.querySelectorAll(EXCLUDED)) {
    if (range.intersectsNode(element)) return null;
  }
  const text = selection.toString();
  if (!normalize(text)) return null;
  return { text, range: range.cloneRange() };
}

export function calculatePrayerSelection(text) {
  // Do not accept direct numeric inputs here: only prayer Hebrew is eligible.
  return typeof text === 'string' && normalize(text) ? computeAll(text) : null;
}

/** Client rects and visual-viewport coordinates support RTL lines, zoom and mobile browser chrome. */
export function positionSelectionPopover(rectangles, size, viewport, touch = false) {
  const margin = 12;
  const gap = touch ? 32 : 10;
  const leftEdge = viewport.left || 0;
  const topEdge = viewport.top || 0;
  const rightEdge = leftEdge + viewport.width;
  const bottomEdge = topEdge + viewport.height;
  const visible = [...rectangles].filter(rect => rect.width > 0 && rect.height > 0
    && rect.bottom > topEdge && rect.top < bottomEdge
    && rect.right > leftEdge && rect.left < rightEdge);
  if (!visible.length) return null;
  const first = visible[0];
  const last = visible.at(-1);
  const above = first.top - topEdge - margin;
  const below = bottomEdge - last.bottom - margin;
  const height = Math.min(size.height, viewport.height - margin * 2);
  const width = Math.min(size.width, viewport.width - margin * 2);
  const useBelow = touch && below >= height + gap
    ? true : above >= height + gap ? false : below >= height + gap ? true : below > above;
  const anchor = useBelow ? last : first;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  return {
    left: clamp((anchor.left + anchor.right - width) / 2, leftEdge + margin, rightEdge - width - margin),
    top: clamp(useBelow ? anchor.bottom + gap : anchor.top - height - gap,
      topEdge + margin, bottomEdge - height - margin),
  };
}
