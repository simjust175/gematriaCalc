<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">גימטריה</div>
      <div class="login-subtitle">מחשבון אישי</div>

      <form class="login-form" @submit.prevent="doLogin">
        <input
          class="password-manager-username"
          type="text"
          name="username"
          autocomplete="username"
          aria-hidden="true"
          tabindex="-1"
        />
        <div class="field-wrap" :class="{ 'field-wrap--error': error }">
          <input
            ref="passwordInput"
            v-model="password"
            type="password"
            class="password-field"
            placeholder="סיסמה..."
            dir="rtl"
            autocomplete="current-password"
            :disabled="loading"
          />
        </div>

        <div class="error-msg" v-if="error">{{ error }}</div>

        <button type="submit" class="login-btn" :disabled="loading || !password">
          <span v-if="loading" class="mdi mdi-loading mdi-spin"></span>
          <span v-else class="mdi mdi-lock-open-outline"></span>
          כניסה
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const emit = defineEmits(['login']);

const password = ref('');
const loading  = ref(false);
const error    = ref('');
const passwordInput = ref(null);

onMounted(() => passwordInput.value?.focus());

async function doLogin() {
  if (!password.value || loading.value) return;
  loading.value = true;
  error.value = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });

    if (res.ok) {
      emit('login');
    } else if (res.status === 401) {
      error.value = 'סיסמה שגויה';
      password.value = '';
      passwordInput.value?.focus();
    } else if (res.status === 503) {
      const response = await res.json().catch(() => ({}));
      error.value = response.error === 'app_initializing'
        ? 'האפליקציה עדיין עולה — נסה שוב בעוד רגע'
        : 'האפליקציה טרם הוגדרה — APP_PASSWORD חסר';
    } else {
      error.value = 'שגיאה בהתחברות';
    }
  } catch (e) {
    error.value = 'שגיאת רשת';
  }

  loading.value = false;
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  direction: rtl;
}

.login-card {
  background: #fff;
  border: 1.5px solid var(--border);
  border-radius: 20px;
  padding: 48px 44px;
  width: 100%;
  max-width: 380px;
  box-shadow: 0 4px 32px rgba(26, 39, 68, 0.1);
  text-align: center;
}

.login-logo {
  font-size: 2.2rem;
  font-weight: 700;
  color: var(--navy);
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: 0.82rem;
  color: var(--text-secondary);
  letter-spacing: 0.06em;
  margin-bottom: 36px;
}

.login-form { display: flex; flex-direction: column; gap: 14px; }
.password-manager-username {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.field-wrap {
  border: 1.5px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.15s;
  overflow: hidden;
}
.field-wrap:focus-within { border-color: var(--gold); }
.field-wrap--error { border-color: #D32F2F; }

.password-field {
  width: 100%;
  padding: 13px 16px;
  border: none;
  outline: none;
  font-size: 1rem;
  font-family: inherit;
  background: transparent;
  color: var(--navy);
  text-align: right;
  direction: rtl;
  letter-spacing: 0.1em;
}
.password-field::placeholder {
  letter-spacing: 0;
  color: #C8C2B4;
}

.error-msg {
  color: #D32F2F;
  font-size: 0.82rem;
  text-align: center;
}

.login-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 13px 24px;
  border-radius: 10px;
  border: none;
  background: var(--gold);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s;
  direction: rtl;
}
.login-btn:hover:not(:disabled) {
  background: #A07C2E;
  box-shadow: 0 3px 12px rgba(192,152,64,0.35);
}
.login-btn:disabled { opacity: 0.55; cursor: default; }
</style>
