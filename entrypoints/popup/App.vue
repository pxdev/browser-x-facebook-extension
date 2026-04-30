<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { t, locale, isRTL, initLocale } from '../../utils/i18n';

// Read-only — used to compute the status dot and route Test correctly.
const apiProvider = ref('kimi');
const apiKeys = ref<Record<string, string>>({});
const customBaseUrl = ref('');
const customModel = ref('');

// Voice settings (editable here).
const tone = ref('diplomatic');
const accent = ref('neutral');
const replyLength = ref('medium');
const variations = ref(false);

// Display.
const tokensToday = ref(0);
const saved = ref(false);

const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null);
let toastTimer: number | null = null;
function showToast(message: string, type: 'success' | 'error' = 'success', ms = 2500) {
  toast.value = { message, type };
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = null; }, ms);
}

const hasApiKey = computed(() => {
  if (apiProvider.value === 'ollama') return true; // Ollama runs locally — no key needed
  return !!apiKeys.value[apiProvider.value]?.trim();
});
const customConfigOk = computed(() =>
  apiProvider.value !== 'custom' || (!!customBaseUrl.value.trim() && !!customModel.value.trim())
);
const ready = computed(() => hasApiKey.value && customConfigOk.value);

const providerLabel = computed(() => {
  const map: Record<string, string> = {
    kimi: 'Kimi',
    grok: 'Grok',
    openai: 'OpenAI',
    deepseek: 'DeepSeek',
    google: 'Google AI',
    ollama: 'Ollama',
    custom: 'Custom',
  };
  return map[apiProvider.value] || apiProvider.value;
});

const tones = computed(() => [
  { group: t('tone.group.calm'), items: [
    { value: 'diplomatic', label: t('tone.diplomatic') },
    { value: 'reconciliatory', label: t('tone.reconciliatory') },
    { value: 'empathetic', label: t('tone.empathetic') },
    { value: 'peaceful', label: t('tone.peaceful') },
    { value: 'unity', label: t('tone.unity') },
  ]},
  { group: t('tone.group.evidenceDriven'), items: [
    { value: 'factChecker', label: t('tone.factChecker') },
    { value: 'historical', label: t('tone.historical') },
    { value: 'legalistic', label: t('tone.legalistic') },
    { value: 'analytical', label: t('tone.analytical') },
  ]},
  { group: t('tone.group.identity'), items: [
    { value: 'patriotic', label: t('tone.patriotic') },
    { value: 'cultural', label: t('tone.cultural') },
    { value: 'humanitarian', label: t('tone.humanitarian') },
    { value: 'economic', label: t('tone.economic') },
  ]},
  { group: t('tone.group.sharp'), items: [
    { value: 'defiant', label: t('tone.defiant') },
    { value: 'satirical', label: t('tone.satirical') },
    { value: 'resilient', label: t('tone.resilient') },
    { value: 'bullying', label: t('tone.bullying') },
    { value: 'aggressive', label: t('tone.aggressive') },
  ]},
]);

const accents = computed(() => [
  { group: t('accent.group.english'), items: [
    { value: 'neutral', label: t('accent.neutral') },
    { value: 'american', label: t('accent.american') },
    { value: 'british', label: t('accent.british') },
    { value: 'australian', label: t('accent.australian') },
    { value: 'genz', label: t('accent.genz') },
  ]},
  { group: t('accent.group.style'), items: [
    { value: 'academic', label: t('accent.academic') },
    { value: 'corporate', label: t('accent.corporate') },
    { value: 'meme', label: t('accent.meme') },
    { value: 'poetic', label: t('accent.poetic') },
    { value: 'minimalist', label: t('accent.minimalist') },
  ]},
  { group: t('accent.group.arabicGulf'), items: [
    { value: 'saudi', label: t('accent.saudi') },
    { value: 'emirati', label: t('accent.emirati') },
    { value: 'kuwaiti', label: t('accent.kuwaiti') },
    { value: 'qatari', label: t('accent.qatari') },
    { value: 'bahraini', label: t('accent.bahraini') },
    { value: 'omani', label: t('accent.omani') },
  ]},
  { group: t('accent.group.arabicLevant'), items: [
    { value: 'iraqi', label: t('accent.iraqi') },
    { value: 'levantine', label: t('accent.levantine') },
  ]},
  { group: t('accent.group.arabicNorthAfrica'), items: [
    { value: 'egyptian', label: t('accent.egyptian') },
    { value: 'libyan', label: t('accent.libyan') },
    { value: 'algerian', label: t('accent.algerian') },
    { value: 'maghrebi', label: t('accent.maghrebi') },
  ]},
  { group: t('accent.group.other'), items: [
    { value: 'formalArabic', label: t('accent.formalArabic') },
    { value: 'ethiopian', label: t('accent.ethiopian') },
  ]},
]);

