<template>
  <section class="base-words-page" dir="rtl">
    <header class="page-head">
      <div><span class="eyebrow">רשימה אישית</span><h1>מילות יסוד</h1><p>מילים וביטויים קבועים לבדיקת כניסות שלמות</p></div>
      <button class="gold-button" @click="openCreate">הוסף מילת יסוד</button>
    </header>
    <div v-if="loading && !items.length" class="quiet-state">טוען את הרשימה…</div>
    <div v-else-if="error" class="quiet-state error">{{ error }} <button @click="load">נסה שוב</button></div>
    <div v-else-if="!items.length" class="quiet-state">הרשימה שלך עדיין ריקה</div>
    <div v-else class="words-list">
      <article v-for="item in items" :key="item.id" class="word-row">
        <div><strong>{{ item.originalText }}</strong><span>גימטריה מלאה · {{ item.fullGematria }}</span></div>
        <div class="row-actions"><button :aria-label="`ערוך ${item.originalText}`" @click="openEdit(item)">עריכה</button><button class="danger" :aria-label="`מחק ${item.originalText}`" @click="confirmDelete(item)">מחיקה</button></div>
      </article>
    </div>
    <div v-if="modal" class="modal-backdrop" @click.self="closeModal">
      <section ref="editDialogRef" class="modal" role="dialog" aria-modal="true" aria-labelledby="base-word-title" @keydown.tab="trapFocus($event, editDialogRef)">
        <h2 id="base-word-title">{{ editing ? 'עריכת מילת יסוד' : 'מילת יסוד חדשה' }}</h2>
        <label for="base-word-input">מילה או ביטוי</label>
        <input id="base-word-input" ref="inputRef" v-model="draft" @keydown="onHebrewKeydown" @keydown.enter="submit" />
        <p class="preview">גימטריה: <b>{{ preview }}</b></p><p v-if="feedback" class="feedback">{{ feedback }}</p>
        <footer><button class="gold-button" :disabled="busy || !draft.trim()" @click="submit">{{ editing ? 'שמור' : 'הוסף' }}</button><button class="text-button" @click="closeModal">ביטול</button></footer>
      </section>
    </div>
    <div v-if="deleting" class="modal-backdrop" @click.self="closeDelete">
      <section ref="deleteDialogRef" class="modal confirm" role="alertdialog" aria-modal="true" aria-labelledby="base-word-delete-title" @keydown.tab="trapFocus($event, deleteDialogRef)">
        <h2 id="base-word-delete-title">למחוק את מילת היסוד הזו?</h2>
        <p>{{ deleting.originalText }}</p>
        <footer><button ref="deleteConfirmRef" class="danger-button" @click="removeConfirmed">מחיקה</button><button class="text-button" @click="closeDelete">ביטול</button></footer>
      </section>
    </div>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useBaseWords } from '@/composables/useBaseWords.js';
import { useAutomaticHebrewKeyboard } from '@/composables/useAutomaticHebrewKeyboard.js';
const { items, loading, error, load, save, update, remove, preview: calculate } = useBaseWords();
const { onHebrewKeydown } = useAutomaticHebrewKeyboard();
const modal = ref(false), editing = ref(null), deleting = ref(null), draft = ref(''), feedback = ref(''), busy = ref(false);
const inputRef = ref(null), editDialogRef = ref(null), deleteDialogRef = ref(null), deleteConfirmRef = ref(null);
let previouslyFocused = null;
function rememberFocus() { previouslyFocused = document.activeElement; }
function restoreFocus() { const target = previouslyFocused; nextTick(() => target?.focus?.()); }
function onKeydown(event) { if (event.key === 'Escape') { if (modal.value) closeModal(); else if (deleting.value) closeDelete(); } }
document.addEventListener('keydown', onKeydown);
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
const preview = computed(() => calculate(draft.value));
function openCreate() { rememberFocus(); editing.value = null; draft.value = ''; feedback.value = ''; modal.value = true; nextTick(() => inputRef.value?.focus()); }
function openEdit(item) { rememberFocus(); editing.value = item; draft.value = item.originalText; feedback.value = ''; modal.value = true; nextTick(() => inputRef.value?.focus()); }
function closeModal() { modal.value = false; restoreFocus(); }
async function submit() { busy.value = true; feedback.value = ''; const result = editing.value ? await update(editing.value.id, draft.value) : await save(draft.value); busy.value = false; if (result.ok) closeModal(); else feedback.value = result.message; }
function confirmDelete(item) { rememberFocus(); deleting.value = item; nextTick(() => deleteConfirmRef.value?.focus()); }
function closeDelete() { deleting.value = null; restoreFocus(); }
async function removeConfirmed() { if (await remove(deleting.value.id)) closeDelete(); }
function trapFocus(event, dialog) {
  const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
</script>
<style scoped>
.base-words-page{max-width:820px;margin:auto}.page-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px}.eyebrow{color:#a07c2e;font-size:.7rem;font-weight:700;letter-spacing:.12em}.page-head h1{margin:5px 0;font-size:2rem}.page-head p{color:var(--text-secondary);font-size:.9rem}.gold-button{border:1px solid #b68e36;border-radius:8px;background:#c09840;color:#fff;padding:10px 16px;font:inherit;cursor:pointer}.gold-button:disabled{opacity:.55}.words-list{border-top:1px solid var(--border)}.word-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:15px 4px;border-bottom:1px solid var(--border)}.word-row strong{display:block;font-size:1.05rem}.word-row span{display:block;color:var(--text-secondary);font-size:.75rem;margin-top:3px}.row-actions{display:flex;gap:4px}.row-actions button,.text-button{border:0;background:transparent;color:var(--text-secondary);padding:7px;font:inherit;cursor:pointer}.row-actions button:hover,.text-button:hover{text-decoration:underline;color:var(--navy)}.danger{color:#a45e46!important}.quiet-state{text-align:center;padding:60px 10px;color:var(--text-secondary);font-size:.9rem}.quiet-state button{border:0;background:none;text-decoration:underline;color:var(--navy);font:inherit}.modal-backdrop{position:fixed;inset:0;background:rgba(26,39,68,.28);display:grid;place-items:center;padding:20px;z-index:200}.modal{width:min(100%,420px);background:#fffdf8;border:1px solid var(--border);border-radius:14px;padding:24px;box-shadow:0 18px 50px rgba(26,39,68,.18)}.modal h2{margin:0 0 18px}.modal label{display:block;font-size:.8rem;color:var(--text-secondary);margin-bottom:6px}.modal input{width:100%;border:1px solid var(--border);border-radius:8px;background:#fff;padding:11px;font:inherit;font-size:1.1rem;direction:rtl}.modal input:focus{outline:2px solid rgba(192,152,64,.4);border-color:var(--gold)}.preview{color:var(--text-secondary);font-size:.85rem}.preview b{color:var(--navy)}.feedback{color:#a45e46;font-size:.82rem}.modal footer{display:flex;align-items:center;gap:12px;margin-top:20px}.danger-button{border:1px solid #b8755c;border-radius:8px;background:#a45e46;color:#fff;padding:9px 14px;font:inherit;cursor:pointer}@media(max-width:560px){.page-head{align-items:stretch;flex-direction:column}.page-head .gold-button{align-self:flex-start}.word-row{align-items:flex-start;flex-direction:column}.row-actions{align-self:flex-start}}
</style>