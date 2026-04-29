<script lang="ts" setup>
import { ref, onMounted } from 'vue';

const apiKey = ref('');
const apiProvider = ref('kimi');
const customBaseUrl = ref('');
const customModel = ref('');
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

const providers = [
  { value: 'kimi', label: 'Kimi (Moonshot)' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
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
  { value: 'saudi', label: 'Saudi Arabic' },
  { value: 'emirati', label: 'Emirati Arabic' },
  { value: 'kuwaiti', label: 'Kuwaiti Arabic' },
  { value: 'qatari', label: 'Qatari Arabic' },
  { value: 'bahraini', label: 'Bahraini Arabic' },
  { value: 'omani', label: 'Omani Arabic' },
  { value: 'iraqi', label: 'Iraqi Arabic' },
  { value: 'levantine', label: 'Levantine Arabic (Shami)' },
  { value: 'egyptian', label: 'Egyptian Arabic (Masri)' },
  { value: 'libyan', label: 'Libyan Arabic' },
  { value: 'algerian', label: 'Algerian Darja' },
  { value: 'maghrebi', label: 'Maghrebi Arabic (Darija)' },
  { value: 'formalArabic', label: 'Modern Standard Arabic (Fus\'ha)' },
  { value: 'ethiopian', label: 'Amharic (Ethiopian)' },
];

const lengths = [
  { value: 'short', label: 'Short (<100 chars)' },
  { value: 'medium', label: 'Medium (standard)' },
  { value: 'long', label: 'Long (detailed)' },
];

onMounted(async () => {
  const stored = await browser.storage.local.get([
    'apiKey', 'apiProvider', 'tone', 'accent',
    'customPrompt', 'useCustomPrompt', 'monitorMode', 'keywords', 'replyLength',
    'platformX', 'platformFacebook',
    'customBaseUrl', 'customModel',
  ]);
  if (stored.apiKey) apiKey.value = stored.apiKey as string;
  if (stored.apiProvider) apiProvider.value = stored.apiProvider as string;
  if (stored.customBaseUrl) customBaseUrl.value = stored.customBaseUrl as string;
  if (stored.customModel) customModel.value = stored.customModel as string;
  if (stored.tone) tone.value = stored.tone as string;
  if (stored.accent) accent.value = stored.accent as string;
  if (stored.customPrompt) customPrompt.value = stored.customPrompt as string;
  if (stored.useCustomPrompt !== undefined) useCustomPrompt.value = stored.useCustomPrompt as boolean;
  if (stored.monitorMode !== undefined) monitorMode.value = stored.monitorMode as boolean;
  if (stored.keywords) keywords.value = stored.keywords as string;
  if (stored.replyLength) replyLength.value = stored.replyLength as string;
  if (stored.platformX !== undefined) platformX.value = stored.platformX as boolean;
  if (stored.platformFacebook !== undefined) platformFacebook.value = stored.platformFacebook as boolean;
});

async function saveSettings() {
  await browser.storage.local.set({
    apiKey: apiKey.value.trim(),
    apiProvider: apiProvider.value,
    customBaseUrl: customBaseUrl.value.trim(),
    customModel: customModel.value.trim(),
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
  setTimeout(() => saved.value = false, 2000);
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
  <div class="options">
    <h1>X Reply Generator Settings</h1>

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
      <p class="hint">Your API key is stored locally and never leaves your browser except to call the selected provider.</p>
    </div>

    <div v-if="apiProvider === 'custom'" class="field">
      <label>Custom Base URL</label>
      <input type="text" v-model="customBaseUrl" placeholder="https://api.example.com/v1" />
      <p class="hint">OpenAI-compatible base URL. The extension will POST to <code>&lt;base&gt;/chat/completions</code>.</p>
    </div>

    <div v-if="apiProvider === 'custom'" class="field">
      <label>Custom Model Name</label>
      <input type="text" v-model="customModel" placeholder="model-id-as-the-provider-expects" />
      <p class="hint">Exact model identifier as the provider's API expects it.</p>
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
    </div>

    <div class="info">
      <p><strong>How to use:</strong> Navigate to X or Facebook, find the <strong>AI Reply</strong> button next to posts, and click it to generate a reply.</p>
    </div>

    <div class="actions">
      <button class="save-btn" @click="saveSettings">
        {{ saved ? 'Saved!' : 'Save' }}
      </button>
      <button class="test-btn" @click="testConnection">Test Connection</button>
    </div>
  </div>
</template>

<style scoped>
.options {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #e7e9ea;
}
h1 {
  font-size: 1.25rem;
  margin-bottom: 1.25rem;
  color: #fff;
}
.field {
  margin-bottom: 1.25rem;
}
label {
  display: block;
  font-size: 0.85rem;
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
  font-size: 0.95rem;
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
  font-size: 0.95rem;
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
.hint {
  font-size: 0.8rem;
  color: #8899a6;
  margin: 6px 0 0;
}
.actions {
  display: flex;
  gap: 10px;
  position: sticky;
  bottom: 0;
  background: #242424;
  padding: 14px 0 16px;
  margin-top: 0.75rem;
  border-top: 1px solid #38444d;
  z-index: 10;
}
.actions button {
  flex: 1;
  padding: 10px 16px;
  border-radius: 9999px;
  border: none;
  font-size: 0.9rem;
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
.info {
  background: #192734;
  border: 1px solid #38444d;
  border-radius: 12px;
  padding: 1rem;
}
.info p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: #e7e9ea;
}
</style>