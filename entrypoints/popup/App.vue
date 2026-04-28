<script lang="ts" setup>
import { ref, onMounted } from 'vue';

const apiKey = ref('');
const apiProvider = ref('kimi');
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
const savedTimeout = ref<number | null>(null);
const isOnX = ref(false);
const detectedCount = ref(0);

const providers = [
  { value: 'kimi', label: 'Kimi (Moonshot)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
];

const tones = [
  { value: 'diplomatic', label: 'Diplomatic' },
  { value: 'reconciliatory', label: 'Reconciliatory' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'peaceful', label: 'Peaceful' },
  { value: 'factChecker', label: 'Fact-Checker' },
  { value: 'historical', label: 'Historical' },
  { value: 'legalistic', label: 'Legalistic' },
  { value: 'analytical', label: 'Analytical' },
  { value: 'patriotic', label: 'Patriotic' },
  { value: 'cultural', label: 'Cultural' },
  { value: 'unity', label: 'Unity / Pan-National' },
  { value: 'defiant', label: 'Defiant' },
  { value: 'satirical', label: 'Satirical' },
  { value: 'resilient', label: 'Resilient' },
  { value: 'economic', label: 'Economic' },
  { value: 'humanitarian', label: 'Humanitarian' },
  { value: 'bullying', label: 'Bullying' },
  { value: 'falseInfo', label: 'False Info' },
  { value: 'aggressive', label: 'Aggressive' },
];

const accents = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'american', label: 'American English' },
  { value: 'british', label: 'British English' },
  { value: 'australian', label: 'Australian English' },
  { value: 'genz', label: 'Gen Z Slang' },
  { value: 'academic', label: 'Academic' },
  { value: 'corporate', label: 'Corporate Speak' },
  { value: 'meme', label: 'Internet Meme Style' },
  { value: 'poetic', label: 'Poetic' },
  { value: 'minimalist', label: 'Minimalist (Short & Punchy)' },
  { value: 'saudi', label: 'Saudi / Gulf Arabic' },
  { value: 'egyptian', label: 'Egyptian Arabic (Masri)' },
  { value: 'levantine', label: 'Levantine Arabic (Shami)' },
  { value: 'maghrebi', label: 'Maghrebi Arabic (Darija)' },
  { value: 'iraqi', label: 'Iraqi Arabic' },
  { value: 'formalArabic', label: 'Modern Standard Arabic (Fus\'ha)' },
];

const lengths = [
  { value: 'short', label: 'Short (<100 chars)' },
  { value: 'medium', label: 'Medium (standard)' },
  { value: 'long', label: 'Long (detailed)' },
];

onMounted(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab.url || '';
  isOnX.value = !!(url.includes('x.com') || url.includes('twitter.com') || url.includes('facebook.com'));

  const stored = await browser.storage.local.get([
    'apiKey', 'apiProvider', 'tone', 'accent',
    'customPrompt', 'useCustomPrompt', 'monitorMode', 'keywords', 'replyLength', 'detectedCount',
    'platformX', 'platformFacebook'
  ]);
  if (stored.apiKey) apiKey.value = stored.apiKey as string;
  if (stored.apiProvider) apiProvider.value = stored.apiProvider as string;
  if (stored.tone) tone.value = stored.tone as string;
  if (stored.accent) accent.value = stored.accent as string;
  if (stored.customPrompt) customPrompt.value = stored.customPrompt as string;
  if (stored.useCustomPrompt !== undefined) useCustomPrompt.value = stored.useCustomPrompt as boolean;
  if (stored.monitorMode !== undefined) monitorMode.value = stored.monitorMode as boolean;
  if (stored.keywords) keywords.value = stored.keywords as string;
  if (stored.replyLength) replyLength.value = stored.replyLength as string;
  if (stored.detectedCount) detectedCount.value = stored.detectedCount as number;
  if (stored.platformX !== undefined) platformX.value = stored.platformX as boolean;
  if (stored.platformFacebook !== undefined) platformFacebook.value = stored.platformFacebook as boolean;
});

