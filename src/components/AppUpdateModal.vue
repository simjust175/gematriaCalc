<template>
  <Teleport to="body">
    <Transition name="update-modal">
      <div
        v-if="open"
        class="update-backdrop"
        dir="rtl"
        @click.self.prevent
      >
        <section
          ref="dialog"
          class="update-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="update-title"
          :aria-describedby="descriptionIds"
          :aria-busy="updating"
          tabindex="-1"
        >
          <button
            v-if="!release.critical"
            class="close-button"
            type="button"
            aria-label="סגירה"
            :disabled="updating"
            @click="defer"
          >
            <X :size="18" :stroke-width="1.8" aria-hidden="true" />
          </button>

          <div class="announcement-icon" aria-hidden="true">
            <Megaphone :size="23" :stroke-width="1.65" />
          </div>

          <h2 id="update-title">עדכון חדש זמין</h2>
          <p id="update-description" class="description">
            {{ release.critical
              ? 'נדרש עדכון קצר כדי להמשיך להשתמש במחשבון.'
              : 'שיפורים חדשים מחכים לכם. עדכון קצר, ואפשר להמשיך כרגיל.' }}
          </p>

          <div v-if="release.notes?.length" class="notes-section">
            <h3>מה חדש</h3>
            <ul class="release-notes">
              <li v-for="(note, index) in release.notes" :key="`${index}-${note}`">
                <span class="note-mark" aria-hidden="true"></span>
                <span>{{ note }}</span>
              </li>
            </ul>
          </div>

          <p v-if="error" id="update-error" class="error-message" role="alert">
            {{ error }}
          </p>

          <div class="actions">
            <button
              class="update-button"
              type="button"
              :disabled="updating"
              @click="requestUpdate"
            >
              <span v-if="updating" class="loading-mark" aria-hidden="true"></span>
              <span aria-live="polite">{{ updating ? 'מעדכנים את המערכת...' : 'עדכן עכשיו' }}</span>
            </button>
            <button
              v-if="!release.critical"
              class="defer-button"
              type="button"
              :disabled="updating"
              @click="defer"
            >
              מאוחר יותר
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Megaphone, X } from '@lucide/vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  release: {
    type: Object,
    default: () => ({ version: '', notes: [], critical: false }),
  },
  updating: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['update', 'defer']);
const dialog = ref(null);
const descriptionIds = computed(() => (
  props.error ? 'update-description update-error' : 'update-description'
));

let previousFocus = null;
let previousBodyOverflow = '';
let active = false;

watch(() => props.open, async (isOpen) => {
  if (isOpen) {
    activate();
    await nextTick();
    if (props.open) focusInitialControl();
  } else {
    deactivate();
  }
});

watch(() => props.updating, async (isUpdating) => {
  if (!isUpdating || !props.open) return;
  await nextTick();
  if (dialog.value && !dialog.value.contains(document.activeElement)) dialog.value.focus();
});

onMounted(() => {
  if (props.open) {
    activate();
    nextTick(focusInitialControl);
  }
});

onBeforeUnmount(deactivate);

function activate() {
  if (active || typeof document === 'undefined') return;
  active = true;
  previousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKeydown, true);
}

function deactivate() {
  if (!active || typeof document === 'undefined') return;
  active = false;
  document.body.style.overflow = previousBodyOverflow;
  document.removeEventListener('keydown', onKeydown, true);
  if (previousFocus?.isConnected) previousFocus.focus();
  previousFocus = null;
}

function focusInitialControl() {
  const primary = dialog.value?.querySelector('.update-button');
  if (primary && !primary.disabled) primary.focus();
  else dialog.value?.focus();
}

