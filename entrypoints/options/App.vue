<script lang="ts" setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { t, locale, isRTL, initLocale, setLocale, type Locale } from '../../utils/i18n';
import { providerLabels } from '../../utils/providers';
import { loadApiKeys, saveApiKeys } from '../../utils/crypto';
import { validateStorage } from '../../utils/schemas';
import { sha256Hex } from '../../utils/text';

const apiKeys = ref<Record<string, string>>({});
const apiProvider = ref('kimi');
const apiKey = computed<string>({
  get: () => apiKeys.value[apiProvider.value] ?? '',
  set: (val) => {
    apiKeys.value = { ...apiKeys.value, [apiProvider.value]: val };
  },
});
const customBaseUrl = ref('');
const customModel = ref('');
const customSupportsVision = ref(false);
const variations = ref(false);
const streaming = ref(false);
const searchEnabled = ref(false);
const searchProvider = ref<'brave' | 'tavily'>('brave');
const searchApiKey = ref('');

interface Persona {
  id: string;
  name: string;
  tone: string;
  accent: string;
  replyLength: string;
  useCustomPrompt: boolean;
  customPrompt: string;
}
const personas = ref<Persona[]>([]);
const newPersonaName = ref('');
const tone = ref('diplomatic');
const accent = ref('neutral');
const customPrompt = ref('');
const useCustomPrompt = ref(false);
const monitorMode = ref(false);
const keywords = ref('');
const replyLength = ref('medium');
const platformX = ref(true);
const platformFacebook = ref(true);
const saved = ref(false);

type Tab = 'provider' | 'voice' | 'behavior' | 'personas' | 'monitor' | 'captures';
const tab = ref<Tab>('provider');
const tabs = computed<{ id: Tab; label: string }[]>(() => [
  { id: 'provider', label: t('tab.provider') },
  { id: 'voice', label: t('tab.voice') },
  { id: 'behavior', label: t('tab.behavior') },
  { id: 'personas', label: t('tab.personas') },
  { id: 'monitor', label: t('tab.monitor') },
  { id: 'captures', label: t('tab.captures') },
]);

interface WatchlistRow { id: number; kind: 'account' | 'keyword'; value: string; createdAt: number; unreadHits: number; lastHitTs?: number; }
interface NarrativeHitRow { id: number; ts: number; platform: string; keyword: string; text: string; author?: string; postUrl?: string; sentimentQuick?: string; }
interface CaptureRow { id: number; ts: number; platform: string; postUrl?: string; author?: string; text: string; notes?: string; screenshotData?: string; }

const watchlists = ref<WatchlistRow[]>([]);
const newWatchKind = ref<'account' | 'keyword'>('keyword');
const newWatchValue = ref('');
const narrativeHits = ref<NarrativeHitRow[]>([]);
const narrativeFilter = ref<string>('');
const captures = ref<CaptureRow[]>([]);
const selectedCaptures = ref<Set<number>>(new Set());

async function loadWatchlists() {
  const resp = await browser.runtime.sendMessage({ type: 'WATCHLIST_LIST' });
  if (resp?.success) watchlists.value = resp.rows as WatchlistRow[];
}
async function addWatchlistEntry() {
  const value = newWatchValue.value.trim();
  if (!value) { showToast(t('monitor.watch.empty'), 'error'); return; }
  await browser.runtime.sendMessage({ type: 'WATCHLIST_ADD', kind: newWatchKind.value, value });
  newWatchValue.value = '';
  await loadWatchlists();
  showToast(t('monitor.watch.added'));
}
async function deleteWatchlistEntry(id: number) {
  await browser.runtime.sendMessage({ type: 'WATCHLIST_DELETE', id });
  await loadWatchlists();
}
async function markWatchlistRead(id: number) {
  await browser.runtime.sendMessage({ type: 'WATCHLIST_READ', id });
  await loadWatchlists();
}

async function loadNarrativeHits() {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const resp = await browser.runtime.sendMessage({ type: 'NARRATIVE_LIST', opts: { since, limit: 500 } });
  if (resp?.success) narrativeHits.value = resp.rows as NarrativeHitRow[];
}

const narrativeBuckets = computed(() => {
  const now = new Date();
  const days: { label: string; start: number; end: number; counts: Record<string, number> }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 86400000;
    days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), start, end, counts: {} });
  }
  for (const hit of narrativeHits.value) {
    if (narrativeFilter.value && hit.keyword !== narrativeFilter.value) continue;
    for (const day of days) {
      if (hit.ts >= day.start && hit.ts < day.end) {
        day.counts[hit.keyword] = (day.counts[hit.keyword] || 0) + 1;
        break;
      }
    }
  }
  return days;
});

const narrativeKeywords = computed(() => {
  const set = new Set<string>();
  narrativeHits.value.forEach((h) => set.add(h.keyword));
  return Array.from(set).sort();
});

const narrativeMaxCount = computed(() => {
  let max = 0;
  for (const day of narrativeBuckets.value) {
    const total = Object.values(day.counts).reduce((s, n) => s + n, 0);
    if (total > max) max = total;
  }
  return max || 1;
});

const narrativeRecent = computed(() => {
  return narrativeHits.value
    .filter((h) => !narrativeFilter.value || h.keyword === narrativeFilter.value)
    .slice(0, 30);
});

