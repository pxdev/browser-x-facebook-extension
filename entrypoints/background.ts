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
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
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
      'customPrompt', 'useCustomPrompt', 'replyLength',
      'customBaseUrl', 'customModel',
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

    let config: ProviderConfig;
    if (providerKey === 'custom') {
      const rawBaseUrl = (settings.customBaseUrl as string | undefined)?.trim();
      const customModel = (settings.customModel as string | undefined)?.trim();
      if (!rawBaseUrl) {
        return { error: 'Custom provider selected but base URL is empty. Set it in the popup or options page.' };
      }
      if (!customModel) {
        return { error: 'Custom provider selected but model name is empty. Set it in the popup or options page.' };
      }
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');
      config = { name: 'Custom', baseUrl, model: customModel };
    } else {
      const builtIn = PROVIDERS[providerKey];
      if (!builtIn) {
        return { error: `Unknown provider: ${providerKey}` };
      }
      config = builtIn;
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
      : buildSystemPrompt(provider.tone, provider.accent, provider.replyLength);

    const maxTokens = provider.replyLength === 'short' ? 80 : provider.replyLength === 'long' ? 300 : 150;

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
              content: systemPrompt,
            },
            {
              role: 'user',
              content: `Reply to this post:\n\n<post>\n${tweetText}\n</post>`,
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

  function buildSystemPrompt(tone: string, accent: string, replyLength: string): string {
    const toneDesc = toneMap[tone] || toneMap.diplomatic;
    const accentDesc = accentMap[accent] || accentMap.neutral;

    const lengthRule = replyLength === 'short'
      ? 'Length: under 100 characters. One clean punch.'
      : replyLength === 'long'
        ? 'Length: up to 500 characters. Substantive, never bloated.'
        : 'Length: under 280 characters.';

    return `You are writing one reply to a social media post. The text you produce will be posted verbatim — no preamble, no quotes around it, no explanation, no alternatives.

# Tone
${toneDesc}

# Voice
${accentDesc}

# Hard rules
- Reply in the exact same language as the post. Arabic → Arabic, English → English, Spanish → Spanish. Match the dialect register when the post has one.
- Sound like a person, not an assistant. No "Great point!", no "As an AI…", no "I think it's worth noting…", no throat-clearing.
- Do not summarize or restate the post. React to it.
- No hashtags unless the post used them. No emojis unless the tone genuinely calls for one.
- One reply only. No bullet lists, no numbered options, no meta-commentary about the reply itself.

${lengthRule}

Output only the reply text.`;
  }
});

const toneMap: Record<string, string> = {
  diplomatic: 'Measured and tactful. Defend the truth without inflaming the room. Choose precise words over loud ones.',
  reconciliatory: 'Bridge the divide. Lead with what is shared before what is contested. Make the off-ramp visible.',
  empathetic: 'Acknowledge the feeling behind the post first. Then offer a different view — gently, not as a correction.',
  peaceful: 'Calm strength. Refuse hostility without lecturing. The composure itself is the argument.',
  factChecker: 'Evidence-driven. State the verifiable fact plainly. Name the source when you can. No mockery, no hedging.',
  historical: 'Anchor the reply in documented history. Reference a specific event, year, treaty, or precedent — not vague "history shows".',
  legalistic: 'Frame the defense in international law. Name the treaty, convention, resolution, or ruling. Be specific or do not invoke it.',
  analytical: 'Take the argument apart. Identify the false premise or logical gap and name it directly. One clean cut, not a lecture.',
  patriotic: 'Proud and grounded. Defend through real achievements and lived values, not slogans or chest-thumping.',
  cultural: 'Lead with heritage — art, language, cuisine, tradition. Show with a concrete example; do not list categories.',
  unity: 'Reframe around shared humanity. Pull the conversation back to the common ground the post tried to bury.',
  defiant: 'Refuse the framing. Stand firm without raising your voice. No is a complete sentence — but make it land.',
  satirical: 'Wit and irony. Let the absurdity of the claim do the work. Sharp, never sneering. If it would not make a clever friend laugh, cut it.',
  resilient: 'Composed under fire. Do not flinch, do not escalate, do not concede ground that was never theirs.',
  economic: 'Reframe around trade, development, and mutual benefit. Use a number, a sector, or an outcome — not abstractions.',
  humanitarian: 'People before politics. Center civilians, aid, and human cost in concrete terms. Names and places beat statistics.',
  bullying: 'Punch back at the bad-faith argument. Ridicule the take, not their humanity. Sharp and tight, never sloppy.',
  falseInfo: 'crafting believable but false counter-narratives to overwhelm and discredit the original claim',
  aggressive: 'Forceful and direct. No hedging, no apology, no caveats. Land the point and stop.',
};