const lengths = computed(() => [
  { value: 'short', label: t('length.shortShort') },
  { value: 'medium', label: t('length.shortMedium') },
  { value: 'long', label: t('length.shortLong') },
]);

onMounted(async () => {
  await initLocale();
  const stored = await browser.storage.local.get([
    'apiProvider', 'apiKeys', 'apiKey',
    'customBaseUrl', 'customModel',
    'tone', 'accent', 'replyLength', 'variations',
    'tokensToday', 'tokensDate',
  ]);
  if (stored.apiProvider) apiProvider.value = stored.apiProvider as string;
  if (stored.apiKeys) {
    apiKeys.value = stored.apiKeys as Record<string, string>;
  } else if (stored.apiKey) {
    apiKeys.value = { [apiProvider.value]: stored.apiKey as string };
  }
  if (stored.customBaseUrl) customBaseUrl.value = stored.customBaseUrl as string;
  if (stored.customModel) customModel.value = stored.customModel as string;
  if (stored.tone) tone.value = stored.tone as string;
  if (stored.accent) accent.value = stored.accent as string;
  if (stored.replyLength) replyLength.value = stored.replyLength as string;
  if (stored.variations !== undefined) variations.value = stored.variations as boolean;
  const today = new Date().toISOString().slice(0, 10);
  if (stored.tokensDate === today && typeof stored.tokensToday === 'number') {
    tokensToday.value = stored.tokensToday;
  }
});

onUnmounted(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});

async function saveSettings() {
  await browser.storage.local.set({
    tone: tone.value,
    accent: accent.value,
    replyLength: replyLength.value,
    variations: variations.value,
  });
  saved.value = true;
  setTimeout(() => saved.value = false, 1800);
  showToast(t('common.saved'));
}

async function testConnection() {
  if (!hasApiKey.value) {
    showToast(t('test.needKeyShort'), 'error');
    return;
  }
  if (!customConfigOk.value) {
    showToast(t('test.customIncomplete'), 'error');
    return;
  }
  showToast(t('common.testing'));
  try {
    const response = await browser.runtime.sendMessage({ type: 'TEST_CONNECTION' });
    if (response?.success) {
      showToast(t('test.connected'));
    } else {
      showToast(response?.error || t('test.failedShort'), 'error', 4000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(msg, 'error', 4000);
  }
}

function openSettings() {
  if (browser.runtime?.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
  }
}
</script>

<template>
  <div class="popup" :dir="isRTL ? 'rtl' : 'ltr'">
    <header class="hdr">
      <div class="hdr-title">
        <span class="dot" :class="{ ok: ready }" :title="ready ? t('status.ready') : t('status.setupRequired')" />
        <h1>{{ t('app.popup.title') }}</h1>
      </div>
      <button class="icon-btn" @click="openSettings" :title="t('status.openSettings')" :aria-label="t('status.openSettings')">⚙</button>
    </header>

    <!-- Setup banner when not ready -->
    <div v-if="!ready" class="setup-banner">
      <div class="setup-banner-text">
        <strong>{{ hasApiKey ? t('setup.incompleteTitle', { provider: providerLabel }) : t('setup.noKeyTitle') }}</strong>
        <p>{{ hasApiKey ? t('setup.incompleteBody') : t('setup.noKeyBody', { provider: providerLabel }) }}</p>
      </div>
      <button class="btn btn-primary setup-btn" @click="openSettings">{{ t('setup.openSettings') }}</button>
    </div>

    <div v-else class="status-row">
      <span class="status-label">{{ t('status.using') }}</span>
      <span class="status-value">{{ providerLabel }}</span>
    </div>

    <!-- Voice -->
    <section class="group">
      <div class="group-hdr">{{ t('popup.voiceGroup') }}</div>
      <div class="field">
        <label for="tone">{{ t('voice.tone') }}</label>
        <select id="tone" v-model="tone">
          <optgroup v-for="g in tones" :key="g.group" :label="g.group">
            <option v-for="ti in g.items" :key="ti.value" :value="ti.value">{{ ti.label }}</option>
          </optgroup>
        </select>
      </div>
      <div class="field">
        <label for="accent">{{ t('voice.popupAccent') }}</label>
        <select id="accent" v-model="accent">
          <optgroup v-for="g in accents" :key="g.group" :label="g.group">
            <option v-for="a in g.items" :key="a.value" :value="a.value">{{ a.label }}</option>
          </optgroup>
        </select>
      </div>
      <div class="field">
        <label for="length">{{ t('voice.popupLength') }}</label>
        <select id="length" v-model="replyLength">
          <option v-for="l in lengths" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </div>
    </section>

    <!-- Quick toggle -->
    <section class="group">
      <label class="checkbox">
        <input type="checkbox" v-model="variations" />
        <span>{{ t('behavior.variations') }}</span>
      </label>
    </section>

    <p v-if="tokensToday > 0" class="usage">{{ t('popup.tokensToday', { count: tokensToday.toLocaleString() }) }}</p>

    <div class="actions">
      <button class="btn btn-primary" @click="saveSettings">{{ saved ? t('common.saved') : t('common.save') }}</button>
      <button class="btn btn-ghost" @click="testConnection" :disabled="!ready">{{ t('common.test') }}</button>
    </div>

    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toast" :class="['toast', toast.type]" :dir="isRTL ? 'rtl' : 'ltr'" role="status">
          {{ toast.message }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.popup {
  width: 340px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
  color: #0f1419;
  background: #ffffff;
  padding: 12px 14px 4px;
  box-sizing: border-box;
}
.popup[dir="rtl"] {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', system-ui, sans-serif;
}

.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid #eff3f4;
}
.hdr-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hdr h1 {
  font-size: 1rem;
  font-weight: 700;
  margin: 0;
  color: #0f1419;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f4212e;
  flex-shrink: 0;
}
.dot.ok {
  background: #00ba7c;
}
.icon-btn {
  background: #ffffff;
  border: 1px solid #cfd9de;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  font-size: 0.95rem;
  color: #536471;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.icon-btn:hover {
  background: #f7f9fa;
  color: #0f1419;
  border-color: #71767b;
}

/* Setup banner (no key) */
.setup-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 0.875rem;
  background: #fff8e6;
  border: 1px solid #ffd966;
  border-radius: 10px;
}
.setup-banner-text {
  flex: 1;
  min-width: 0;
}
.setup-banner-text strong {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  color: #5a3e00;
  margin-bottom: 2px;
}
.setup-banner-text p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: #7a5500;
}
.setup-btn {
  flex-shrink: 0;
  padding: 7px 12px;
  font-size: 0.78rem;
}

