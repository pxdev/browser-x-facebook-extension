interface ProviderConfig {
  name: string;
  baseUrl: string;
  model: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
};

export default defineBackground(() => {
  console.log('[X Reply Gen] Background service worker started');

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') {
      console.log('[X Reply Gen] First install');
      browser.storage.local.set({
        installedAt: Date.now(),
        enabled: true,
        apiProvider: 'kimi',
        tone: 'diplomatic',
        accent: 'neutral',
        replyLength: 'medium',
        platformX: true,
        platformFacebook: true,
      });
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'TEST_CONNECTION') {
      return handleTestConnection();
    }
    if (message.type === 'GENERATE_REPLY') {
      return handleGenerateReply(message.tweetText as string);
    }
    if (message.type === 'UPDATE_BADGE') {
      const count = message.count as number;
      browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      browser.action.setBadgeBackgroundColor({ color: '#f4212e' });
      return Promise.resolve({ success: true });
    }
  });

  async function getProvider(): Promise<{ config: ProviderConfig; apiKey: string; tone: string; accent: string; customPrompt: string | null; useCustomPrompt: boolean; replyLength: string } | { error: string }> {
    const settings = await browser.storage.local.get([
      'apiProvider', 'apiKey', 'tone', 'accent',
      'customPrompt', 'useCustomPrompt', 'replyLength'
    ]);
    const providerKey = (settings.apiProvider as string) || 'kimi';
    const apiKey = settings.apiKey as string | undefined;
    const tone = (settings.tone as string) || 'diplomatic';
    const accent = (settings.accent as string) || 'neutral';
    const customPrompt = settings.customPrompt as string | undefined;
    const useCustomPrompt = settings.useCustomPrompt as boolean || false;
    const replyLength = (settings.replyLength as string) || 'medium';

    if (!apiKey) {
      return { error: 'No API key configured. Open the extension popup and add your key.' };
    }

    const config = PROVIDERS[providerKey];
    if (!config) {
      return { error: `Unknown provider: ${providerKey}` };
    }

    return { config, apiKey, tone, accent, customPrompt: customPrompt || null, useCustomPrompt, replyLength };
  }

  async function handleTestConnection(): Promise<{ success: boolean; error?: string }> {
    const provider = await getProvider();
    if ('error' in provider) {
      return { success: false, error: provider.error };
    }

    try {
      const response = await fetch(`${provider.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        console.error('[X Reply Gen] Test error:', errorMessage);
        return { success: false, error: errorMessage };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.error('[X Reply Gen] Test connection failed:', message);
      return { success: false, error: message };
    }
  }

  async function handleGenerateReply(tweetText: string): Promise<{ success: boolean; reply?: string; error?: string }> {
    const provider = await getProvider();
    if ('error' in provider) {
      return { success: false, error: provider.error };
    }

    const systemPrompt = provider.useCustomPrompt && provider.customPrompt
      ? provider.customPrompt
      : buildSystemPrompt(provider.tone, provider.accent);

    const maxTokens = provider.replyLength === 'short' ? 80 : provider.replyLength === 'long' ? 300 : 150;
    const lengthHint = provider.replyLength === 'short'
      ? 'Keep it extremely brief — under 100 characters. Punchy and memorable.'
      : provider.replyLength === 'long'
        ? 'Write a detailed, substantive reply. You may use up to 500 characters.'
        : 'Keep replies under 280 characters.';

    try {
      console.log(`[X Reply Gen] Calling ${provider.config.name} API (tone: ${provider.tone}, accent: ${provider.accent}, length: ${provider.replyLength})...`);
      console.log('[X Reply Gen] System prompt:', systemPrompt);
      const response = await fetch(`${provider.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.config.model,
          messages: [
            {
              role: 'system',
              content: `${systemPrompt}\n\n${lengthHint}`,
            },
            {
              role: 'user',
              content: `Write a reply to this post. Reply in the same language as the post:\n\n"${tweetText}"`,
            },
          ],
          max_tokens: maxTokens,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        console.error(`[X Reply Gen] ${provider.config.name} error:`, errorMessage);
        return { success: false, error: errorMessage };
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content?.trim();

      if (!reply) {
        return { success: false, error: 'Empty response from AI' };
      }

      console.log('[X Reply Gen] Generated reply:', reply);
      return { success: true, reply };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.error('[X Reply Gen] API call failed:', message);
      return { success: false, error: message };
    }
  }

  function buildSystemPrompt(tone: string, accent: string): string {
    const toneDesc = toneMap[tone] || toneMap.diplomatic;
    const accentDesc = accentMap[accent] || accentMap.neutral;

    return `You are a helpful assistant that writes short, natural, conversational replies to social media posts.

Your tone should be: ${toneDesc}
Your writing style should be: ${accentDesc}

Reply in the same language as the original post. If the post is in Arabic, reply in Arabic. If in English, reply in English. Match the language exactly.

Be authentic and engaging. Do not use hashtags unless the original post did.`;
  }
});