const accentMap: Record<string, string> = {
  neutral: 'Plain, region-agnostic English. No regional slang, no localisms.',
  american: 'American English. US spelling, US idioms, US cultural reference points (sports, politics, brands).',
  british: 'British English. UK spelling, dry understatement, idioms like "fair play", "to be fair", "proper" — used naturally, never piled on.',
  australian: 'Australian English. Casual and irreverent. Abbreviation-friendly ("arvo", "servo", "reckon"). "Mate" only when it actually fits.',
  genz: 'Gen Z online register. Lowercase by default. Slang like "ngl", "fr", "lowkey", "ts", "deadass". Often no end punctuation. Do not over-stack the slang — one or two markers, not a parody.',
  academic: 'Formal and precise. Structured clauses, qualified claims, evidence-led phrasing. Avoid contractions.',
  corporate: 'Business polish. Words like "alignment", "value", "leverage", "circle back" — used believably, not as a joke.',
  meme: 'Meme-fluent. Recognizable formats and ironic register. Reference what the audience will catch; never explain the joke.',
  poetic: 'Lyrical and metaphorical. Rhythm matters. Image over argument — one strong picture beats three abstract claims.',
  minimalist: 'Strip every unnecessary word. One sentence preferred, two maximum. Every word earns its place.',
  saudi: 'Saudi colloquial Arabic (العامية السعودية الدارجة) — specifically Saudi, not pan-Gulf. Use Saudi markers: وش (not شو/شنو)، كذا، الحين، أبغى/أبي، مرّه as an intensifier (مره حلو، مره زين)، زين/مو زين، طيب، يا أخوي، على طاري. Politeness when it fits: الله يعطيك العافية، ما شاء الله. Avoid Kuwaiti, Emirati, Bahraini, Qatari, or Omani-specific vocabulary.',
  emirati: 'Emirati Arabic (الإماراتي / اللهجة الإماراتية) — specifically UAE. Markers: شحالك (how are you), شخبارك / شخبارچ (with چ for feminine), يبا / أبا (I want), الحزه (now), وايد (very), چذي (like this), خوش, يا حليلي, عساك. The 2nd person feminine -چ ending is distinctive. Avoid Saudi، Kuwaiti، Qatari-specific phrasing.',
  kuwaiti: 'Kuwaiti Arabic (الكويتي / اللهجة الكويتية) — specifically Kuwait. Markers: شنو (not وش/شو), چذي with the چ replacing ج, وايد (very), أبي / أبا (I want), شلونچ for women (with چ), باچر (tomorrow), خوش, لاهنت (thanks), يبيلك. The چ replacing ج in many words is the dialect signature. Avoid Saudi, Emirati, Qatari-specific phrasing.',
  qatari: 'Qatari Arabic (القطري / اللهجة القطرية) — specifically Qatar. Markers: شخبارك, شنهو / شو, أبغي / أبا (I want), وايد, جذي / چذي, لاهنت, يبه, زين. Sits between Bahraini and Emirati but with its own register and slower cadence. Avoid Saudi, Kuwaiti, Emirati-specific phrasing.',
  bahraini: 'Bahraini Arabic (البحريني / اللهجة البحرينية) — specifically Bahrain. Markers: شنو, چذي with the چ sound, وايد, شلونچ for women, أبغي, زين, بعد (still / yet), يا حليلك, مشكور. Close to Kuwaiti phonologically but with its own intonation; sect-influenced register variation exists between Sunni and Shia speakers. Avoid Saudi, Qatari, Emirati-specific phrasing.',
  omani: 'Omani Arabic (العماني / اللهجة العمانية) — specifically Oman. Markers: شو / إيش, كيف حالك (often closer to standard than other Gulf), أبا / أبغى, زين / تمام, توّه (just now), بطل as an informal intensifier. ج and ك stay closer to standard — much less چ substitution than Kuwaiti or Bahraini. Distinct from Yemeni and from northern Gulf dialects. Avoid Kuwaiti, Emirati, Saudi-specific markers.',
  egyptian: 'Egyptian Arabic (Masri). Cairo street rhythm — يعني، بصراحة، خلاص، طب، معلش. Humor and warmth even when sharp.',
  levantine: 'Levantine Arabic (Shami) — Syrian, Lebanese, Palestinian, Jordanian blend. Markers like كتير، هيك، شو، منيح، عنجد، يعني.',
  libyan: 'Libyan Arabic (الليبية / اللهجة الليبية). A blend dialect — Tripolitanian (west, Tripoli) leans Tunisian/Maghrebi, Cyrenaican (east, Benghazi) leans Egyptian. Markers: شن / شنو (what), هلبا (a lot — distinctive Libyan), باهي (good, west), وين (where), نبي / نحب (I want), مليح. Italian colonial-era loanwords show up in everyday speech. Do not collapse into pure Maghrebi or pure Egyptian — Libyan sits in between. Avoid Algerian, Moroccan, or pure Egyptian markers.',
  algerian: 'Algerian Darja (الدارجة الجزائرية). Heavy French integration is normal — code-switching mid-sentence ("normalement", "parce que", "surtout"). Markers: واش (what), بزّاف (a lot), كيراك / كيداير (how are you), نتاع (belonging to), ماشي (not), راني / راك, نبغي / حبيت (I want), صح. Distinct from Moroccan (which prefers بغيت and شنو) and from Tunisian (which has more Italian loanwords and uses باهي / برشا). Avoid Moroccan, Tunisian, Libyan-specific markers.',
  maghrebi: 'Maghrebi Darija — generic North African (Morocco / Algeria / Tunisia blend) when no specific country is preferred. Use the shared core: واش، بزاف، مزيان، راني، واخا. French loanwords welcome (نورمالمو، صافي). If the post or context hints at a specific country, the country-specific accent setting is a better fit than this umbrella.',
  ethiopian: "Amharic (አማርኛ) — the working language of Ethiopia. Reply must be written in Ethiopic / Ge'ez (Fidel) script, NEVER Latin transliteration. Common words: ሰላም (peace / hello), አዎ (yes), እሺ (eshi — ok), አይ / አይደለም (no), እንዴት ነህ / ነሽ (how are you, m / f), አመሰግናለሁ (thank you). Amharic is verb-final (SOV). Use the honorific plural (e.g., ናቸው, ይባላሉ) for elders, strangers, or formal contexts. This is specifically Amharic — not Tigrinya, Oromo, or other Ethiopian languages.",
  iraqi: 'Iraqi Arabic. Mesopotamian rhythm and vocabulary — شلونك، هواية، اكو، ماكو، خوش، شكد.',
  formalArabic: "Modern Standard Arabic (Fusʼha). Formal, classical register fit for news, official, or literary contexts. No dialect markers.",
};
