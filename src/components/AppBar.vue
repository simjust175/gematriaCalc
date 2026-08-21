<template>
  <header class="app-header">
    <div class="header-inner">
      <!-- Logo -->
      <div class="logo" @click="$emit('navigate', 'calculator')" title="מחשבון">
        <span class="logo-main">גימטריה</span>
        <span class="logo-sub">מחשבון</span>
      </div>

      <!-- Nav -->
      <nav class="header-nav">
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'library' }"
          @click="$emit('navigate', 'library')"
        >
          <span class="mdi mdi-bookshelf nav-icon"></span>
          שמורים
        </button>
        <button
          class="nav-btn"
          :class="{ active: currentPage === 'calculator' }"
          @click="$emit('navigate', 'calculator')"
        >
          <span class="mdi mdi-calculator-variant nav-icon"></span>
          מחשבון
        </button>
        <button class="nav-btn logout-btn" @click="$emit('logout')" title="יציאה">
          <span class="mdi mdi-logout nav-icon"></span>
        </button>
      </nav>
    </div>
  </header>
</template>

<script setup>
defineProps({ currentPage: { type: String, default: 'calculator' } });
defineEmits(['navigate', 'logout']);
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
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
  height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  direction: rtl;
}

.logo {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
  user-select: none;
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

@media (max-width: 480px) {
  .logo-sub { display: none; }
  .nav-btn { padding: 6px 10px; font-size: 0.82rem; }
}
</style>