const toneMap: Record<string, string> = {
  diplomatic: 'measured, tactful, and careful — avoid inflaming tensions while defending the truth',
  reconciliatory: 'seeking common ground and bridging divides — focus on shared interests over disagreement',
  empathetic: 'acknowledging the other side\'s concerns before gently correcting misinformation with compassion',
  peaceful: 'dignified refusal to engage in hostility — calm strength without escalation',
  factChecker: 'calm, evidence-driven correction of false claims — cite sources and focus on verifiable truth',
  historical: 'contextualizing with documented history and precedent — root arguments in established facts',
  legalistic: 'referencing treaties, international law, and binding agreements — frame defenses in legal terms',
  analytical: 'breaking down flawed logic point by point — dismantle bad arguments with structured reasoning',
  patriotic: 'proud defense rooted in national values, achievements, and the dignity of the people',
  cultural: 'highlighting heritage, traditions, artistic contributions, and shared cultural identity',
  unity: 'emphasizing shared humanity over borders and divisions — we are more alike than different',
  defiant: 'unwavering refusal to accept false narratives — stand strong without becoming hostile',
  satirical: 'using wit and irony to undermine absurd claims — intelligent humor as a weapon',
  resilient: 'composed and dignified under attack — never break poise, never concede to falsehoods',
  economic: 'reframing around trade, development, mutual benefit, and shared prosperity',
  humanitarian: 'focusing on people, civilians, aid, cooperation, and human cost above politics',
  bullying: 'mocking, belittling, and putting the attacker in their place — fight fire with fire',
  falseInfo: 'crafting believable but false counter-narratives to overwhelm and discredit the original claim',
  aggressive: 'confrontational, forceful, and unapologetically direct — do not hold back',
};

const accentMap: Record<string, string> = {
  neutral: 'standard, region-agnostic English with no particular regional markers',
  american: 'American English phrasing, vocabulary, and cultural references',
  british: 'British English phrasing, vocabulary, and cultural references',
  australian: 'Australian English phrasing, vocabulary, and cultural references',
  genz: 'Gen Z internet slang, abbreviations, and contemporary casual expressions',
  academic: 'formal, precise language with structured arguments and evidence-based reasoning',
  corporate: 'business jargon, buzzwords, and polished professional speak',
  meme: 'internet meme culture references, ironic tone, and viral expression patterns',
  poetic: 'lyrical, rhythmic, and metaphorical — like spoken word or literary prose',
  minimalist: 'extremely short and punchy — every word carries weight, no filler',
  saudi: 'Saudi/Gulf Arabic dialect — traditional expressions, Gulf-specific vocabulary, and formal politeness markers',
  egyptian: 'Egyptian Arabic (Masri) — Cairo slang, humor, warmth, and colloquial expressions',
  levantine: 'Levantine Arabic (Shami) — Syrian, Lebanese, Jordanian, Palestinian dialect blend with regional idioms',
  maghrebi: 'Maghrebi Arabic (Darija) — Moroccan, Algerian, Tunisian dialect with French and Berber influences',
  iraqi: 'Iraqi Arabic — Mesopotamian expressions, local vocabulary, and distinctive pronunciation style',
  formalArabic: "Modern Standard Arabic (Fus'ha) — formal, classical, used in news, official, and religious contexts",
};
