<template>
  <Teleport to="body">
    <SelectionGematriaPopover
      v-if="snapshot"
      ref="popover"
      :mode="mode"
      :text="snapshot.text"
      :result="result"
      :position="position"
      :save-state="saveState"
      :save-error="saveError"
      @calculate="calculate"
      @dismiss="dismiss"
      @save="save"
    />
  </Teleport>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import SelectionGematriaPopover from './SelectionGematriaPopover.vue';
import { calculatePrayerSelection, positionSelectionPopover, readPrayerSelection } from '@/utils/prayerSelection.js';

const props = defineProps({ root: { default: null } });
const snapshot = shallowRef(null);
const result = shallowRef(null);
const mode = ref('action');
const position = ref({ left: -1000, top: -1000 });
const popover = ref(null);
const saveState = ref('idle');
const saveError = ref('');
let selectionTimer;
let pointerSelecting = false;
let touch = false;
let ignoreUntil = 0;
let observer;
let saveRequest = 0;
let saveAbort;

function dismiss() {
  clearTimeout(selectionTimer);
  snapshot.value = null;
  result.value = null;
  saveState.value = 'idle';
  saveError.value = '';
  saveRequest += 1;
  saveAbort?.abort();
}

async function readSelection() {
  if (pointerSelecting || Date.now() < ignoreUntil) return;
  const next = readPrayerSelection(props.root, window.getSelection());
  if (!next) { dismiss(); return; }
  const previous = snapshot.value;
  if (previous && previous.text === next.text
    && previous.range.startContainer === next.range.startContainer
    && previous.range.startOffset === next.range.startOffset
    && previous.range.endContainer === next.range.endContainer
    && previous.range.endOffset === next.range.endOffset) return;
  dismiss();
  snapshot.value = next;
  mode.value = 'action';
  position.value = { left: -1000, top: -1000 };
  await nextTick();
  reposition();
}

function scheduleSelection() {
  clearTimeout(selectionTimer);
  // Keep controls away while touch handles or a mouse drag are moving.
  selectionTimer = setTimeout(readSelection, touch ? 180 : 100);
}

function reposition() {
  const current = snapshot.value;
  const element = popover.value?.element;
  if (!current || !element) return;
  if (!props.root?.contains(current.range.startContainer)
    || !props.root.contains(current.range.endContainer)) { dismiss(); return; }
  const viewport = window.visualViewport;
  const next = positionSelectionPopover(current.range.getClientRects(), element.getBoundingClientRect(), {
    left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight,
  }, touch);
  if (!next) { dismiss(); return; }
  position.value = {
    ...next, viewportWidth: viewport?.width || window.innerWidth,
    viewportHeight: viewport?.height || window.innerHeight,
  };
}

async function calculate(event) {
  if (!snapshot.value) return;
  result.value = calculatePrayerSelection(snapshot.value.text);
  if (!result.value) { dismiss(); return; }
  mode.value = 'result';
  await nextTick();
  reposition();
  if (event?.detail === 0) {
    ignoreUntil = Date.now() + 300;
    popover.value?.element?.querySelector('[role="dialog"]')?.focus({ preventScroll: true });
  }
}

async function save() {
  if (!snapshot.value || !result.value || saveState.value !== 'idle') return;
  const id = ++saveRequest;
  const text = snapshot.value.text;
  saveState.value = 'loading';
  saveError.value = '';
  saveAbort = new AbortController();
  try {
    const response = await fetch('/api/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText: text }), signal: saveAbort.signal,
    });
    if (id !== saveRequest) return;
    if (response.status === 409) saveState.value = 'duplicate';
    else if (response.ok) saveState.value = 'saved';
    else throw new Error('save');
  } catch (error) {
    if (id !== saveRequest || error.name === 'AbortError') return;
    saveState.value = 'idle';
    saveError.value = 'לא ניתן לשמור כרגע. נסו שוב.';
  }
}

function onPointerDown(event) {
  if (popover.value?.element?.contains(event.target)) {
    ignoreUntil = Date.now() + 300;
    if (event.pointerType === 'mouse') event.preventDefault();
    return;
  }
  dismiss();
  ignoreUntil = 0;
  pointerSelecting = Boolean(props.root?.contains(event.target));
  touch = event.pointerType === 'touch' || event.pointerType === 'pen';
}
function onPointerUp() { pointerSelecting = false; scheduleSelection(); }
function onScroll(event) {
  if (!popover.value?.element?.contains(event.target)) dismiss();
}
function onKeydown(event) {
  if (event.key === 'Escape' && snapshot.value) {
    event.preventDefault();
    dismiss();
  }
}

watch(() => props.root, dismiss);
watch(() => popover.value?.element, element => {
  observer?.disconnect();
  if (element && 'ResizeObserver' in window) {
    observer = new ResizeObserver(reposition);
    observer.observe(element);
  }
}, { flush: 'post' });
onMounted(() => {
  document.addEventListener('selectionchange', scheduleSelection);
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', onScroll);
});
onBeforeUnmount(() => {
  dismiss();
  observer?.disconnect();
  document.removeEventListener('selectionchange', scheduleSelection);
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('pointerup', onPointerUp, true);
  document.removeEventListener('pointercancel', onPointerUp, true);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', reposition);
  window.visualViewport?.removeEventListener('resize', reposition);
  window.visualViewport?.removeEventListener('scroll', onScroll);
});
</script>