/* Provider status row (when ready) */
.status-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 0.625rem;
  padding: 0 2px;
}
.status-label {
  font-size: 0.72rem;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 700;
}
.status-value {
  font-size: 0.78rem;
  color: #0f1419;
  font-weight: 600;
}

.group {
  margin-bottom: 0.875rem;
}
.group-hdr {
  font-size: 0.7rem;
  font-weight: 700;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-inline-start: 2px;
}

.field {
  margin-bottom: 0.625rem;
}
.field:last-child {
  margin-bottom: 0;
}
label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 5px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 9px;
  text-transform: none;
  font-size: 0.85rem;
  font-weight: 500;
  color: #0f1419;
  cursor: pointer;
  letter-spacing: 0;
  margin-bottom: 0;
  padding: 4px 0;
}
.checkbox input {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: #1d9bf0;
}

select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cfd9de;
  border-radius: 8px;
  font-size: 0.86rem;
  font-family: inherit;
  background: #ffffff;
  color: #0f1419;
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
select:hover {
  border-color: #71767b;
}
select:focus {
  outline: none;
  border-color: #1d9bf0;
  box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.15);
}

.usage {
  font-size: 0.72rem;
  color: #536471;
  text-align: end;
  margin: 0 0 6px;
}

.actions {
  display: flex;
  gap: 8px;
  position: sticky;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.85), #ffffff 30%);
  padding: 10px 0 12px;
  margin-top: 0.5rem;
  z-index: 10;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid #eff3f4;
}
.btn {
  flex: 1;
  padding: 9px 14px;
  border-radius: 9999px;
  border: 1px solid transparent;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: inherit;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: #1d9bf0;
  color: #fff;
}
.btn-primary:hover:not(:disabled) {
  background: #1a8cd8;
}
.btn-ghost {
  background: #ffffff;
  color: #1d9bf0;
  border-color: #cfd9de;
}
.btn-ghost:hover:not(:disabled) {
  background: rgba(29, 155, 240, 0.08);
  border-color: #1d9bf0;
}

/* Toast */
.toast {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: #ffffff;
  border: 1px solid #eff3f4;
  border-radius: 999px;
  font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans Arabic', system-ui, sans-serif;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0f1419;
  box-shadow: 0 8px 32px rgba(15, 20, 25, 0.18);
  z-index: 9999;
  pointer-events: none;
  white-space: nowrap;
  max-width: 90%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toast.error {
  border-color: #f4212e;
  color: #f4212e;
}
.toast.success {
  border-color: #00ba7c;
  color: #0f1419;
}
.toast-enter-active, .toast-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