async function loadCaptures() {
  const resp = await browser.runtime.sendMessage({ type: 'CAPTURE_LIST', limit: 500 });
  if (resp?.success) captures.value = resp.rows as CaptureRow[];
}
async function deleteCaptureEntry(id: number) {
  await browser.runtime.sendMessage({ type: 'CAPTURE_DELETE', id });
  selectedCaptures.value.delete(id);
  await loadCaptures();
}
async function wipeAllCaptures() {
  await browser.runtime.sendMessage({ type: 'CAPTURE_WIPE' });
  selectedCaptures.value.clear();
  await loadCaptures();
  showToast(t('captures.wiped'));
}
function toggleCaptureSelected(id: number) {
  const next = new Set(selectedCaptures.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selectedCaptures.value = next;
}
function selectAllCaptures() {
  selectedCaptures.value = new Set(captures.value.map((c) => c.id));
}
function clearCaptureSelection() {
  selectedCaptures.value = new Set();
}

async function exportCapturesBrief() {
  const selected = captures.value.filter((c) => selectedCaptures.value.size === 0 || selectedCaptures.value.has(c.id));
  if (selected.length === 0) { showToast(t('captures.exportEmpty'), 'error'); return; }
  selected.sort((a, b) => a.ts - b.ts);
  const earliest = selected[0].ts;
  const latest = selected[selected.length - 1].ts;
  const fmt = (ts: number) => new Date(ts).toISOString();
  const lines: string[] = [];
  lines.push(`# Evidence brief`);
  lines.push('');
  lines.push(`- Generated: ${fmt(Date.now())}`);
  lines.push(`- Items: ${selected.length}`);
  lines.push(`- Date range: ${fmt(earliest)} → ${fmt(latest)}`);
  lines.push('');
  lines.push(`---`);
  for (const c of selected) {
    const sha = await sha256Hex(c.text);
    lines.push('');
    lines.push(`## ${c.platform.toUpperCase()} · ${fmt(c.ts)}`);
    lines.push('');
    if (c.author) lines.push(`- **Author:** ${c.author}`);
    if (c.postUrl) lines.push(`- **Permalink:** <${c.postUrl}>`);
    lines.push(`- **Captured:** ${fmt(c.ts)}`);
    lines.push(`- **Text SHA-256:** \`${sha}\``);
    lines.push('');
    lines.push('> ' + c.text.split('\n').join('\n> '));
    if (c.notes) {
      lines.push('');
      lines.push(`**Notes:** ${c.notes}`);
    }
    lines.push('');
    lines.push('---');
  }
  const md = lines.join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evidence-brief-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t('captures.exported', { n: selected.length }));
}

const toast = ref<{ message: string; type: 'success' | 'error' } | null>(null);
let toastTimer: number | null = null;
function showToast(message: string, type: 'success' | 'error' = 'success', ms = 2800) {
  toast.value = { message, type };
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.value = null; }, ms);
}

const confirmingDeleteId = ref<string | null>(null);
let confirmTimer: number | null = null;
function requestDeletePersona(id: string) {
  if (confirmingDeleteId.value === id) {
    if (confirmTimer !== null) window.clearTimeout(confirmTimer);
    confirmingDeleteId.value = null;
    deletePersona(id);
    return;
  }
  confirmingDeleteId.value = id;
  if (confirmTimer !== null) window.clearTimeout(confirmTimer);
  confirmTimer = window.setTimeout(() => { confirmingDeleteId.value = null; }, 3000);
}

const providers = computed(() =>
  Object.entries(providerLabels).map(([value, label]) => ({ value, label }))
);

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
  { value: 'short', label: t('length.short') },
  { value: 'medium', label: t('length.medium') },
  { value: 'long', label: t('length.long') },
]);

const accentLabel = computed(() => {
  for (const g of accents.value) {
    const hit = g.items.find((a) => a.value === accent.value);
    if (hit) return hit.label;
  }
  return accent.value;
});
const toneLabel = computed(() => {
  for (const g of tones.value) {
    const hit = g.items.find((tt) => tt.value === tone.value);
    if (hit) return hit.label;
  }
  return tone.value;
});

onMounted(async () => {
  await initLocale();

  const keysResult = await loadApiKeys();
  if (keysResult.keys) {
    apiKeys.value = keysResult.keys;
  }
  if (keysResult.error) {
    console.warn('[X Reply Gen] Failed to decrypt API keys:', keysResult.error);
    showToast('API keys could not be decrypted. Please re-enter them.', 'error', 5000);
  }

  const stored = await browser.storage.local.get([
    'apiProvider', 'tone', 'accent',
    'customPrompt', 'useCustomPrompt', 'monitorMode', 'keywords', 'replyLength',
    'platformX', 'platformFacebook',
    'customBaseUrl', 'customModel', 'customSupportsVision', 'variations', 'streaming',
    'personas',
    'searchEnabled', 'searchProvider', 'searchApiKey',
  ]);

  const validated = validateStorage(stored);
  if (!validated.success) {
    console.warn('[X Reply Gen] Storage validation failed, using defaults');
  }
  const data = validated.data;

  apiProvider.value = data.apiProvider;
  customBaseUrl.value = data.customBaseUrl || '';
  customModel.value = data.customModel || '';
  customSupportsVision.value = data.customSupportsVision;
  variations.value = data.variations;
  streaming.value = data.streaming;
  if (Array.isArray(data.personas)) personas.value = data.personas;
  searchEnabled.value = data.searchEnabled;
  searchProvider.value = data.searchProvider;
  searchApiKey.value = data.searchApiKey;
  tone.value = data.tone;
  accent.value = data.accent;
  customPrompt.value = data.customPrompt || '';
  useCustomPrompt.value = data.useCustomPrompt;
  monitorMode.value = data.monitorMode;
  keywords.value = data.keywords;
  replyLength.value = data.replyLength;
  platformX.value = data.platformX;
  platformFacebook.value = data.platformFacebook;

  await Promise.all([loadWatchlists(), loadNarrativeHits(), loadCaptures()]);
});

