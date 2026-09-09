import { computed, ref } from 'vue';

const INSTALLED_KEY = 'gematria-pwa-installed';
const installed = ref(false);
const installPrompt = ref(null);

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function storedAsInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberInstalled() {
  installed.value = true;
  installPrompt.value = null;
  try {
    localStorage.setItem(INSTALLED_KEY, 'true');
  } catch {
    // Installation still succeeds when storage is unavailable.
  }
}

if (typeof window !== 'undefined') {
  installed.value = isStandalone() || storedAsInstalled();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (isStandalone()) return;
    // A fresh browser prompt is authoritative: a persisted marker may remain
    // after the user uninstalls while retaining site storage.
    if (installed.value) {
      installed.value = false;
      try {
        localStorage.removeItem(INSTALLED_KEY);
      } catch {
        // The prompt remains usable when storage is unavailable.
      }
    }
    installPrompt.value = event;
  });

  window.addEventListener('appinstalled', rememberInstalled);
}

export function usePwaInstall() {
  const canInstall = computed(() => !installed.value && !!installPrompt.value);

  async function install() {
    const prompt = installPrompt.value;
    if (!prompt || installed.value) return 'unavailable';

    await prompt.prompt();
    const choice = await prompt.userChoice;
    installPrompt.value = null;
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  }

  function downloadShortcut() {
    const shortcut = `\uFEFF[InternetShortcut]\r\nURL=${window.location.origin}/\r\n`;
    const blob = new Blob([shortcut], { type: 'application/internet-shortcut;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'גימטריה.url';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return {
    canInstall,
    downloadShortcut,
    installed,
    install,
  };
}