async function saveSettings() {
  await browser.storage.local.set({
    apiKey: apiKey.value.trim(),
    apiProvider: apiProvider.value,
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
  if (savedTimeout.value) clearTimeout(savedTimeout.value);
  savedTimeout.value = window.setTimeout(() => saved.value = false, 2000);
}

function goToX() {
  browser.tabs.create({ url: 'https://x.com' });
}

async function testConnection() {
  if (!apiKey.value.trim()) {
    alert('Please enter your API key first');
    return;
  }
  try {
    const response = await browser.runtime.sendMessage({ type: 'TEST_CONNECTION' });
    if (response?.success) {
      alert('Connected successfully!');
    } else {
      alert('Connection failed: ' + (response?.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Connection failed: ' + (err instanceof Error ? err.message : String(err)));
  }
}
</script>

<template>
  <div class="popup">
    <h1>X Reply Generator</h1>

    <div class="field">
      <label>AI Provider</label>
      <select v-model="apiProvider">
        <option v-for="p in providers" :key="p.value" :value="p.value">
          {{ p.label }}
        </option>
      </select>
    </div>

    <div class="field">
      <label>API Key</label>
      <input type="password" v-model="apiKey" placeholder="Enter your API key..." />
    </div>

    <div class="field">
      <label>Tone</label>
      <select v-model="tone">
        <option v-for="t in tones" :key="t.value" :value="t.value">
          {{ t.label }}
        </option>
      </select>
    </div>

    <div class="field">
      <label>Accent / Style</label>
      <select v-model="accent">
        <option v-for="a in accents" :key="a.value" :value="a.value">
          {{ a.label }}
        </option>
      </select>
    </div>

    <div class="field">
      <label>Reply Length</label>
      <select v-model="replyLength">
        <option v-for="l in lengths" :key="l.value" :value="l.value">
          {{ l.label }}
        </option>
      </select>
    </div>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" v-model="useCustomPrompt" />
        Use Custom System Prompt
      </label>
      <textarea
        v-if="useCustomPrompt"
        v-model="customPrompt"
        placeholder="Enter your custom system prompt here..."
        rows="4"
      />
    </div>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" v-model="platformX" />
        Enable on X / Twitter
      </label>
    </div>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" v-model="platformFacebook" />
        Enable on Facebook
      </label>
    </div>

    <div class="field">
      <label class="checkbox">
        <input type="checkbox" v-model="monitorMode" />
        Monitor Mode (auto-detect targets)
      </label>
      <input
        v-if="monitorMode"
        type="text"
        v-model="keywords"
        placeholder="keywords, separated, by, commas"
      />
      <p v-if="monitorMode && detectedCount > 0" class="detected">
        {{ detectedCount }} tweet(s) detected on this page
      </p>
    </div>

    <div class="actions">
      <button class="save-btn" @click="saveSettings">
        {{ saved ? 'Saved!' : 'Save' }}
      </button>
      <button class="test-btn" @click="testConnection">Test</button>
    </div>

    <div class="status" :class="{ active: isOnX }">
      <span class="dot"></span>
      {{ isOnX ? 'Ready' : 'Navigate to X or Facebook' }}
    </div>

    <button v-if="!isOnX" class="goto-btn" @click="goToX">Go to X.com</button>
  </div>
</template>

<style scoped>
.popup {
  width: 320px;
  padding: 1rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #e7e9ea;
}
h1 {
  font-size: 1.1rem;
  margin: 0 0 0.75rem;
  color: #fff;
}
.field {
  margin-bottom: 0.75rem;
}
label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #8899a6;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 6px;
}
.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  text-transform: none;
  font-size: 0.9rem;
  font-weight: 500;
  color: #e7e9ea;
  cursor: pointer;
}
.checkbox input {
  width: auto;
}
select, input[type="password"], input[type="text"], textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #38444d;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  background: #192734;
  color: #e7e9ea;
  box-sizing: border-box;
}
textarea {
  resize: vertical;
  margin-top: 6px;
}
select:focus, input:focus, textarea:focus {
  outline: none;
  border-color: #1d9bf0;
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 0.75rem;
}
.actions button {
  flex: 1;
  padding: 10px 16px;
  border-radius: 9999px;
  border: none;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}
.save-btn {
  background: #1d9bf0;
  color: #fff;
}
.test-btn {
  background: transparent;
  color: #1d9bf0;
  border: 1px solid #8899a6 !important;
}
.actions button:hover {
  opacity: 0.85;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: #8899a6;
  margin-bottom: 0.5rem;
}
.status.active {
  color: #00ba7c;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #8899a6;
}
.status.active .dot {
  background: #00ba7c;
}
.detected {
  font-size: 0.8rem;
  color: #f4212e;
  font-weight: 600;
  margin: 4px 0 0;
}
.goto-btn {
  width: 100%;
  padding: 10px;
  border-radius: 9999px;
  border: 1px solid #38444d;
  background: transparent;
  color: #e7e9ea;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s;
}
.goto-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}
</style>