onUnmounted(() => {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  if (confirmTimer !== null) window.clearTimeout(confirmTimer);
});

async function saveSettings() {
  const trimmedKeys = Object.fromEntries(
    Object.entries(apiKeys.value).map(([k, v]) => [k, (v || '').trim()])
  );
  apiKeys.value = trimmedKeys;

  await saveApiKeys(trimmedKeys);

  await browser.storage.local.set({
    apiProvider: apiProvider.value,
    customBaseUrl: customBaseUrl.value.trim(),
    customModel: customModel.value.trim(),
    customSupportsVision: customSupportsVision.value,
    variations: variations.value,
    streaming: streaming.value,
    searchEnabled: searchEnabled.value,
    searchProvider: searchProvider.value,
    searchApiKey: searchApiKey.value.trim(),
    tone: tone.value,
    accent: accent.value,
    customPrompt: customPrompt.value,
    useCustomPrompt: useCustomPrompt.value,
    monitorMode: monitorMode.value,
    keywords: keywords.value,
    replyLength: replyLength.value,
    platformX: platformX.value,
    platformFacebook: platformFacebook.value,
  });
  saved.value = true;
  setTimeout(() => saved.value = false, 1800);
  showToast(t('footer.settingsSaved'));
}

function loadPersona(p: Persona) {
  tone.value = p.tone;
  accent.value = p.accent;
  replyLength.value = p.replyLength;
  useCustomPrompt.value = p.useCustomPrompt;
  customPrompt.value = p.customPrompt;
  showToast(t('personas.loaded', { name: p.name }));
}

async function savePersona() {
  const name = newPersonaName.value.trim();
  if (!name) {
    showToast(t('personas.nameEmpty'), 'error');
    return;
  }
  const persona: Persona = {
    id: crypto.randomUUID(),
    name,
    tone: tone.value,
    accent: accent.value,
    replyLength: replyLength.value,
    useCustomPrompt: useCustomPrompt.value,
    customPrompt: customPrompt.value,
  };
  personas.value = [...personas.value, persona];
  newPersonaName.value = '';
  await browser.storage.local.set({ personas: personas.value });
  showToast(t('personas.saved', { name: persona.name }));
}

async function deletePersona(id: string) {
  const removed = personas.value.find((p) => p.id === id);
  personas.value = personas.value.filter((p) => p.id !== id);
  await browser.storage.local.set({ personas: personas.value });
  if (removed) showToast(t('personas.deleted', { name: removed.name }));
}

async function testConnection() {
  if (!apiKey.value.trim()) {
    showToast(t('test.needKey'), 'error');
    return;
  }
  showToast(t('common.testing'));
  try {
    const response = await browser.runtime.sendMessage({ type: 'TEST_CONNECTION' });
    if (response?.success) {
      showToast(t('test.connectedLong'));
    } else {
      showToast(t('test.failed', { error: response?.error || t('test.failedShort') }), 'error', 5000);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(t('test.failed', { error: msg }), 'error', 5000);
  }
}

async function onLocaleChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  await setLocale(target.value as Locale);
}

const platformsActive = computed(() => {
  const list: string[] = [];
  if (platformX.value) list.push('X');
  if (platformFacebook.value) list.push('Facebook');
  return list.length === 0 ? t('personas.platformsNone') : list.join(' + ');
});

function tabHasIndicator(tabId: Tab): string | null {
  if (tabId === 'provider') {
    if (!apiKey.value.trim()) return t('tab.badge.noKey');
    if (apiProvider.value === 'custom' && (!customBaseUrl.value.trim() || !customModel.value.trim())) {
      return t('tab.badge.incomplete');
    }
    return null;
  }
  return null;
}
</script>

