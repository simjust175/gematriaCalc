<template>
  <header class="app-header">
    <div class="header-inner">
      <!-- Logo -->
      <div class="logo" @click="$emit('navigate', 'calculator')" title="מחשבון">
        <img class="brand-mark" src="/images/gemariaLogo.png" alt="" aria-hidden="true">
        <span class="logo-copy">
          <span class="logo-main">גימטריה</span>
          <span class="logo-sub">מחשבון</span>
        </span>
      </div>

      <!-- Nav -->
      <nav class="header-nav">
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'tanach' }"
          @click="$emit('navigate', 'tanach')"
        >
          <span class="mdi mdi-book-open-page-variant-outline nav-icon" aria-hidden="true"></span>
          תנ״ך
        </button>
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'library' }"
          @click="$emit('navigate', 'library')"
        >
          <span class="mdi mdi-bookshelf nav-icon" aria-hidden="true"></span>
          שמורים
        </button>
        <button class="nav-btn" :class="{ active: currentPage === 'base-words' }" @click="$emit('navigate', 'base-words')">
          <KeyRound class="nav-icon" :size="16" :stroke-width="2" aria-hidden="true" />
          מילות יסוד
        </button>
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'calculator' }"
          @click="$emit('navigate', 'calculator')"
        >
          <span class="mdi mdi-calculator-variant nav-icon" aria-hidden="true"></span>
          מחשבון
        </button>
        <div ref="menuRoot" class="more-menu">
          <button
            ref="menuTrigger"
            type="button"
            class="nav-btn more-btn"
            aria-label="אפשרויות נוספות"
            :aria-expanded="menuOpen"
            @click.stop="toggleMenu"
          >
            <span class="mdi mdi-dots-vertical nav-icon" aria-hidden="true"></span>
          </button>
          <div v-if="menuOpen" class="more-menu-panel" dir="rtl">
            <button
              v-if="canInstall"
              type="button"
              class="menu-action install-action"
              @click="requestInstall"
            >
              <span class="mdi mdi-monitor-arrow-down-variant" aria-hidden="true"></span>
              <span>
                <strong>התקן במחשב</strong>
                <small>פתיחה כאפליקציה עצמאית</small>
              </span>
            </button>
            <div v-else-if="installed" class="menu-note installed-note" role="status">
              <span class="mdi mdi-check-circle-outline" aria-hidden="true"></span>
              <span>האפליקציה מותקנת במחשב</span>
            </div>
            <button
              v-else
              type="button"
              class="menu-action shortcut-action"
              @click="downloadDesktopShortcut"
            >
              <span class="mdi mdi-download-box-outline" aria-hidden="true"></span>
              <span>
                <strong>הורד קיצור דרך</strong>
                <small>יישמר בהורדות; אפשר להעביר לשולחן העבודה</small>
              </span>
            </button>
            <span class="menu-divider" aria-hidden="true"></span>
            <button type="button" class="menu-action" @click="logout">
              <span class="mdi mdi-logout" aria-hidden="true"></span>
              <strong>יציאה</strong>
            </button>
          </div>
        </div>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { KeyRound } from '@lucide/vue';
import { usePwaInstall } from '@/pwa/install.js';

defineProps({ currentPage: { type: String, default: 'calculator' } });
const emit = defineEmits(['navigate', 'logout']);
const menuOpen = ref(false);
const menuRoot = ref(null);
const menuTrigger = ref(null);
const { canInstall, downloadShortcut, installed, install } = usePwaInstall();

function toggleMenu() {
  menuOpen.value = !menuOpen.value;
}

function closeMenuOnOutsideClick(event) {
  if (!menuRoot.value?.contains(event.target)) menuOpen.value = false;
}

function closeMenuOnEscape(event) {
  if (event.key !== 'Escape' || !menuOpen.value) return;
  event.preventDefault();
  menuOpen.value = false;
  nextTick(() => menuTrigger.value?.focus());
}

async function requestInstall() {
  await install();
  menuOpen.value = false;
}

function downloadDesktopShortcut() {
  downloadShortcut();
  menuOpen.value = false;
}

function logout() {
  menuOpen.value = false;
  emit('logout');
}

onMounted(() => {
  document.addEventListener('click', closeMenuOnOutsideClick);
  document.addEventListener('keydown', closeMenuOnEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick);
  document.removeEventListener('keydown', closeMenuOnEscape);
});
</script>

<style scoped>
.app-header {
  background: #FFFFFF;
  border-bottom: 1px solid #EAE5DC;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 8px rgba(26, 39, 68, 0.06);
}

.header-inner {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  direction: rtl;
}

.logo {
  align-items: center;
  display: flex;
  gap: 9px;
  cursor: pointer;
  user-select: none;
}

.brand-mark {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: brightness(0) saturate(100%) invert(16%) sepia(18%) saturate(1360%) hue-rotate(186deg) brightness(88%) contrast(94%);
}

.logo-copy {
  align-items: baseline;
  display: flex;
  gap: 8px;
}

.logo-main {
  font-size: 1.45rem;
  font-weight: 700;
  color: #1A2744;
  letter-spacing: -0.01em;
}

.logo-sub {
  font-size: 0.7rem;
  color: #C09840;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.header-nav {
  display: flex;
  gap: 4px;
  align-items: center;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 500;
  color: #6B7A94;
  transition: all 0.15s;
  direction: rtl;
  font-family: inherit;
}

.nav-btn:hover {
  background: #F0EDE7;
  color: #1A2744;
}

.nav-btn.active {
  background: #F5EDD8;
  color: #C09840;
  font-weight: 600;
}

.nav-icon {
  font-size: 1rem;
}

.more-menu { position: relative; }
.more-btn { min-width: 34px; justify-content: center; padding-inline: 8px; }
.more-menu-panel {
  position: absolute;
  z-index: 120;
  top: calc(100% + 9px);
  inset-inline-end: 0;
  width: min(270px, calc(100vw - 20px));
  padding: 6px;
  border: 1px solid #dfd5c3;
  border-radius: 11px;
  background: #fffdf9;
  box-shadow: 0 12px 30px rgba(26, 39, 68, .14);
}
.menu-action {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #43506a;
  font: inherit;
  text-align: right;
  cursor: pointer;
}
.menu-action:hover { background: #f6f0e3; color: #1a2744; }
.menu-action > .mdi, .menu-note > .mdi { flex: 0 0 auto; color: #a57c29; font-size: 1.05rem; }
.menu-action > span:last-child { display: grid; gap: 2px; }
.menu-action strong { font-size: .79rem; font-weight: 750; }
.menu-action small { color: #8c8373; font-size: .66rem; }
.install-action { color: #765812; }
.shortcut-action { color: #765812; }
.menu-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  color: #746f66;
  font-size: .7rem;
  line-height: 1.55;
}
.installed-note { align-items: center; color: #51634a; }
.installed-note > .mdi { color: #66835c; }
.menu-divider { display: block; height: 1px; margin: 4px 7px; background: #eee7db; }

@media (max-width: 480px) {
  .logo-copy { display: none; }
  .header-inner { padding: 0 8px; }
  .brand-mark { height: 28px; width: 28px; }
  .header-nav { gap: 0; }
  .nav-btn { padding: 6px 7px; font-size: 0.76rem; }
  .more-btn { padding-inline: 5px; }
}
</style>