function onKeydown(event) {
  if (!props.open || !dialog.value) return;

  if (event.key === 'Escape') {
    if (!props.release.critical && !props.updating) {
      event.preventDefault();
      event.stopPropagation();
      defer();
    }
    return;
  }

  if (event.key !== 'Tab') return;
  const focusable = [...dialog.value.querySelectorAll(
    'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter(element => !element.hasAttribute('hidden'));

  if (!focusable.length) {
    event.preventDefault();
    dialog.value.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.value.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.value.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function requestUpdate() {
  if (!props.updating) emit('update');
}

function defer() {
  if (!props.release.critical && !props.updating) emit('defer');
}
</script>

<style scoped>
.update-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(24, 34, 53, 0.38);
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
}

.update-dialog {
  position: relative;
  width: min(100%, 420px);
  max-height: min(90dvh, 720px);
  overflow-y: auto;
  padding: 35px 32px 30px;
  border: 1px solid rgba(230, 223, 208, 0.9);
  border-radius: 18px;
  background: #fffdfa;
  box-shadow: 0 18px 55px rgba(26, 39, 68, 0.2), 0 3px 12px rgba(26, 39, 68, 0.07);
  color: var(--navy, #1a2744);
  text-align: center;
  outline: none;
}

.close-button {
  position: absolute;
  top: 13px;
  left: 13px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #7b8493;
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.close-button:hover:not(:disabled) {
  background: #f2eee7;
  color: var(--navy, #1a2744);
}

.announcement-icon {
  display: grid;
  width: 58px;
  height: 58px;
  margin: 1px auto 16px;
  place-items: center;
  border: 1px solid #e4d5ae;
  border-radius: 50%;
  background: #f7f0df;
  color: #9b762b;
}

h2 {
  margin: 0;
  color: var(--navy, #1a2744);
  font-family: "Noto Serif Hebrew", serif;
  font-size: clamp(1.45rem, 5vw, 1.7rem);
  font-weight: 600;
  line-height: 1.35;
}

.description {
  max-width: 325px;
  margin: 11px auto 0;
  color: #69758a;
  font-size: 0.96rem;
  line-height: 1.65;
}

.notes-section {
  margin: 20px 0 0;
  padding: 13px 15px;
  border: 1px solid #eee8dc;
  border-radius: 11px;
  background: #fbf8f1;
  color: #556176;
  font-size: 0.88rem;
  line-height: 1.5;
  list-style: none;
  text-align: right;
}

.notes-section h3 {
  margin-bottom: 8px;
  color: #8e6d2a;
  font-size: 0.76rem;
  font-weight: 700;
}

.release-notes { display: grid; gap: 8px; list-style: none; }

.release-notes li {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.note-mark {
  flex: 0 0 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c09840;
  transform: translateY(-2px);
}

.error-message {
  margin: 15px 0 0;
  color: #9a423b;
  font-size: 0.86rem;
  line-height: 1.5;
}

.actions {
  display: grid;
  gap: 10px;
  margin-top: 25px;
}

.update-button,
.defer-button {
  display: inline-flex;
  min-height: 47px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 11px 18px;
  border-radius: 10px;
  font: inherit;
  font-size: 0.97rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.update-button {
  border: 1px solid #c7ad70;
  background: #d6be83;
  color: #1a2744;
}

.update-button:hover:not(:disabled) {
  border-color: #bfa164;
  background: #cdb377;
}

.defer-button {
  min-height: 43px;
  border: 1px solid #ded8cc;
  background: transparent;
  color: #6e7786;
  font-size: 0.91rem;
  font-weight: 600;
}

.defer-button:hover:not(:disabled) {
  border-color: #c7bdab;
  background: #f8f5ee;
  color: #46536a;
}

.update-button:focus-visible,
.defer-button:focus-visible,
.close-button:focus-visible {
  outline: 3px solid rgba(192, 152, 64, 0.38);
  outline-offset: 3px;
}

.update-button:disabled,
.defer-button:disabled,
.close-button:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.loading-mark {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 253, 250, 0.45);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: update-spin 0.85s linear infinite;
}

.update-modal-enter-active,
.update-modal-leave-active {
  transition: opacity 180ms ease;
}

.update-modal-enter-active .update-dialog,
.update-modal-leave-active .update-dialog {
  transition: transform 180ms ease, opacity 180ms ease;
}

.update-modal-enter-from,
.update-modal-leave-to {
  opacity: 0;
}

.update-modal-enter-from .update-dialog,
.update-modal-leave-to .update-dialog {
  transform: translateY(8px) scale(0.985);
  opacity: 0;
}

@keyframes update-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 520px) {
  .update-backdrop { padding: 16px; }
  .update-dialog { padding: 32px 23px 24px; border-radius: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .update-modal-enter-active,
  .update-modal-leave-active,
  .update-modal-enter-active .update-dialog,
  .update-modal-leave-active .update-dialog {
    transition-duration: 0.01ms;
  }

  .loading-mark { animation: none; }
}
</style>
