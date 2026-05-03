import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { loadSearchSettings, webSearch, type SearchResult } from '../utils/search';
import { t, initLocale } from '../utils/i18n';
import { labelSource } from '../utils/source-reputation';
import { BUILTIN_PROVIDERS } from '../utils/providers';
import { loadApiKeys } from '../utils/crypto';
import { sha256Hex } from '../utils/text';
import {
  addCapture, listCaptures, deleteCapture, wipeCaptures,
  addNarrativeHit, listNarrativeHits,
  addWatchlist, listWatchlists, deleteWatchlist, addWatchlistHit, markWatchlistRead, totalUnreadHits,
  addReplyHistory,
  type CaptureRow,
} from '../utils/db';

interface ProviderConfig {
  name: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
}

interface FactCheckResult {
  verdict: 'true' | 'false' | 'misleading' | 'unverifiable' | 'needs-context';
  confidence: 'low' | 'medium' | 'high';
  summary: string;
  reasoning: string;
  sources?: Array<{ title: string; url: string; kind?: string; lean?: string; notes?: string }>;
  searchUsed?: boolean;
}

function buildModel(config: ProviderConfig, apiKey: string) {
  const provider = createOpenAICompatible({
    name: config.name,
    baseURL: config.baseUrl,
    apiKey,
  });
  return provider(config.model);
}

async function trackUsage(tokens: number) {
  if (!tokens || tokens <= 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const stored = await browser.storage.local.get(['tokensToday', 'tokensDate']);
  const current = stored.tokensDate === today ? (stored.tokensToday as number ?? 0) : 0;
  await browser.storage.local.set({
    tokensToday: current + tokens,
    tokensDate: today,
  });
}

// ── Retry wrapper ───────────────────────────────────────────────────────────

const lastProviderError = new Map<string, number>();

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('429') || msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('econnrefused');
}