<template>
  <div class="page" :dir="isRTL ? 'rtl' : 'ltr'">
    <header class="hdr">
      <div>
        <h1>{{ t('app.options.title') }}</h1>
        <p class="sub">{{ t('app.options.sub') }}</p>
      </div>
      <div class="lang-wrap">
        <label for="lang" class="lang-label">{{ t('lang.label') }}</label>
        <select id="lang" class="lang-select" :value="locale" @change="onLocaleChange">
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>
    </header>

    <nav class="tabs" role="tablist">
      <button
        v-for="ttab in tabs"
        :key="ttab.id"
        :class="['tab', { active: tab === ttab.id }]"
        role="tab"
        :aria-selected="tab === ttab.id"
        :title="tabHasIndicator(ttab.id) || undefined"
        @click="tab = ttab.id"
      >
        {{ ttab.label }}
        <span
          v-if="tabHasIndicator(ttab.id)"
          class="badge"
          :aria-label="tabHasIndicator(ttab.id) ?? undefined"
        ></span>
      </button>
    </nav>

    <!-- PROVIDER -->
    <section v-show="tab === 'provider'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('provider.cardTitle') }}</h2>
        <p>{{ t('provider.cardDesc') }}</p>
      </div>

      <div class="field">
        <label for="provider">{{ t('provider.label') }}</label>
        <select id="provider" v-model="apiProvider">
          <option v-for="p in providers" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </div>

      <div v-if="apiProvider !== 'ollama'" class="field">
        <label for="apiKey">{{ t('provider.apiKeyLabel') }}</label>
        <input id="apiKey" type="password" v-model="apiKey" :placeholder="t('provider.apiKeyPlaceholder')" autocomplete="off" />
        <p class="hint">{{ t('provider.apiKeyHint') }}</p>
      </div>

      <div v-else class="hint" style="margin-bottom: 0.875rem;">{{ t('provider.ollamaNoKey') }}</div>

      <div v-if="apiProvider === 'custom'" class="custom-block">
        <div class="field">
          <label for="customBase">{{ t('provider.customBaseLabel') }}</label>
          <input id="customBase" type="text" v-model="customBaseUrl" :placeholder="t('provider.customBasePlaceholder')" autocomplete="off" />
          <p class="hint" v-html="t('provider.customBaseHint')" />
        </div>
        <div class="field">
          <label for="customModel">{{ t('provider.customModelLabel') }}</label>
          <input id="customModel" type="text" v-model="customModel" :placeholder="t('provider.customModelPlaceholder')" autocomplete="off" />
          <p class="hint">{{ t('provider.customModelHint') }}</p>
        </div>
        <label class="checkbox">
          <input type="checkbox" v-model="customSupportsVision" />
          <span>{{ t('provider.customVision') }}</span>
        </label>
      </div>

      <div v-if="apiProvider === 'ollama'" class="custom-block">
        <div class="field">
          <label for="ollamaBase">{{ t('provider.customBaseLabel') }}</label>
          <input id="ollamaBase" type="text" v-model="customBaseUrl" placeholder="http://localhost:11434/v1" autocomplete="off" />
          <p class="hint" v-html="t('provider.ollamaBaseHint')" />
        </div>
        <div class="field">
          <label for="ollamaModel">{{ t('provider.customModelLabel') }}</label>
          <input id="ollamaModel" type="text" v-model="customModel" placeholder="llama3.1" autocomplete="off" />
          <p class="hint" v-html="t('provider.ollamaModelHint')" />
        </div>
        <label class="checkbox">
          <input type="checkbox" v-model="customSupportsVision" />
          <span>{{ t('provider.customVision') }}</span>
        </label>
      </div>
    </section>

    <!-- VOICE -->
    <section v-show="tab === 'voice'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('voice.cardTitle') }}</h2>
        <p>{{ t('voice.cardDesc') }}</p>
      </div>

      <div class="field">
        <label for="tone">{{ t('voice.tone') }}</label>
        <select id="tone" v-model="tone">
          <optgroup v-for="g in tones" :key="g.group" :label="g.group">
            <option v-for="ti in g.items" :key="ti.value" :value="ti.value">{{ ti.label }}</option>
          </optgroup>
        </select>
      </div>

      <div class="field">
        <label for="accent">{{ t('voice.accent') }}</label>
        <select id="accent" v-model="accent">
          <optgroup v-for="g in accents" :key="g.group" :label="g.group">
            <option v-for="a in g.items" :key="a.value" :value="a.value">{{ a.label }}</option>
          </optgroup>
        </select>
      </div>

      <div class="field">
        <label for="length">{{ t('voice.length') }}</label>
        <select id="length" v-model="replyLength">
          <option v-for="l in lengths" :key="l.value" :value="l.value">{{ l.label }}</option>
        </select>
      </div>

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="useCustomPrompt" />
          <span>{{ t('voice.customPromptToggle') }}</span>
        </label>
        <textarea
          v-if="useCustomPrompt"
          v-model="customPrompt"
          :placeholder="t('voice.customPromptPlaceholder')"
          rows="5"
        />
      </div>
    </section>

    <!-- BEHAVIOR -->
    <section v-show="tab === 'behavior'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('behavior.cardTitle') }}</h2>
        <p>{{ t('behavior.cardDesc') }}</p>
      </div>

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="variations" />
          <span>{{ t('behavior.variations') }}</span>
        </label>
        <p class="hint">{{ t('behavior.variationsHint') }}</p>
      </div>

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="streaming" :disabled="variations" />
          <span>{{ t('behavior.streaming') }}</span>
        </label>
        <p v-if="variations" class="hint muted">{{ t('behavior.streamingDisabled') }}</p>
      </div>

      <div class="divider" />

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="platformX" />
          <span>{{ t('behavior.platformX') }}</span>
        </label>
      </div>

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="platformFacebook" />
          <span>{{ t('behavior.platformFB') }}</span>
        </label>
      </div>

      <div class="divider" />

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="monitorMode" />
          <span>{{ t('behavior.monitor') }}</span>
        </label>
        <input
          v-if="monitorMode"
          type="text"
          v-model="keywords"
          :placeholder="t('behavior.keywordsPlaceholder')"
        />
      </div>

      <div class="divider" />

      <div class="card-hdr" style="margin-top: 0; padding-bottom: 8px;">
        <h2 style="font-size: 0.9rem;">{{ t('search.cardTitle') }}</h2>
        <p>{{ t('search.cardDesc') }}</p>
      </div>

      <div class="field">
        <label class="checkbox">
          <input type="checkbox" v-model="searchEnabled" />
          <span>{{ t('search.enable') }}</span>
        </label>
      </div>

      <template v-if="searchEnabled">
        <div class="field">
          <label for="searchProvider">{{ t('search.providerLabel') }}</label>
          <select id="searchProvider" v-model="searchProvider">
            <option value="brave">{{ t('search.providerBrave') }}</option>
            <option value="tavily">{{ t('search.providerTavily') }}</option>
          </select>
          <p class="hint">
            {{ searchProvider === 'brave' ? t('search.providerHintBrave') : t('search.providerHintTavily') }}
          </p>
        </div>

        <div class="field">
          <label for="searchApiKey">{{ t('search.apiKeyLabel') }}</label>
          <input
            id="searchApiKey"
            type="password"
            v-model="searchApiKey"
            :placeholder="searchProvider === 'brave' ? t('search.apiKeyPlaceholderBrave') : t('search.apiKeyPlaceholderTavily')"
            autocomplete="off"
          />
        </div>
      </template>
    </section>

    <!-- PERSONAS -->
    <!-- MONITOR (watchlists + narrative timeline) -->
    <section v-show="tab === 'monitor'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('monitor.cardTitle') }}</h2>
        <p>{{ t('monitor.cardDesc') }}</p>
      </div>

      <h3 class="subhead">{{ t('monitor.watch.heading') }}</h3>
      <p class="hint">{{ t('monitor.watch.hint') }}</p>

      <div class="watch-add">
        <select v-model="newWatchKind" class="watch-kind">
          <option value="keyword">{{ t('monitor.watch.kindKeyword') }}</option>
          <option value="account">{{ t('monitor.watch.kindAccount') }}</option>
        </select>
        <input
          type="text"
          v-model="newWatchValue"
          :placeholder="newWatchKind === 'account' ? t('monitor.watch.accountPlaceholder') : t('monitor.watch.keywordPlaceholder')"
          @keydown.enter="addWatchlistEntry"
        />
        <button class="btn btn-primary" @click="addWatchlistEntry">{{ t('monitor.watch.add') }}</button>
      </div>

      <ul v-if="watchlists.length" class="watch-list">
        <li v-for="w in watchlists" :key="w.id" class="watch-row">
          <div class="watch-info">
            <span :class="['watch-kind-tag', w.kind]">{{ w.kind === 'account' ? '@' : '#' }}</span>
            <span class="watch-value">{{ w.value }}</span>
            <span v-if="w.unreadHits > 0" class="watch-badge">{{ w.unreadHits }}</span>
          </div>
          <button v-if="w.unreadHits > 0" class="btn btn-ghost" @click="markWatchlistRead(w.id)">{{ t('monitor.watch.markRead') }}</button>
          <button class="btn btn-ghost-danger" @click="deleteWatchlistEntry(w.id)" :aria-label="t('monitor.watch.delete')">×</button>
        </li>
      </ul>
      <div v-else class="empty">
        <p>{{ t('monitor.watch.empty') }}</p>
      </div>

      <h3 class="subhead" style="margin-top: 1.5rem;">{{ t('monitor.narratives.heading') }}</h3>
      <p class="hint">{{ t('monitor.narratives.hint') }}</p>

      <div v-if="narrativeKeywords.length === 0" class="empty">
        <p>{{ t('monitor.narratives.empty') }}</p>
        <p class="hint">{{ t('monitor.narratives.emptyHint') }}</p>
      </div>
      <template v-else>
        <div class="narrative-filter">
          <button
            :class="['chip-btn', { active: narrativeFilter === '' }]"
            @click="narrativeFilter = ''"
          >{{ t('monitor.narratives.all') }}</button>
          <button
            v-for="kw in narrativeKeywords"
            :key="kw"
            :class="['chip-btn', { active: narrativeFilter === kw }]"
            @click="narrativeFilter = kw"
          >{{ kw }}</button>
        </div>

        <div class="timeline">
          <div v-for="day in narrativeBuckets" :key="day.start" class="timeline-bar">
            <div class="bar-track">
              <div
                class="bar-fill"
                :style="{ height: ((Object.values(day.counts).reduce((s, n) => s + n, 0) / narrativeMaxCount) * 100) + '%' }"
              />
            </div>
            <div class="bar-count">{{ Object.values(day.counts).reduce((s, n) => s + n, 0) }}</div>
            <div class="bar-label">{{ day.label }}</div>
          </div>
        </div>

        <h4 class="subsubhead">{{ t('monitor.narratives.recent') }}</h4>
        <ul class="hit-list">
          <li v-for="hit in narrativeRecent" :key="hit.id" class="hit-row">
            <div class="hit-meta">
              <span :class="['sentiment-dot', hit.sentimentQuick]" :title="hit.sentimentQuick"></span>
              <span class="hit-keyword">{{ hit.keyword }}</span>
              <span class="hit-platform">{{ hit.platform }}</span>
              <span class="hit-time">{{ new Date(hit.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
            <div class="hit-text">{{ hit.text.slice(0, 200) }}<span v-if="hit.text.length > 200">…</span></div>
            <div v-if="hit.author || hit.postUrl" class="hit-footer">
              <span v-if="hit.author">{{ hit.author }}</span>
              <a v-if="hit.postUrl" :href="hit.postUrl" target="_blank" rel="noopener noreferrer">{{ t('monitor.narratives.openPost') }}</a>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <!-- CAPTURES -->
    <section v-show="tab === 'captures'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('captures.cardTitle') }}</h2>
        <p>{{ t('captures.cardDesc') }}</p>
      </div>

      <div v-if="captures.length === 0" class="empty">
        <p>{{ t('captures.empty') }}</p>
        <p class="hint">{{ t('captures.emptyHint') }}</p>
      </div>
      <template v-else>
        <div class="capture-toolbar">
          <span class="capture-summary">{{ t('captures.count', { n: captures.length }) }} · {{ t('captures.selected', { n: selectedCaptures.size }) }}</span>
          <button class="btn btn-ghost" @click="selectAllCaptures" :disabled="selectedCaptures.size === captures.length">{{ t('captures.selectAll') }}</button>
          <button class="btn btn-ghost" @click="clearCaptureSelection" :disabled="selectedCaptures.size === 0">{{ t('captures.clear') }}</button>
          <button class="btn btn-primary" @click="exportCapturesBrief">{{ t('captures.export') }}</button>
          <button class="btn btn-ghost-danger" @click="wipeAllCaptures">{{ t('captures.wipe') }}</button>
        </div>

        <ul class="capture-list">
          <li v-for="c in captures" :key="c.id" class="capture-row">
            <input
              type="checkbox"
              :checked="selectedCaptures.has(c.id)"
              @change="toggleCaptureSelected(c.id)"
              class="capture-check"
            />
            <div class="capture-body">
              <div class="capture-meta">
                <span class="capture-platform">{{ c.platform }}</span>
                <span class="capture-time">{{ new Date(c.ts).toLocaleString() }}</span>
                <span v-if="c.author" class="capture-author">{{ c.author }}</span>
              </div>
              <img v-if="c.screenshotData" :src="c.screenshotData" class="capture-thumb" alt="Screenshot" />
              <div class="capture-text">{{ c.text }}</div>
              <div class="capture-actions">
                <a v-if="c.postUrl" :href="c.postUrl" target="_blank" rel="noopener noreferrer" class="capture-link">{{ t('captures.open') }}</a>
                <button class="btn-link-danger" @click="deleteCaptureEntry(c.id)">{{ t('captures.delete') }}</button>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <section v-show="tab === 'personas'" class="card" role="tabpanel">
      <div class="card-hdr">
        <h2>{{ t('personas.cardTitle') }}</h2>
        <p>{{ t('personas.cardDesc') }}</p>
      </div>

      <div class="persona-summary">
        <div class="summary-item">
          <span class="summary-label">{{ t('personas.summaryVoice') }}</span>
          <span class="summary-value">{{ toneLabel }} · {{ accentLabel }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">{{ t('personas.summaryPlatforms') }}</span>
          <span class="summary-value">{{ platformsActive }}</span>
        </div>
      </div>

      <div v-if="personas.length === 0" class="empty">
        <p>{{ t('personas.emptyTitle') }}</p>
        <p class="hint">{{ t('personas.emptyHint') }}</p>
      </div>

      <ul v-else class="persona-list">
        <li v-for="p in personas" :key="p.id" class="persona-row">
          <div class="persona-info">
            <span class="persona-name">{{ p.name }}</span>
            <span class="persona-meta">{{ p.tone }} · {{ p.accent }} · {{ p.replyLength }}</span>
          </div>
          <button class="btn btn-ghost" @click="loadPersona(p)">{{ t('common.load') }}</button>
          <button
            :class="['btn', confirmingDeleteId === p.id ? 'btn-danger-confirm' : 'btn-ghost-danger']"
            @click="requestDeletePersona(p.id)"
            :aria-label="confirmingDeleteId === p.id ? t('personas.confirmAria') : t('personas.deleteAria')"
          >
            {{ confirmingDeleteId === p.id ? t('common.confirm') : '×' }}
          </button>
        </li>
      </ul>

      <div class="persona-add">
        <input
          type="text"
          v-model="newPersonaName"
          :placeholder="t('personas.namePlaceholder')"
          @keydown.enter="savePersona"
        />
        <button class="btn btn-primary" @click="savePersona">{{ t('personas.saveCurrent') }}</button>
      </div>
    </section>

    <footer class="footer">
      <button class="btn btn-primary" @click="saveSettings">
        {{ saved ? t('common.saved') : t('footer.saveChanges') }}
      </button>
      <button class="btn btn-ghost" @click="testConnection">{{ t('footer.testConnection') }}</button>
    </footer>

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
.page {
  max-width: 560px;
  margin: 2rem auto 4rem;
  padding: 0 1.25rem;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
  color: #0f1419;
}
.page[dir="rtl"] {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Arabic', 'Geeza Pro', system-ui, sans-serif;
}

.hdr {
  margin-bottom: 1.5rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.hdr h1 {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0 0 4px;
  color: #0f1419;
  letter-spacing: -0.01em;
}
.hdr .sub {
  margin: 0;
  font-size: 0.9rem;
  color: #536471;
}
.lang-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.lang-label {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  text-align: end;
}
.lang-select {
  padding: 6px 10px;
  border: 1px solid #cfd9de;
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: inherit;
  background: #ffffff;
  color: #0f1419;
  cursor: pointer;
}
.lang-select:hover {
  border-color: #71767b;
}

/* Tabs */
.tabs {
  display: flex;
  flex-wrap: nowrap;
  gap: 2px;
  padding: 3px;
  background: #f7f9fa;
  border: 1px solid #eff3f4;
  border-radius: 12px;
  margin-bottom: 1rem;
}
.tab {
  flex: 1 1 0;
  min-width: 0;
  padding: 7px 6px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: #536471;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tab:hover {
  color: #0f1419;
  background: rgba(15, 20, 25, 0.04);
}
.tab.active {
  background: #1d9bf0;
  color: #fff;
}
.tab.active:hover {
  background: #1a8cd8;
}
.tab .badge {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f4212e;
  box-shadow: 0 0 0 2px #f7f9fa;
}
.tab.active .badge {
  background: #fff;
  box-shadow: 0 0 0 2px #1d9bf0;
}

/* Card sections */
.card {
  background: #ffffff;
  border: 1px solid #eff3f4;
  border-radius: 14px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 2px rgba(15, 20, 25, 0.04);
}
.card-hdr {
  margin-bottom: 1rem;
  padding-bottom: 0.875rem;
  border-bottom: 1px solid #eff3f4;
}
.card-hdr h2 {
  margin: 0 0 4px;
  font-size: 1rem;
  font-weight: 700;
  color: #0f1419;
}
.card-hdr p {
  margin: 0;
  font-size: 0.825rem;
  color: #536471;
}

/* Fields */
.field {
  margin-bottom: 0.875rem;
}
.field:last-child {
  margin-bottom: 0;
}
label {
  display: block;
  font-size: 0.78rem;
  font-weight: 700;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
}
label.checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  text-transform: none;
  font-size: 0.92rem;
  font-weight: 500;
  color: #0f1419;
  cursor: pointer;
  letter-spacing: 0;
  margin-bottom: 0;
}
label.checkbox input {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: #1d9bf0;
}
select, input[type="password"], input[type="text"], textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cfd9de;
  border-radius: 9px;
  font-size: 0.93rem;
  font-family: inherit;
  background: #ffffff;
  color: #0f1419;
  box-sizing: border-box;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
select:hover, input:hover, textarea:hover {
  border-color: #71767b;
}
textarea {
  resize: vertical;
  margin-top: 8px;
  font-size: 0.9rem;
  line-height: 1.5;
}
select:focus, input:focus, textarea:focus {
  outline: none;
  border-color: #1d9bf0;
  box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.15);
}
.hint {
  font-size: 0.78rem;
  color: #536471;
  margin: 6px 0 0;
  line-height: 1.4;
}
.hint.muted {
  opacity: 0.75;
  font-style: italic;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: rgba(29, 155, 240, 0.1);
  color: #1d9bf0;
  padding: 1px 5px;
  border-radius: 4px;
}
.custom-block {
  background: #f7f9fa;
  border: 1px solid #eff3f4;
  border-radius: 10px;
  padding: 0.875rem;
  margin-top: 4px;
}
.divider {
  height: 1px;
  background: #eff3f4;
  margin: 1rem 0;
}

/* Personas */
.persona-summary {
  display: flex;
  gap: 16px;
  padding: 12px 14px;
  background: #f7f9fa;
  border: 1px solid #eff3f4;
  border-radius: 10px;
  margin-bottom: 1rem;
}
.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary-label {
  font-size: 0.7rem;
  font-weight: 700;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.summary-value {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f1419;
}
.empty {
  padding: 1rem;
  text-align: center;
  background: #f7f9fa;
  border: 1px dashed #cfd9de;
  border-radius: 10px;
}
.empty p {
  margin: 0 0 4px;
  font-size: 0.9rem;
  color: #536471;
}
.persona-list {
  list-style: none;
  margin: 0 0 1rem;
  padding: 0;
}
.persona-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 6px;
  background: #f7f9fa;
  border: 1px solid #eff3f4;
  border-radius: 10px;
  transition: border-color 0.15s, background 0.15s;
}
.persona-row:hover {
  border-color: #cfd9de;
  background: #ffffff;
}
.persona-row:last-child {
  margin-bottom: 0;
}
.persona-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.persona-name {
  font-weight: 600;
  font-size: 0.9rem;
  color: #0f1419;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-meta {
  font-size: 0.72rem;
  color: #536471;
}
.persona-add {
  display: flex;
  gap: 8px;
}
.persona-add input {
  flex: 1;
}

/* Buttons (always centered text) */
.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: inherit;
}
.btn-primary {
  background: #1d9bf0;
  color: #fff;
}
.btn-primary:hover {
  background: #1a8cd8;
}
.btn-ghost {
  background: #ffffff;
  color: #0f1419;
  border-color: #cfd9de;
}
.btn-ghost:hover {
  background: #f7f9fa;
  border-color: #71767b;
}
.btn-ghost-danger {
  background: #ffffff;
  color: #f4212e;
  border-color: #cfd9de;
  width: 36px;
  padding: 8px 0;
  font-size: 1.1rem;
  line-height: 1;
}
.btn-ghost-danger:hover {
  background: rgba(244, 33, 46, 0.08);
  border-color: #f4212e;
}
.btn-danger-confirm {
  background: #f4212e;
  color: #fff;
  border-color: #f4212e;
  font-size: 0.78rem;
}
.btn-danger-confirm:hover {
  background: #d61e2a;
}

/* Footer (sticky save bar) */
.footer {
  display: flex;
  gap: 10px;
  position: sticky;
  bottom: 0;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.85), #ffffff 30%);
  padding: 14px 0 16px;
  margin-top: 1rem;
  z-index: 10;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-top: 1px solid #eff3f4;
}
.footer .btn {
  flex: 1;
  padding: 11px 16px;
  border-radius: 9999px;
}

/* Toast */
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 18px;
  background: #ffffff;
  border: 1px solid #eff3f4;
  border-radius: 999px;
  font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans Arabic', system-ui, sans-serif;
  font-size: 0.88rem;
  font-weight: 600;
  color: #0f1419;
  box-shadow: 0 8px 32px rgba(15, 20, 25, 0.18);
  z-index: 9999;
  pointer-events: none;
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
  transform: translateX(-50%) translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}

