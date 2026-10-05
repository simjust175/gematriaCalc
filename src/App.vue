<template>
  <div id="app">
    <!-- Loading splash while checking auth -->
    <div v-if="authState === 'checking'" class="auth-loading">
      <img class="auth-loading-logo" src="/images/gemariaLogo.png" alt="" aria-hidden="true">
      <span class="mdi mdi-loading mdi-spin" style="font-size:2rem;color:#C09840;"></span>
    </div>

    <!-- Login screen -->
    <LoginScreen v-else-if="authState === 'unauthenticated'" @login="onLogin" />

    <!-- Main app -->
    <template v-else>
      <AppBar :currentPage="currentPage" @navigate="currentPage = $event" @logout="onLogout" />
      <main class="main-content">
        <GimForm v-if="currentPage === 'calculator'" @open-tanach="openTanachDiscovery" @open-tefillot="openTefillotDiscovery" />
        <SavedLibrary v-else-if="currentPage === 'library'" @open-tanach="openTanachDiscovery" />
        <BaseWords v-else-if="currentPage === 'base-words'" />
        <TanachReader
          v-else-if="currentPage === 'tanach'"
          :open-reference="pendingTanachReference"
          @reference-consumed="consumeTanachReference"
        />
        <TefillotReader
          v-else-if="currentPage === 'tefillot'"
          :open-reference="pendingTefillotReference"
          @reference-consumed="consumeTefillotReference"
        />
      </main>
    </template>
    <AppUpdateModal
      :open="appUpdates.open.value"
      :release="appUpdates.release.value"
      :updating="appUpdates.updating.value"
      :error="appUpdates.error.value"
      @update="appUpdates.update"
      @defer="appUpdates.defer"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import AppBar        from '@/components/AppBar.vue';
import GimForm       from '@/components/GimForm.vue';
import SavedLibrary  from '@/components/SavedLibrary.vue';
import TanachReader   from '@/components/TanachReader.vue';
import TefillotReader from '@/components/TefillotReader.vue';
import LoginScreen   from '@/components/LoginScreen.vue';
import BaseWords     from '@/components/BaseWords.vue';
import { resolveAuthentication } from '@/composables/useAuthentication.js';
import AppUpdateModal from '@/components/AppUpdateModal.vue';
import { useAppUpdates } from '@/composables/useAppUpdates.js';

const appUpdates = useAppUpdates();

// 'checking' | 'authenticated' | 'unauthenticated'
const authState  = ref('checking');
const currentPage = ref('calculator');
const pendingTanachReference = ref(null);
const pendingTefillotReference = ref(null);
let tefillotReferenceRequestId = 0;
let tanachReferenceRequestId = 0;

onMounted(async () => {
  authState.value = await resolveAuthentication();
});

function onLogin() {
  authState.value = 'authenticated';
}

function openTanachDiscovery(result) {
  pendingTanachReference.value = {
    bookSlug: result.bookSlug,
    chapter: result.chapter,
    verse: result.verse,
    start: result.start,
    end: result.end,
    requestId: ++tanachReferenceRequestId,
  };
  currentPage.value = 'tanach';
}

function consumeTanachReference(requestId) {
  if (pendingTanachReference.value?.requestId === requestId) {
    pendingTanachReference.value = null;
  }
}

function openTefillotDiscovery(result) {
  pendingTefillotReference.value = {
    occasionSlug: result.occasionSlug,
    serviceSlug: result.serviceSlug,
    sectionKey: result.sectionKey,
    unitId: result.unitId,
    start: result.start,
    end: result.end,
    requestId: ++tefillotReferenceRequestId,
  };
  currentPage.value = 'tefillot';
}

function consumeTefillotReference(requestId) {
  if (pendingTefillotReference.value?.requestId === requestId) {
    pendingTefillotReference.value = null;
  }
}

async function onLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  authState.value = 'unauthenticated';
  currentPage.value = 'calculator';
  pendingTanachReference.value = null;
  pendingTefillotReference.value = null;
}
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew:wght@400;600;700&family=Source+Sans+Pro:wght@300;400;600;700;900&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #F7F4EF;
  --card: #FFFFFF;
  --navy: #1A2744;
  --navy-light: #2D3F6C;
  --gold: #C09840;
  --gold-light: #F5EDD8;
  --text-primary: #1A2744;
  --text-secondary: #6B7A94;
  --border: #E6DFD0;
  --shadow: 0 2px 16px rgba(26, 39, 68, 0.08);
  --radius: 14px;
}

/* MDI spin animation */
@keyframes mdi-spin-anim {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.mdi-spin { animation: mdi-spin-anim 1s infinite linear; display: inline-block; }

/* Draw chevrons with CSS instead of relying on font glyph metrics. This keeps
   the small directional controls crisp and consistent across browsers. */
.ui-chevron {
  display: inline-block;
  width: .58rem;
  height: .58rem;
  flex: 0 0 auto;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  vertical-align: middle;
}
.ui-chevron--down { transform: translateY(-15%) rotate(45deg); }
.ui-chevron--up { transform: translateY(15%) rotate(225deg); }
.ui-chevron--right { transform: rotate(-45deg); }
.ui-chevron--left { transform: rotate(135deg); }

html, body {
  height: 100%;
  font-family: "Source Sans Pro", Arial, sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  direction: rtl;
  -webkit-font-smoothing: antialiased;
}

#app { min-height: 100vh; background: var(--bg); }

.auth-loading {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 14px;
  justify-content: center;
  min-height: 100vh;
}

.auth-loading-logo {
  height: 56px;
  object-fit: contain;
  width: 56px;
  filter: brightness(0) saturate(100%) invert(16%) sepia(18%) saturate(1360%) hue-rotate(186deg) brightness(88%) contrast(94%);
}

.main-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

@media (max-width: 640px) {
  .main-content { padding: 20px 16px 48px; }
}
</style>