async function withRetry<T>(fn: () => Promise<T>, opts?: { maxRetries?: number; baseDelay?: number; providerKey?: string }): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 2;
  const baseDelay = opts?.baseDelay ?? 1000;
  const providerKey = opts?.providerKey;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (providerKey) lastProviderError.delete(providerKey);
      return result;
    } catch (err) {
      if (attempt === maxRetries || !isRetryableError(err)) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.warn(`[X Reply Gen] Retryable error (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${Math.round(delay)}ms…`);
      if (providerKey) lastProviderError.set(providerKey, Date.now());
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error('Retry exhausted');
}

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

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'generate-reply') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'GENERATE_FOR_FOCUSED' });
    } catch {
      // content script not loaded on this tab
    }
  });

  async function setupContextMenus() {
    if (!browser.contextMenus) return;
    await initLocale();
    try { await browser.contextMenus.removeAll(); } catch { /* ignore */ }
    browser.contextMenus.create({
      id: 'fact-check-page',
      title: t('contextMenu.factCheckPage'),
      contexts: ['page'],
    });
    browser.contextMenus.create({
      id: 'fact-check-selection',
      title: t('contextMenu.factCheckSelection'),
      contexts: ['selection'],
    });
  }

  setupContextMenus();
  browser.storage?.onChanged?.addListener((changes) => {
    if (changes.locale) setupContextMenus();
  });

  browser.contextMenus?.onClicked?.addListener(async (info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId !== 'fact-check-page' && info.menuItemId !== 'fact-check-selection') return;

    let textToCheck = '';
    if (info.menuItemId === 'fact-check-selection' && info.selectionText) {
      textToCheck = info.selectionText.slice(0, 6000);
    } else if (info.menuItemId === 'fact-check-page') {
      try {
        const results = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const article = document.querySelector('article');
            const main = document.querySelector('main');
            const target = article || main || document.body;
            const blocks = target.querySelectorAll('p, h1, h2, h3, li');
            if (blocks.length > 0) {
              return Array.from(blocks)
                .map((el) => (el.textContent || '').trim())
                .filter((s) => s.length > 20)
                .join('\n')
                .slice(0, 6000);
            }
            return (target.textContent || '').trim().slice(0, 6000);
          },
        });
        textToCheck = (results[0]?.result as string) || '';
      } catch (err) {
        console.error('[X Reply Gen] Page extraction failed:', err);
        return;
      }
    }
    if (!textToCheck.trim()) {
      console.warn('[X Reply Gen] Fact-check skipped: no extractable text on page or selection.');
      return;
    }

    try {
      await browser.action.setBadgeText({ text: '…', tabId: tab.id });
      await browser.action.setBadgeBackgroundColor({ color: '#1d9bf0', tabId: tab.id });
    } catch { /* ignore */ }

    const result = await handleFactCheck(textToCheck);

    try { await browser.action.setBadgeText({ text: '', tabId: tab.id }); } catch { /* ignore */ }

    if (!result.success || !result.result) {
      console.error('[X Reply Gen] Fact-check failed:', result.error);
      return;
    }

    const strings = {
      close: t('factCheck.close'),
      confidenceLabel: t('factCheck.confidence'),
      sources: t('factCheck.sources'),
      searchUsed: t('factCheck.searchUsed'),
      disclaimer: t('factCheck.disclaimer'),
      disclaimerSearch: t('factCheck.disclaimerSearch'),
      verdicts: {
        'true': t('factCheck.verdict.true'),
        'false': t('factCheck.verdict.false'),
        'misleading': t('factCheck.verdict.misleading'),
        'unverifiable': t('factCheck.verdict.unverifiable'),
        'needs-context': t('factCheck.verdict.needsContext'),
      },
      confidenceMap: {
        low: t('factCheck.confidenceLow'),
        medium: t('factCheck.confidenceMedium'),
        high: t('factCheck.confidenceHigh'),
      },
    };

    try {
      await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectFactCheckPopoverFn,
        args: [result.result as any, strings as any],
      });
    } catch (err) {
      console.error('[X Reply Gen] Popover injection failed:', err);
    }
  });

  // Self-contained popover injector — runs in the page's world, no closures.
  function injectFactCheckPopoverFn(result: any, strings: any) {
    document.getElementById('x-reply-gen-fact')?.remove();

    const verdictStyles: Record<string, { bg: string; border: string; text: string }> = {
      'true': { bg: '#d1f4e0', border: '#00ba7c', text: '#00574a' },
      'false': { bg: '#fde4e6', border: '#f4212e', text: '#a01018' },
      'misleading': { bg: '#fff5d6', border: '#ffb700', text: '#7a5500' },
      'unverifiable': { bg: '#e8eef2', border: '#71767b', text: '#3a4148' },
      'needs-context': { bg: '#dceeff', border: '#1d9bf0', text: '#0a4a7a' },
    };
    const v = verdictStyles[result.verdict] || verdictStyles['unverifiable'];

    const escapeHtml = (s: string) => {
      const div = document.createElement('div');
      div.textContent = s;
      return div.innerHTML;
    };

    const popover = document.createElement('div');
    popover.id = 'x-reply-gen-fact';
    popover.style.cssText = [
      'position: fixed',
      'top: 60px',
      'right: 20px',
      'z-index: 2147483647',
      'background: #ffffff',
      'border: 1px solid #eff3f4',
      'border-radius: 14px',
      'padding: 14px 16px',
      'box-shadow: 0 16px 48px rgba(15, 20, 25, 0.22)',
      'width: 380px',
      'max-height: 75vh',
      'overflow-y: auto',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif',
      'color: #0f1419',
      'font-size: 13px',
      'line-height: 1.5',
    ].join(';');

    const verdictLabel = strings.verdicts[result.verdict] || strings.verdicts['unverifiable'];
    const confidenceLabel = strings.confidenceMap[result.confidence] || result.confidence;
    const disclaimerText = result.searchUsed ? strings.disclaimerSearch : strings.disclaimer;

    const kindPalette: Record<string, { bg: string; fg: string; border: string }> = {
      news: { bg: '#dceeff', fg: '#0a4a7a', border: '#1d9bf0' },
      wiki: { bg: '#eef2f7', fg: '#3a4148', border: '#71767b' },
      'state-affiliated': { bg: '#fff5d6', fg: '#7a5500', border: '#ffb700' },
      official: { bg: '#d1f4e0', fg: '#00574a', border: '#00ba7c' },
      'fact-check': { bg: '#e8e1ff', fg: '#3b1f8a', border: '#7a5af8' },
      academic: { bg: '#dff4f4', fg: '#1f5e5e', border: '#3aa6a6' },
      blog: { bg: '#f7e9d6', fg: '#7a4a00', border: '#d49146' },
      social: { bg: '#fde4e6', fg: '#a01018', border: '#f4212e' },
      forum: { bg: '#fde4e6', fg: '#a01018', border: '#f4212e' },
      unknown: { bg: '#eff3f4', fg: '#536471', border: '#cfd9de' },
    };
    const leanLabel: Record<string, string> = { left: 'L', 'center-left': 'CL', center: 'C', 'center-right': 'CR', right: 'R', mixed: 'M' };
    const renderChip = (kind: string, lean?: string, notes?: string) => {
      const p = kindPalette[kind] || kindPalette.unknown;
      const kindLabel = kind === 'state-affiliated' ? 'state' : kind;
      const leanPart = lean ? ` · ${leanLabel[lean] || lean}` : '';
      const titleAttr = notes ? ` title="${escapeHtml(notes)}"` : '';
      return '<span' + titleAttr + ' style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;padding:1px 6px;border-radius:999px;background:' + p.bg + ';color:' + p.fg + ';border:1px solid ' + p.border + ';margin-right:6px;flex-shrink:0;">' + escapeHtml(kindLabel) + leanPart + '</span>';
    };

    const sourcesHtml = (result.sources && result.sources.length > 0)
      ? '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eff3f4;">'
        + '<div style="font-size:10px;font-weight:700;color:#536471;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">'
        + escapeHtml(strings.sources) + ' (' + result.sources.length + ')'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;">'
        + result.sources.map((s: any) =>
          '<div style="display:flex;align-items:center;gap:0;line-height:1.4;">'
          + renderChip(s.kind || 'unknown', s.lean, s.notes)
          + '<a href="' + escapeHtml(s.url) + '" target="_blank" rel="noopener noreferrer" '
          + 'style="font-size:12px;color:#1d9bf0;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          + escapeHtml(s.title || s.url)
          + '</a></div>'
        ).join('')
        + '</div></div>'
      : '';

    const searchBadge = result.searchUsed
      ? '<span style="font-size:10px;color:#00ba7c;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">🔎 '
        + escapeHtml(strings.searchUsed) + '</span>'
      : '';

    popover.innerHTML =
      '<button id="x-reply-gen-fact-close" style="position:absolute;top:10px;right:10px;background:transparent;border:none;color:#536471;cursor:pointer;font-size:18px;line-height:1;padding:4px 8px;border-radius:6px;">×</button>'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;padding-right:32px;">'
      + '<span style="background:' + v.bg + ';border:1px solid ' + v.border + ';color:' + v.text + ';padding:5px 12px;border-radius:999px;font-weight:700;font-size:12px;letter-spacing:0.02em;">'
      + escapeHtml(verdictLabel) + '</span>'
      + '<span style="font-size:11px;color:#536471;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">'
      + escapeHtml(strings.confidenceLabel) + ': ' + escapeHtml(confidenceLabel) + '</span>'
      + searchBadge
      + '</div>'
      + '<div style="font-weight:600;margin-bottom:10px;color:#0f1419;font-size:14px;line-height:1.45;">'
      + escapeHtml(result.summary) + '</div>'
      + '<div style="color:#536471;font-size:12.5px;line-height:1.6;margin-bottom:0;">'
      + escapeHtml(result.reasoning) + '</div>'
      + sourcesHtml
      + '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eff3f4;color:#71767b;font-size:11px;line-height:1.45;">'
      + '⚠ ' + escapeHtml(disclaimerText) + '</div>';

    document.body.appendChild(popover);

    const dismiss = () => { popover.remove(); document.removeEventListener('mousedown', outsideHandler, true); };
    function outsideHandler(e: MouseEvent) {
      if (!popover.contains(e.target as Node)) dismiss();
    }
    popover.querySelector('#x-reply-gen-fact-close')?.addEventListener('click', dismiss);
    setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 100);
  }

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'generate-stream') return;
    port.onMessage.addListener((msg: any) => {
      if (msg?.type === 'GENERATE_REPLY_STREAM') {
        streamGenerateReply(
          port,
          msg.tweetText as string,
          msg.parentText as string | undefined,
          msg.images as string[] | undefined,
        );
      }
    });
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.type === 'TEST_CONNECTION') {
      return handleTestConnection();
    }
    if (message.type === 'GENERATE_REPLY') {
      return handleGenerateReply(
        message.tweetText as string,
        message.parentText as string | undefined,
        message.images as string[] | undefined,
      );
    }
    if (message.type === 'FACT_CHECK_POST') {
      return handleFactCheck(message.postText as string);
    }
    if (message.type === 'UPDATE_BADGE') {
      const count = message.count as number;
      browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      browser.action.setBadgeBackgroundColor({ color: '#f4212e' });
      return Promise.resolve({ success: true });
    }
    if (message.type === 'ARCHIVE_URL') {
      return handleArchiveUrl(message.url as string);
    }
    if (message.type === 'LABEL_SOURCES') {
      const urls = (message.urls as string[]) || [];
      return Promise.resolve({ success: true, labels: urls.map((u) => ({ url: u, ...labelSource(u) })) });
    }
    if (message.type === 'EXTRACT_CLAIMS') {
      return handleExtractClaims(message.postText as string);
    }
    if (message.type === 'ANALYZE_REPLIES') {
      return handleAnalyzeReplies(message.replies as string[]);
    }
    if (message.type === 'BOT_SCORE') {
      return Promise.resolve({ success: true, ...computeBotScore(message.features ?? {}) });
    }
    if (message.type === 'CAPTURE_SAVE') {
      return addCapture(message.row as Omit<CaptureRow, 'id'>).then((id) => ({ success: true, id }));
    }
    if (message.type === 'CAPTURE_LIST') {
      return listCaptures(message.limit as number | undefined).then((rows) => ({ success: true, rows }));
    }
    if (message.type === 'CAPTURE_DELETE') {
      return deleteCapture(message.id as number).then(() => ({ success: true }));
    }
    if (message.type === 'CAPTURE_WIPE') {
      return wipeCaptures().then(() => ({ success: true }));
    }
    if (message.type === 'CAPTURE_SCREENSHOT') {
      return handleCaptureScreenshot(message.id as number);
    }
    if (message.type === 'WATCHLIST_LIST') {
      return listWatchlists().then((rows) => ({ success: true, rows }));
    }
    if (message.type === 'WATCHLIST_ADD') {
      const { kind, value } = message;
      return addWatchlist({ kind, value, createdAt: Date.now(), unreadHits: 0 }).then(async (id) => {
        await syncWatchlistsCache();
        return { success: true, id };
      });
    }
    if (message.type === 'WATCHLIST_DELETE') {
      return deleteWatchlist(message.id as number).then(async () => {
        await syncWatchlistsCache();
        await refreshUnreadBadge();
        return { success: true };
      });
    }
    if (message.type === 'WATCHLIST_HIT') {
      return addWatchlistHit(message.row).then(async (id) => {
        await syncWatchlistsCache();
        await refreshUnreadBadge();
        return { success: true, id };
      });
    }
    if (message.type === 'WATCHLIST_READ') {
      return markWatchlistRead(message.id as number).then(async () => {
        await syncWatchlistsCache();
        await refreshUnreadBadge();
        return { success: true };
      });
    }
    if (message.type === 'WATCHLIST_HITS') {
      return browser.storage.local.get(['watchlistsCache']).then(() => {
        return import('../utils/db').then(async ({ getDb }) => {
          const db = await getDb();
          const tx = db.transaction('watchlistHits', 'readonly');
          const idx = tx.store.index('by-watchlist');
          const out: any[] = [];
          let cursor = await idx.openCursor(IDBKeyRange.only(message.watchlistId as number), 'prev');
          while (cursor && out.length < 200) {
            out.push(cursor.value);
            cursor = await cursor.continue();
          }
          return { success: true, rows: out };
        });
      });
    }
    if (message.type === 'NARRATIVE_HIT') {
      return addNarrativeHit(message.row).then((id) => ({ success: true, id }));
    }
    if (message.type === 'NARRATIVE_LIST') {
      return listNarrativeHits(message.opts || {}).then((rows) => ({ success: true, rows }));
    }
  });

  async function syncWatchlistsCache(): Promise<void> {
    try {
      const rows = await listWatchlists();
      await browser.storage.local.set({
        watchlistsCache: rows.map((r) => ({ id: r.id, kind: r.kind, value: r.value.toLowerCase() })),
      });
    } catch (err) {
      console.warn('[X Reply Gen] Failed to sync watchlist cache:', err);
    }
  }

  syncWatchlistsCache();

  async function refreshUnreadBadge(): Promise<void> {
    try {
      const count = await totalUnreadHits();
      await browser.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      await browser.action.setBadgeBackgroundColor({ color: '#f4212e' });
    } catch { /* ignore */ }
  }

  async function handleArchiveUrl(url: string): Promise<{ success: boolean; wayback?: string; archiveToday?: string; error?: string }> {
    if (!url) return { success: false, error: 'No URL provided' };
    let waybackUrl: string | undefined;
    let archiveTodayUrl: string | undefined;
    try {
      const resp = await fetch(`https://web.archive.org/save/${encodeURIComponent(url)}`, { method: 'GET', redirect: 'follow' });
      const finalUrl = resp.url || '';
      if (finalUrl.includes('web.archive.org/web/')) {
        waybackUrl = finalUrl;
      } else {
        waybackUrl = `https://web.archive.org/web/${url}`;
      }
    } catch (err) {
      console.warn('[X Reply Gen] Wayback save failed:', err);
    }
    archiveTodayUrl = `https://archive.ph/?run=1&url=${encodeURIComponent(url)}`;
    return { success: !!(waybackUrl || archiveTodayUrl), wayback: waybackUrl, archiveToday: archiveTodayUrl };
  }

  async function handleCaptureScreenshot(id: number): Promise<{ success: boolean; error?: string }> {
    try {
      const dataUrl = await browser.tabs.captureVisibleTab({ format: 'png' });
      const db = await import('../utils/db').then(({ getDb }) => getDb());
      const row = await db.get('captures', id);
      if (!row) return { success: false, error: 'Capture not found' };
      row.screenshotData = dataUrl;
      await db.put('captures', row);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Screenshot failed';
      return { success: false, error: msg };
    }
  }

  async function handleExtractClaims(postText: string): Promise<{ success: boolean; claims?: Array<{ text: string; type: 'factual' | 'opinion'; confidence: 'low' | 'medium' | 'high' }>; error?: string }> {
    const provider = await getProvider();
    if ('error' in provider) return { success: false, error: provider.error };
    const model = buildModel(provider.config, provider.apiKey);
    const system = `You split a social-media post into individual claims. For each claim, decide if it is "factual" (could be checked against evidence) or "opinion" (a value judgment, prediction, or feeling).

Output ONLY a JSON object — no other text, no markdown fences:
{ "claims": [{ "text": "claim verbatim or tightly paraphrased", "type": "factual" | "opinion", "confidence": "low" | "medium" | "high" }] }

Reply in the same language as the post.`;
    try {
      const { text, usage } = await withRetry(() => generateText({
        model,
        system,
        prompt: `Post:\n\n<post>\n${postText}\n</post>`,
        maxOutputTokens: 800,
        temperature: 0.2,
      }), { providerKey: provider.config.name });
      await trackUsage(usage.totalTokens ?? 0);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { success: false, error: 'Could not parse claims response' };
      const parsed = JSON.parse(match[0]);
      const claims = Array.isArray(parsed.claims) ? parsed.claims : [];
      return { success: true, claims };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Claim extraction failed';
      return { success: false, error: message };
    }
  }

  async function handleAnalyzeReplies(replies: string[]): Promise<{ success: boolean; sentiment?: { positive: number; negative: number; neutral: number; hostile: number }; topics?: Array<{ label: string; count: number }>; error?: string }> {
    if (!replies?.length) return { success: false, error: 'No replies supplied' };
    const provider = await getProvider();
    if ('error' in provider) return { success: false, error: provider.error };
    const model = buildModel(provider.config, provider.apiKey);
    const sample = replies.slice(0, 30).map((r, i) => `${i + 1}. ${r.slice(0, 280)}`).join('\n');
    const system = `You classify a sample of replies to a social-media post. Output ONLY JSON — no markdown fences:
{
  "sentiment": { "positive": <int>, "negative": <int>, "neutral": <int>, "hostile": <int> },
  "topics": [ { "label": "short topic name", "count": <int> } ]
}
- Counts must sum to the number of replies you saw.
- "hostile" means abusive / personal attack / threat — distinct from "negative" disagreement.
- Topics: 3 to 5 buckets, ordered by count desc.`;
    try {
      const { text, usage } = await withRetry(() => generateText({
        model,
        system,
        prompt: `Replies (${replies.length}):\n${sample}`,
        maxOutputTokens: 600,
        temperature: 0.2,
      }), { providerKey: provider.config.name });
      await trackUsage(usage.totalTokens ?? 0);
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return { success: false, error: 'Could not parse analysis' };
      const parsed = JSON.parse(match[0]);
      return { success: true, sentiment: parsed.sentiment, topics: parsed.topics };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reply analysis failed';
      return { success: false, error: message };
    }
  }

  function computeBotScore(features: { defaultAvatar?: boolean; handleEntropy?: number; accountAgeDays?: number; followerToFollowingRatio?: number; postsPerDay?: number; verifiedKind?: 'none' | 'paid' | 'legacy' | 'gov' }): { score: number; signals: string[] } {
    const signals: string[] = [];
    let score = 0;
    if (features.defaultAvatar) { score += 25; signals.push('Default avatar'); }
    if ((features.handleEntropy ?? 0) > 3.5) { score += 15; signals.push('Random-looking handle'); }
    if ((features.accountAgeDays ?? 9999) < 30) { score += 25; signals.push(`Account age < 30 days (${features.accountAgeDays}d)`); }
    if ((features.accountAgeDays ?? 9999) < 7) { score += 10; signals.push('Account < 7 days old'); }
    if ((features.followerToFollowingRatio ?? 1) < 0.05) { score += 10; signals.push('Following >> followers'); }
    if ((features.postsPerDay ?? 0) > 50) { score += 15; signals.push(`High posting cadence (${Math.round(features.postsPerDay!)}/day)`); }
    if (features.verifiedKind === 'paid' && (features.accountAgeDays ?? 9999) < 90) { score += 5; signals.push('Recent paid verified'); }
    return { score: Math.min(100, score), signals };
  }

  async function getProvider(): Promise<{ config: ProviderConfig; apiKey: string; tone: string; accent: string; customPrompt: string | null; useCustomPrompt: boolean; replyLength: string } | { error: string }> {
    const settings = await browser.storage.local.get([
      'apiProvider', 'apiKey', 'apiKeys', 'tone', 'accent',
      'customPrompt', 'useCustomPrompt', 'replyLength',
      'customBaseUrl', 'customModel', 'customSupportsVision',
    ]);
    const providerKey = (settings.apiProvider as string) || 'kimi';

    // Load encrypted API keys (with auto-migration from plaintext)
    const keysResult = await loadApiKeys();
    let apiKey: string | undefined = keysResult.keys[providerKey]?.trim();
    if (!apiKey) {
      const legacyApiKey = settings.apiKey as string | undefined;
      apiKey = legacyApiKey?.trim();
    }

    const tone = (settings.tone as string) || 'diplomatic';
    const accent = (settings.accent as string) || 'neutral';
    const customPrompt = settings.customPrompt as string | undefined;
    const useCustomPrompt = settings.useCustomPrompt as boolean || false;
    const replyLength = (settings.replyLength as string) || 'medium';

    if (providerKey === 'ollama' && !apiKey) {
      apiKey = 'ollama';
    }

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
      const supportsVision = !!settings.customSupportsVision;
      config = { name: 'Custom', baseUrl, model: customModel, supportsVision };
    } else if (providerKey === 'ollama') {
      const rawBaseUrl = (settings.customBaseUrl as string | undefined)?.trim() || 'http://localhost:11434/v1';
      const model = (settings.customModel as string | undefined)?.trim() || 'llama3.1';
      const supportsVision = !!settings.customSupportsVision;
      const baseUrl = rawBaseUrl.replace(/\/+$/, '');
      config = { name: 'Ollama', baseUrl, model, supportsVision };
    } else {
      const builtIn = BUILTIN_PROVIDERS[providerKey];
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
      const model = buildModel(provider.config, provider.apiKey);
      await withRetry(() => generateText({
        model,
        prompt: 'ping',
        maxOutputTokens: 1,
      }), { providerKey: provider.config.name, maxRetries: 1 });
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.error('[X Reply Gen] Test connection failed:', message);
      return { success: false, error: message };
    }
  }

  function buildUserMessage(tweetText: string, parentText?: string): string {
    return parentText
      ? `Reply to <post>. <parent_post> is the post that <post> is itself replying to — use it for context only; your reply goes to <post>, not <parent_post>.\n\n<parent_post>\n${parentText}\n</parent_post>\n\n<post>\n${tweetText}\n</post>`
      : `Reply to this post:\n\n<post>\n${tweetText}\n</post>`;
  }

  function buildUserContent(text: string, images: string[] | undefined, supportsVision: boolean): any {
    if (!supportsVision || !images || images.length === 0) return text;
    const imageParts: Array<{ type: string; image: URL }> = [];
    for (const url of images.slice(0, 4)) {
      try {
        imageParts.push({ type: 'image', image: new URL(url) });
      } catch {
        // Skip malformed image URLs
      }
    }
    return [{ type: 'text', text }, ...imageParts];
  }

  function resolveSystemPrompt(provider: { useCustomPrompt: boolean; customPrompt: string | null; tone: string; accent: string; replyLength: string }): string {
    return provider.useCustomPrompt && provider.customPrompt
      ? provider.customPrompt
      : buildSystemPrompt(provider.tone, provider.accent, provider.replyLength);
  }

  function maxTokensFor(replyLength: string): number {
    return replyLength === 'short' ? 80 : replyLength === 'long' ? 300 : 150;
  }

  async function handleGenerateReply(tweetText: string, parentText?: string, images?: string[]): Promise<{ success: boolean; reply?: string; replies?: string[]; error?: string }> {
    const provider = await getProvider();
    if ('error' in provider) {
      return { success: false, error: provider.error };
    }

    const systemPrompt = resolveSystemPrompt(provider);
    const userMessage = buildUserMessage(tweetText, parentText);
    const maxOutputTokens = maxTokensFor(provider.replyLength);
    const userContent = buildUserContent(userMessage, images, provider.config.supportsVision);

    const flags = await browser.storage.local.get(['variations']);
    const variations = (flags.variations as boolean | undefined) ?? false;
    const model = buildModel(provider.config, provider.apiKey);

    try {
      const imageCount = (images?.length && provider.config.supportsVision) ? images.length : 0;
      console.log(`[X Reply Gen] Calling ${provider.config.name} (tone: ${provider.tone}, accent: ${provider.accent}, length: ${provider.replyLength}${variations ? ', variations: 3' : ''}${imageCount ? `, images: ${imageCount}` : ''})`);

      if (variations) {
        const runs = await Promise.all([0, 1, 2].map(() => withRetry(() => generateText({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          maxOutputTokens,
          temperature: 0.9,
        }), { providerKey: provider.config.name })));
        const replies = runs.map((r) => r.text.trim()).filter(Boolean);
        if (replies.length === 0) return { success: false, error: 'Empty response from AI' };
        const totalTokens = runs.reduce((sum, r) => sum + (r.usage.totalTokens ?? 0), 0);
        await trackUsage(totalTokens);
        // Save to reply history
        if (replies[0]) {
          await addReplyHistory({
            ts: Date.now(),
            platform: 'x',
            postTextHash: await sha256Hex(tweetText),
            reply: replies[0],
            tone: provider.tone,
            accent: provider.accent,
            provider: provider.config.name,
          }).catch(() => { /* ignore */ });
        }
        if (replies.length > 1) return { success: true, replies };
        return { success: true, reply: replies[0] };
      }

      const { text, usage } = await withRetry(() => generateText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxOutputTokens,
        temperature: 0.8,
      }), { providerKey: provider.config.name });
      const reply = text.trim();
      if (!reply) return { success: false, error: 'Empty response from AI' };
      await trackUsage(usage.totalTokens ?? 0);
      // Save to reply history
      await addReplyHistory({
        ts: Date.now(),
        platform: 'x',
        postTextHash: await sha256Hex(tweetText),
        reply,
        tone: provider.tone,
        accent: provider.accent,
        provider: provider.config.name,
      }).catch(() => { /* ignore */ });
      return { success: true, reply };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      console.error('[X Reply Gen] API call failed:', message);
      return { success: false, error: message };
    }
  }

  async function streamGenerateReply(port: any, tweetText: string, parentText?: string, images?: string[]) {
    const provider = await getProvider();
    if ('error' in provider) {
      port.postMessage({ type: 'error', error: provider.error });
      port.disconnect();
      return;
    }

    const systemPrompt = resolveSystemPrompt(provider);
    const userMessage = buildUserMessage(tweetText, parentText);
    const maxOutputTokens = maxTokensFor(provider.replyLength);
    const userContent = buildUserContent(userMessage, images, provider.config.supportsVision);
    const model = buildModel(provider.config, provider.apiKey);

    try {
      const result = streamText({
        model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
        maxOutputTokens,
        temperature: 0.8,
      });

      let full = '';
      for await (const delta of result.textStream) {
        full += delta;
        try {
          port.postMessage({ type: 'delta', text: delta });
        } catch {
          return;
        }
      }

      const usage = await result.usage;
      await trackUsage(usage.totalTokens ?? 0);
      // Save to reply history
      if (full.trim()) {
        await addReplyHistory({
          ts: Date.now(),
          platform: 'x',
          postTextHash: await sha256Hex(tweetText),
          reply: full.trim(),
          tone: provider.tone,
          accent: provider.accent,
          provider: provider.config.name,
        }).catch(() => { /* ignore */ });
      }
      try {
        port.postMessage({ type: 'done', text: full });
        port.disconnect();
      } catch { /* ignore */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Streaming error';
      console.error('[X Reply Gen] Streaming failed:', message);
      try {
        port.postMessage({ type: 'error', error: message });
        port.disconnect();
      } catch { /* ignore */ }
    }
  }

  async function handleFactCheck(postText: string): Promise<{ success: boolean; result?: FactCheckResult; error?: string }> {
    const provider = await getProvider();
    if ('error' in provider) {
      return { success: false, error: provider.error };
    }
    const model = buildModel(provider.config, provider.apiKey);
    const searchSettings = await loadSearchSettings();
    const searchAvailable = searchSettings.enabled && !!searchSettings.apiKey;

    const collectedResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    const tools = searchAvailable ? {
      web_search: tool({
        description: 'Search the web for current information to verify claims in the post. Use this for any claim about recent events, current people in current roles, dates, statistics, or specific named events that could be verified online. Issue 1-3 focused queries; do not search for opinions.',
        inputSchema: z.object({
          query: z.string().describe('A focused search query — 3-8 words. Use the language of the original claim.'),
        }),
        execute: async ({ query }: { query: string }) => {
          try {
            const results = await webSearch(query, searchSettings, 5);
            for (const r of results) {
              if (r.url && !seenUrls.has(r.url)) {
                seenUrls.add(r.url);
                collectedResults.push(r);
              }
            }
            return {
              results: results.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet.slice(0, 400),
              })),
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed';
            return { error: message };
          }
        },
      }),
    } : undefined;

    const baseSystem = `You are a careful fact-checker analyzing a social media post. Your job:
1. Identify the factual claims in the post (ignore opinions — opinions can't be fact-checked).
2. Assess each claim against evidence.
3. Be honest about uncertainty — say "unverifiable" if you can't determine truth.
4. "misleading" is for posts that mix true facts with deceptive framing or selective omission.
5. "needs-context" is for posts that are technically true but require context to understand correctly.

Reply in the same language as the post.`;

    const searchSystem = searchAvailable
      ? `\n\nYou have access to a web_search tool. USE IT for any claim about events, dates, named people in roles, statistics, or anything that may have changed since training. Issue focused queries (3-8 words). After gathering enough evidence, output your verdict. Aim for 1-3 searches before concluding.`
      : `\n\nYou do NOT have web search access. For breaking news, recent events (last 6 months), or claims about current people in current roles, prefer "unverifiable" since your training data may be stale.`;

    const outputInstruction = `\n\nWhen ready, output ONLY a JSON object as your final message — no other text, no markdown fences:
{
  "verdict": "true" | "false" | "misleading" | "unverifiable" | "needs-context",
  "confidence": "low" | "medium" | "high",
  "summary": "1-2 sentence verdict summary in plain language",
  "reasoning": "2-4 sentence explanation of how you reached this verdict, what claims you assessed, and what evidence supports it"
}`;

    const systemPrompt = baseSystem + searchSystem + outputInstruction;

    try {
      const result = await withRetry(() => generateText({
        model,
        system: systemPrompt,
        prompt: `Fact-check this post:\n\n<post>\n${postText}\n</post>`,
        tools,
        ...(searchAvailable ? { stopWhen: stepCountIs(5) } : {}),
        maxOutputTokens: 1200,
        temperature: 0.3,
      }), { providerKey: provider.config.name });

      const usage = result.totalUsage ?? result.usage;
      await trackUsage(usage?.totalTokens ?? 0);

      const text = result.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { success: false, error: 'Could not parse fact-check response' };
      }
      const parsed = JSON.parse(jsonMatch[0]) as FactCheckResult;

      const validVerdicts = ['true', 'false', 'misleading', 'unverifiable', 'needs-context'];
      const validConfidence = ['low', 'medium', 'high'];
      if (!validVerdicts.includes(parsed.verdict) || !validConfidence.includes(parsed.confidence)) {
        return { success: false, error: 'Invalid fact-check shape' };
      }

      const sources = collectedResults.slice(0, 6).map((r) => {
        const lbl = labelSource(r.url);
        return { title: r.title, url: r.url, kind: lbl.kind, lean: lbl.lean, notes: lbl.notes };
      });
      return {
        success: true,
        result: {
          ...parsed,
          sources,
          searchUsed: searchAvailable && collectedResults.length > 0,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fact-check failed';
      console.error('[X Reply Gen] Fact-check failed:', message);
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