/* ── Monitor tab (watchlists + narratives) ───────────────── */
.subhead {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 1rem 0 0.25rem;
  color: #0f1419;
}
.subsubhead {
  font-size: 0.825rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #536471;
  margin: 1rem 0 0.5rem;
}
.watch-add {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.5rem 0 1rem;
  align-items: stretch;
}
.watch-kind {
  flex: 0 0 auto;
  width: auto;
}
.watch-add input {
  flex: 1 1 160px;
  min-width: 0;
  width: auto;
}
.watch-add .btn { flex: 0 0 auto; }
.watch-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #eff3f4;
  border-radius: 10px;
  overflow: hidden;
}
.watch-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border-bottom: 1px solid #eff3f4;
  min-width: 0;
}
.watch-row:last-child { border-bottom: none; }
.watch-row:hover { background: #f7f9fa; }
.watch-info {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}
.watch-kind-tag {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #eff3f4;
  color: #536471;
  font-weight: 700;
  font-size: 0.75rem;
}
.watch-kind-tag.account { background: #dceeff; color: #0a4a7a; }
.watch-kind-tag.keyword { background: #fff5d6; color: #7a5500; }
.watch-value {
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.watch-badge {
  flex: 0 0 auto;
  background: #f4212e;
  color: #fff;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 0.7rem;
  font-weight: 700;
}
.watch-row .btn { flex: 0 0 auto; }

.narrative-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin: 0.5rem 0 0.75rem;
}
.chip-btn {
  border: 1px solid #cfd9de;
  background: #fff;
  color: #536471;
  padding: 0.25rem 0.625rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}
.chip-btn:hover { color: #1d9bf0; border-color: #1d9bf0; }
.chip-btn.active { background: #1d9bf0; color: #fff; border-color: #1d9bf0; }

.timeline {
  display: flex;
  align-items: flex-end;
  gap: 0.375rem;
  height: 110px;
  padding: 0 0.25rem;
  border-bottom: 1px solid #eff3f4;
  margin-bottom: 0.5rem;
}
.timeline-bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.bar-track {
  width: 100%;
  flex: 1;
  display: flex;
  align-items: flex-end;
  background: #f7f9fa;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}
.bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #1d9bf0, #7a5af8);
  border-radius: 4px 4px 0 0;
  min-height: 1px;
}
.bar-count {
  font-size: 0.7rem;
  color: #536471;
  font-weight: 700;
}
.bar-label {
  font-size: 0.7rem;
  color: #71767b;
  text-align: center;
}

.hit-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.hit-row {
  padding: 0.625rem 0;
  border-bottom: 1px solid #eff3f4;
  min-width: 0;
}
.hit-row:last-child { border-bottom: none; }
.hit-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.7rem;
  color: #536471;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
  margin-bottom: 0.25rem;
  flex-wrap: wrap;
}
.sentiment-dot {
  flex: 0 0 auto;
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #71767b;
}
.sentiment-dot.positive { background: #00ba7c; }
.sentiment-dot.negative { background: #f4212e; }
.sentiment-dot.neutral { background: #71767b; }
.hit-keyword {
  color: #1d9bf0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}
.hit-platform { flex: 0 0 auto; }
.hit-time { margin-left: auto; flex: 0 0 auto; }
.hit-text {
  font-size: 0.85rem;
  color: #0f1419;
  line-height: 1.4;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.hit-footer {
  display: flex;
  gap: 0.75rem;
  font-size: 0.75rem;
  color: #536471;
  margin-top: 0.25rem;
  flex-wrap: wrap;
  min-width: 0;
}
.hit-footer a {
  color: #1d9bf0;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* ── Captures tab ───────────────── */
.capture-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 0;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid #eff3f4;
}
.capture-summary {
  flex: 1;
  font-size: 0.8125rem;
  color: #536471;
  font-weight: 600;
}
.capture-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.capture-row {
  display: flex;
  gap: 0.625rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid #eff3f4;
}
.capture-check {
  margin-top: 0.25rem;
  flex: 0 0 auto;
}
.capture-body { flex: 1; min-width: 0; }
.capture-meta {
  display: flex;
  gap: 0.5rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  font-weight: 700;
  color: #536471;
  letter-spacing: 0.04em;
  margin-bottom: 0.25rem;
}
.capture-platform { color: #1d9bf0; }
.capture-author { margin-left: auto; text-transform: none; letter-spacing: 0; }
.capture-text {
  font-size: 0.85rem;
  line-height: 1.4;
  color: #0f1419;
  white-space: pre-wrap;
  word-break: break-word;
}
.capture-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.375rem;
  font-size: 0.75rem;
}
.capture-thumb {
  max-width: 100%;
  max-height: 180px;
  border-radius: 8px;
  border: 1px solid #eff3f4;
  margin: 0.375rem 0;
  object-fit: cover;
}
.capture-link { color: #1d9bf0; text-decoration: none; font-weight: 600; }
.btn-link-danger {
  background: none;
  border: none;
  padding: 0;
  color: #f4212e;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.75rem;
}
.btn-link-danger:hover { text-decoration: underline; }
</style>
