import { t, initLocale } from '../utils/i18n';
import { mountIntelPanel, type PanelTarget } from '../utils/intel-panel';
import { escapeHtml } from '../utils/text';
import type { Platform } from '../utils/db';

export default defineContentScript({
  matches: [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://www.facebook.com/*',
    'https://facebook.com/*',
    'https://m.facebook.com/*',
  ],
  async main() {
    console.log('[X Reply Gen] Content script active on', location.hostname);
    await initLocale();

    const platform = detectPlatform();
    const settings = await browser.storage.local.get(['enabled', 'monitorMode', 'keywords', 'platformX', 'platformFacebook']);
    if (settings.enabled === false) {
      console.log('[X Reply Gen] Extension disabled');
      return;
    }

    if (platform === 'x' && settings.platformX === false) {
      console.log('[X Reply Gen] X platform disabled');
      return;
    }
    if (platform === 'facebook' && settings.platformFacebook === false) {
      console.log('[X Reply Gen] Facebook platform disabled');
      return;
    }

    const monitorState = {
      enabled: !!settings.monitorMode,
      keywords: parseKeywords(settings.keywords as string),
      watchlists: [] as Array<{ id: number; kind: 'account' | 'keyword'; value: string }>,
    };

    async function loadWatchlistsCache() {
      const stored = await browser.storage.local.get(['watchlistsCache']);
      monitorState.watchlists = (stored.watchlistsCache as typeof monitorState.watchlists) || [];
    }
    loadWatchlistsCache();

    browser.storage.onChanged.addListener((changes) => {
      if (changes.monitorMode) monitorState.enabled = !!changes.monitorMode.newValue;
      if (changes.keywords) monitorState.keywords = parseKeywords(changes.keywords.newValue as string);
      if (changes.watchlistsCache) monitorState.watchlists = (changes.watchlistsCache.newValue as typeof monitorState.watchlists) || [];
    });

    const monitorSeen = new WeakSet<HTMLElement>();
    const ioObserved = new WeakSet<HTMLElement>();
    const ioVisible = new WeakSet<HTMLElement>();
    let fbComposerScanTimer: number | null = null;

    const postIo = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        if (ioVisible.has(el)) {
          postIo.unobserve(el);
          continue;
        }
        ioVisible.add(el);
        postIo.unobserve(el);
        if (platform === 'x') {
          processXPost(el);
        } else {
          processFBPost(el);
        }
      }
    }, { rootMargin: '200px' });

    function detectPlatform(): 'x' | 'facebook' {
      if (location.hostname.includes('x.com') || location.hostname.includes('twitter.com')) return 'x';
      if (location.hostname.includes('facebook.com')) return 'facebook';
      return 'x';
    }

    function parseKeywords(raw: string | undefined): string[] {
      if (!raw) return [];
      return raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    }

    function extractPostData(postEl: HTMLElement, platform: 'x' | 'facebook'): { text: string; author?: string } {
      if (platform === 'x') {
        const textEl = postEl.querySelector('[data-testid="tweetText"]');
        const text = textEl?.textContent?.trim() ?? '';
        return { text };
      }
      // Facebook - gather all candidate text elements and pick the longest
      const candidates = postEl.querySelectorAll('div[dir="auto"], span[dir="auto"], [data-ad-preview="message"]');
      let bestText = '';
      for (const el of candidates) {
        const text = el.textContent?.trim() ?? '';
        if (text.length > bestText.length) {
          bestText = text;
        }
      }
      // Fallback: any direct text content
      if (!bestText) {
        bestText = postEl.textContent?.trim()?.slice(0, 500) ?? '';
      }
      return { text: bestText };
    }

    function matchedKeywords(text: string, list: string[]): string[] {
      if (!list.length) return [];
      const lower = text.toLowerCase();
      return list.filter((kw) => lower.includes(kw));
    }

    const POSITIVE_MARKERS = ['❤️', '💚', '🎉', '👍', '✨', '💯', '🔥', 'love', 'great', 'amazing', 'excellent', 'good', 'nice', 'beautiful', 'awesome', 'congrats', 'ممتاز', 'رائع', 'حلو', 'جميل', 'تمام', 'يعطيك العافية'];
    const NEGATIVE_MARKERS = ['😠', '😡', '💔', '👎', '🤮', 'hate', 'terrible', 'awful', 'stupid', 'disgusting', 'horrible', 'worst', 'سيء', 'فظيع', 'مقرف', 'كارثة', 'مصيبة'];

    function quickSentiment(text: string): 'positive' | 'negative' | 'neutral' {
      const lower = text.toLowerCase();
      let pos = 0; let neg = 0;
      for (const m of POSITIVE_MARKERS) if (lower.includes(m)) pos++;
      for (const m of NEGATIVE_MARKERS) if (lower.includes(m)) neg++;
      if (pos > neg) return 'positive';
      if (neg > pos) return 'negative';
      return 'neutral';
    }

    function highlightMatched(postEl: HTMLElement) {
      if (postEl.dataset.xrgHighlight === '1') return;
      postEl.dataset.xrgHighlight = '1';
      postEl.style.outline = '2px solid #ffb700';
      postEl.style.outlineOffset = '-2px';
      postEl.style.borderRadius = '12px';
    }

    function monitorPost(postEl: HTMLElement, platformKind: 'x' | 'facebook') {
      if (monitorSeen.has(postEl)) return;
      const { text } = extractPostData(postEl, platformKind);
      if (!text || text.length < 4) return;
      monitorSeen.add(postEl);

      const author = extractAuthor(postEl, platformKind);
      const permalink = findPostPermalink(postEl, platformKind) || undefined;

      // 1) Narrative tracker: log every keyword hit if monitorMode is on.
      if (monitorState.enabled && monitorState.keywords.length > 0) {
        const hits = matchedKeywords(text, monitorState.keywords);
        if (hits.length > 0) {
          highlightMatched(postEl);
          const sentimentQuick = quickSentiment(text);
          for (const kw of hits) {
            browser.runtime.sendMessage({
              type: 'NARRATIVE_HIT',
              row: {
                ts: Date.now(),
                platform: platformKind,
                keyword: kw,
                text: text.slice(0, 1000),
                author: author?.name || author?.handle,
                postUrl: permalink,
                sentimentQuick,
              },
            }).catch(() => { /* ignore */ });
          }
        }
      }

      // 2) Watchlists: account or keyword matches.
      if (monitorState.watchlists.length > 0) {
        const lowerText = text.toLowerCase();
        const lowerAuthorName = author?.name?.toLowerCase() ?? '';
        const lowerAuthorHandle = author?.handle?.toLowerCase() ?? '';
        for (const wl of monitorState.watchlists) {
          const match = wl.kind === 'account'
            ? (lowerAuthorName.includes(wl.value) || lowerAuthorHandle.includes(wl.value))
            : lowerText.includes(wl.value);
          if (!match) continue;
          highlightMatched(postEl);
          browser.runtime.sendMessage({
            type: 'WATCHLIST_HIT',
            row: {
              ts: Date.now(),
              watchlistId: wl.id,
              platform: platformKind,
              text: text.slice(0, 1000),
              author: author?.name || author?.handle,
              postUrl: permalink,
              read: false,
            },
          }).catch(() => { /* ignore */ });
        }
      }
    }

    function shannonEntropy(s: string): number {
      const freq: Record<string, number> = {};
      for (const c of s) freq[c] = (freq[c] || 0) + 1;
      let h = 0;
      const len = s.length;
      for (const k in freq) {
        const p = freq[k] / len;
        h -= p * Math.log2(p);
      }
      return h;
    }

    function scrapeReplies(postEl: HTMLElement, platformKind: 'x' | 'facebook'): string[] {
      const out: string[] = [];
      if (platformKind === 'x') {
        // On a tweet permalink, replies are sibling articles below the focal one.
        const articles = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
        const focalIdx = articles.indexOf(postEl);
        const start = focalIdx >= 0 ? focalIdx + 1 : 0;
        for (let i = start; i < articles.length && out.length < 30; i++) {
          const tx = articles[i].querySelector('[data-testid="tweetText"]')?.textContent?.trim();
          if (tx && tx.length > 4) out.push(tx);
        }
      } else {
        // Facebook: comments are nested articles inside the post container, or a sibling list.
        const candidates = postEl.querySelectorAll<HTMLElement>('[role="article"]');
        for (const c of candidates) {
          if (c === postEl) continue;
          const txEl = c.querySelector('div[dir="auto"]');
          const tx = txEl?.textContent?.trim();
          if (tx && tx.length > 4 && !out.includes(tx)) out.push(tx);
          if (out.length >= 30) break;
        }
      }
      return out;
    }

    async function scrapeAuthorFeatures(postEl: HTMLElement, platformKind: 'x' | 'facebook') {
      const features: { defaultAvatar?: boolean; handleEntropy?: number; verifiedKind?: 'none' | 'paid' | 'legacy' | 'gov' } = {};
      if (platformKind === 'x') {
        const author = extractAuthor(postEl, 'x');
        if (author?.handle) features.handleEntropy = shannonEntropy(author.handle);
        const avatar = postEl.querySelector<HTMLImageElement>('[data-testid^="UserAvatar-Container"] img');
        if (avatar?.src) features.defaultAvatar = avatar.src.includes('default_profile') || avatar.src.includes('sticker_default');
        // Verification badge — X uses different SVGs for paid vs legacy/gov
        const userNameEl = postEl.querySelector('[data-testid="User-Name"]');
        if (userNameEl) {
          const govIcon = userNameEl.querySelector('[aria-label*="Government" i], [aria-label*="Affiliated" i]');
          const verifiedIcon = userNameEl.querySelector('svg[aria-label*="Verified" i], [data-testid="icon-verified"]');
          if (govIcon) features.verifiedKind = 'gov';
          else if (verifiedIcon) features.verifiedKind = 'paid';
          else features.verifiedKind = 'none';
        }
      } else {
        const author = extractAuthor(postEl, 'facebook');
        if (author?.name) features.handleEntropy = shannonEntropy(author.name);
      }
      return features;
    }

    const intelPanel = mountIntelPanel({
      scrapeReplies,
      scrapeAuthorFeatures,
      showFactCheckPopover: (anchor, text) => showFactCheckPopover(anchor, text),
    });

    // Inject button styles once
    if (!document.getElementById('x-reply-gen-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'x-reply-gen-styles';
      styleEl.textContent = `
        .x-reply-gen-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          background: #ffffff;
          color: #0f1419;
          padding: 12px 20px;
          border-radius: 12px;
          border: 1px solid #eff3f4;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 8px 32px rgba(15, 20, 25, 0.18);
          opacity: 0;
          transform: translateY(12px);
          transition: opacity 0.3s ease, transform 0.3s ease;
          pointer-events: none;
        }
        .x-reply-gen-toast.show {
          opacity: 1;
          transform: translateY(0);
        }
        .x-reply-gen-toast.error {
          border-color: #f4212e;
          color: #f4212e;
        }
      `;
      document.head.appendChild(styleEl);
    }

    function showToast(message: string, isError = false) {
      const existing = document.getElementById('x-reply-gen-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'x-reply-gen-toast';
      toast.className = `x-reply-gen-toast${isError ? ' error' : ''}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    async function generateReply(tweetText: string, parentText?: string, images?: string[]): Promise<string | string[]> {
      const response = await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        tweetText,
        parentText,
        images,
      });

      if (response?.success) {
        if (Array.isArray(response.replies) && response.replies.length > 1) {
          return response.replies as string[];
        }
        if (response.reply) return response.reply as string;
      }

      const errorMsg = response?.error || t('content.toast.aiGenerationFailed');
      throw new Error(errorMsg);
    }

    interface FactCheckResult {
      verdict: 'true' | 'false' | 'misleading' | 'unverifiable' | 'needs-context';
      confidence: 'low' | 'medium' | 'high';
      summary: string;
      reasoning: string;
      sources?: Array<{ title: string; url: string; kind?: string; lean?: string; notes?: string }>;
      searchUsed?: boolean;
    }

    const sourceKindPalette: Record<string, { bg: string; fg: string; border: string }> = {
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
    const sourceLeanLabel: Record<string, string> = { left: 'L', 'center-left': 'CL', center: 'C', 'center-right': 'CR', right: 'R', mixed: 'M' };
    function renderSourceChip(kind: string, lean?: string, notes?: string): string {
      const p = sourceKindPalette[kind] || sourceKindPalette.unknown;
      const kindLabel = kind === 'state-affiliated' ? 'state' : kind;
      const leanPart = lean ? ` · ${sourceLeanLabel[lean] || lean}` : '';
      const titleAttr = notes ? ` title="${escapeHtml(notes)}"` : '';
      return `<span${titleAttr} style="display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;padding:1px 6px;border-radius:999px;background:${p.bg};color:${p.fg};border:1px solid ${p.border};margin-right:6px;flex-shrink:0;">${escapeHtml(kindLabel)}${leanPart}</span>`;
    }

    async function showFactCheckPopover(anchorEl: HTMLElement, postText: string, postEl?: HTMLElement) {
      document.getElementById('x-reply-gen-fact')?.remove();

      const rect = anchorEl.getBoundingClientRect();
      const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 460));
      const left = Math.max(8, Math.min(rect.left - 100, window.innerWidth - 400));

      const popover = document.createElement('div');
      popover.id = 'x-reply-gen-fact';
      popover.style.cssText = `
        position: fixed;
        top: ${top}px;
        left: ${left}px;
        z-index: 999998;
        background: #ffffff;
        border: 1px solid #eff3f4;
        border-radius: 14px;
        padding: 14px 16px;
        box-shadow: 0 16px 48px rgba(15, 20, 25, 0.22);
        width: 380px;
        max-height: 460px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
        color: #0f1419;
        font-size: 13px;
        line-height: 1.5;
      `;

      let resolved = false;
      function dismiss() {
        if (resolved) return;
        resolved = true;
        popover.remove();
        document.removeEventListener('mousedown', outsideHandler, true);
      }
      function outsideHandler(e: MouseEvent) {
        if (!popover.contains(e.target as Node) && e.target !== anchorEl) dismiss();
      }

      const closeBtn = `<button id="x-reply-gen-fact-close" style="position:absolute;top:10px;right:10px;background:transparent;border:none;color:#536471;cursor:pointer;font-size:18px;line-height:1;padding:4px 8px;border-radius:6px;">×</button>`;

      popover.innerHTML = `
        <div style="position:relative;text-align:center;padding:24px 0;color:#536471;">
          <div class="x-reply-gen-spinner" style="display:inline-block;width:18px;height:18px;border:2px solid #cfd9de;border-top-color:#1d9bf0;border-radius:50%;animation:x-reply-gen-spin 0.8s linear infinite;margin-bottom:8px;"></div>
          <div>${escapeHtml(t('factCheck.checking'))}</div>
        </div>
      `;
      document.body.appendChild(popover);

      // Spinner keyframes injected once
      if (!document.getElementById('x-reply-gen-spinner-styles')) {
        const s = document.createElement('style');
        s.id = 'x-reply-gen-spinner-styles';
        s.textContent = '@keyframes x-reply-gen-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(s);
      }

      setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 100);

      try {
        const response = await browser.runtime.sendMessage({ type: 'FACT_CHECK_POST', postText });
        if (resolved) return;

        if (response?.success && response.result) {
          renderFactCheckResult(popover, response.result, closeBtn, dismiss);
          if (postEl) {
            setFactCheckCache(getFactCheckKey(postText), response.result);
            renderFactCheckBadge(postEl, response.result);
          }
        } else {
          popover.innerHTML = `
            ${closeBtn}
            <div style="color:#f4212e;padding:12px 4px;font-weight:600;">
              ${escapeHtml(response?.error || t('factCheck.failed'))}
            </div>
          `;
          popover.querySelector('#x-reply-gen-fact-close')?.addEventListener('click', dismiss);
        }
      } catch (err) {
        if (resolved) return;
        const msg = err instanceof Error ? err.message : t('factCheck.failed');
        popover.innerHTML = `
          ${closeBtn}
          <div style="color:#f4212e;padding:12px 4px;font-weight:600;">${escapeHtml(msg)}</div>
        `;
        popover.querySelector('#x-reply-gen-fact-close')?.addEventListener('click', dismiss);
      }
    }

    function renderFactCheckResult(container: HTMLElement, result: FactCheckResult, closeBtn: string, dismiss: () => void) {
      const verdictStyles: Record<string, { bg: string; border: string; text: string; labelKey: string }> = {
        'true': { bg: '#d1f4e0', border: '#00ba7c', text: '#00574a', labelKey: 'factCheck.verdict.true' },
        'false': { bg: '#fde4e6', border: '#f4212e', text: '#a01018', labelKey: 'factCheck.verdict.false' },
        'misleading': { bg: '#fff5d6', border: '#ffb700', text: '#7a5500', labelKey: 'factCheck.verdict.misleading' },
        'unverifiable': { bg: '#e8eef2', border: '#71767b', text: '#3a4148', labelKey: 'factCheck.verdict.unverifiable' },
        'needs-context': { bg: '#dceeff', border: '#1d9bf0', text: '#0a4a7a', labelKey: 'factCheck.verdict.needsContext' },
      };
      const v = verdictStyles[result.verdict] || verdictStyles['unverifiable'];
      const confidenceLabelMap: Record<string, string> = {
        low: t('factCheck.confidenceLow'),
        medium: t('factCheck.confidenceMedium'),
        high: t('factCheck.confidenceHigh'),
      };

      const sourcesHtml = result.sources && result.sources.length > 0
        ? `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #eff3f4;">
             <div style="font-size:10px;font-weight:700;color:#536471;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
               ${escapeHtml(t('factCheck.sources'))} (${result.sources.length})
             </div>
             <div style="display:flex;flex-direction:column;gap:6px;">
               ${result.sources.map((s) => `
                 <div style="display:flex;align-items:center;gap:0;line-height:1.4;">
                   ${renderSourceChip(s.kind || 'unknown', s.lean, s.notes)}
                   <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer"
                      style="font-size:12px;color:#1d9bf0;text-decoration:none;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                     ${escapeHtml(s.title || s.url)}
                   </a>
                 </div>
               `).join('')}
             </div>
           </div>`
        : '';

      const disclaimerKey = result.searchUsed ? 'factCheck.disclaimerSearch' : 'factCheck.disclaimer';

      container.innerHTML = `
        ${closeBtn}
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
          <span style="background:${v.bg};border:1px solid ${v.border};color:${v.text};padding:5px 12px;border-radius:999px;font-weight:700;font-size:12px;letter-spacing:0.02em;">
            ${escapeHtml(t(v.labelKey as any))}
          </span>
          <span style="font-size:11px;color:#536471;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">
            ${escapeHtml(t('factCheck.confidence'))}: ${escapeHtml(confidenceLabelMap[result.confidence] || result.confidence)}
          </span>
          ${result.searchUsed ? `<span style="font-size:10px;color:#00ba7c;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">🔎 ${escapeHtml(t('factCheck.searchUsed'))}</span>` : ''}
        </div>
        <div style="font-weight:600;margin-bottom:10px;color:#0f1419;font-size:14px;line-height:1.45;">
          ${escapeHtml(result.summary)}
        </div>
        <div style="color:#536471;font-size:12.5px;line-height:1.6;margin-bottom:0;">
          ${escapeHtml(result.reasoning)}
        </div>
        ${sourcesHtml}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #eff3f4;color:#71767b;font-size:11px;line-height:1.45;">
          ⚠ ${escapeHtml(t(disclaimerKey as any))}
        </div>
      `;
      container.querySelector('#x-reply-gen-fact-close')?.addEventListener('click', dismiss);
    }

    const factCheckCache = new Map<string, FactCheckResult>();
    const MAX_CACHE_SIZE = 100;

    function setFactCheckCache(key: string, result: FactCheckResult) {
      if (factCheckCache.size >= MAX_CACHE_SIZE) {
        const firstKey = factCheckCache.keys().next().value;
        if (firstKey !== undefined) factCheckCache.delete(firstKey);
      }
      factCheckCache.set(key, result);
    }

    function getFactCheckKey(text: string): string {
      return text.slice(0, 300);
    }

    function renderFactCheckBadge(postEl: HTMLElement, result: FactCheckResult) {
      postEl.querySelectorAll('[data-x-reply-gen="fc-badge"]').forEach((el) => el.remove());

      const badge = document.createElement('span');
      badge.setAttribute('data-x-reply-gen', 'fc-badge');
      badge.setAttribute('title', `${result.summary} (${result.confidence} confidence)`);

      const colors: Record<string, { bg: string; text: string; border: string }> = {
        'true': { bg: '#d1f4e0', text: '#00574a', border: '#00ba7c' },
        'false': { bg: '#fde4e6', text: '#a01018', border: '#f4212e' },
        'misleading': { bg: '#fff5d6', text: '#7a5500', border: '#ffb700' },
        'unverifiable': { bg: '#e8eef2', text: '#3a4148', border: '#71767b' },
        'needs-context': { bg: '#dceeff', text: '#0a4a7a', border: '#1d9bf0' },
      };
      const c = colors[result.verdict] || colors['unverifiable'];

      const labelMap: Record<string, string> = {
        'true': 'True',
        'false': 'False',
        'misleading': 'Misleading',
        'unverifiable': 'Unverifiable',
        'needs-context': 'Needs Context',
      };

      badge.style.cssText = `display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:${c.bg};color:${c.text};border:1px solid ${c.border};font-size:11px;font-weight:700;cursor:default;letter-spacing:0.02em;`;
      badge.textContent = labelMap[result.verdict] || result.verdict;

      const fcBtn = postEl.querySelector('[data-x-reply-gen="fact-btn"]') as HTMLElement | null;
      if (fcBtn) {
        const computed = getComputedStyle(fcBtn);
        if (computed.position === 'absolute') {
          badge.style.position = 'absolute';
          badge.style.top = '10px';
          badge.style.right = '92px';
          badge.style.zIndex = '6';
          postEl.appendChild(badge);
        } else {
          fcBtn.parentElement?.insertBefore(badge, fcBtn.nextSibling);
        }
        return;
      }

      postEl.appendChild(badge);
    }

    function renderFactCheckBadgeIfCached(postEl: HTMLElement, text: string) {
      const cached = factCheckCache.get(getFactCheckKey(text));
      if (cached) renderFactCheckBadge(postEl, cached);
    }

    function showStreamingPreview(anchorEl: HTMLElement): { update: (text: string) => void; close: () => void } {
      document.getElementById('x-reply-gen-stream')?.remove();

      const rect = anchorEl.getBoundingClientRect();
      const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 200));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 380));

      const box = document.createElement('div');
      box.id = 'x-reply-gen-stream';
      box.style.cssText = `
        position: fixed;
        top: ${top}px;
        left: ${left}px;
        z-index: 999998;
        background: #ffffff;
        border: 1px solid #1d9bf0;
        border-radius: 12px;
        padding: 12px 14px;
        box-shadow: 0 12px 40px rgba(15, 20, 25, 0.18);
        width: 360px;
        max-height: 240px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        color: #0f1419;
        white-space: pre-wrap;
        word-wrap: break-word;
      `;
      box.textContent = '…';
      document.body.appendChild(box);

      return {
        update: (text: string) => { box.textContent = text || '…'; box.scrollTop = box.scrollHeight; },
        close: () => box.remove(),
      };
    }

    async function streamReply(tweetText: string, parentText: string | undefined, anchorEl: HTMLElement, images?: string[]): Promise<string> {
      const preview = showStreamingPreview(anchorEl);
      return new Promise<string>((resolve, reject) => {
        const port = browser.runtime.connect({ name: 'generate-stream' });
        let full = '';
        let settled = false;

        const finish = (err: Error | null, text: string) => {
          if (settled) return;
          settled = true;
          preview.close();
          try { port.disconnect(); } catch { /* ignore */ }
          if (err) reject(err); else resolve(text);
        };

        port.onMessage.addListener((msg: any) => {
          if (msg?.type === 'delta' && typeof msg.text === 'string') {
            full += msg.text;
            preview.update(full);
          } else if (msg?.type === 'done') {
            const finalText = typeof msg.text === 'string' && msg.text ? msg.text : full;
            finish(null, finalText);
          } else if (msg?.type === 'error') {
            finish(new Error(msg.error || 'Streaming error'), '');
          }
        });

        port.onDisconnect.addListener(() => {
          if (!settled) {
            if (full) finish(null, full);
            else finish(new Error('Stream disconnected'), '');
          }
        });

        port.postMessage({ type: 'GENERATE_REPLY_STREAM', tweetText, parentText, images });
      });
    }

    function showVariationsPicker(replies: string[], anchorEl: HTMLElement, onPick: (reply: string | null) => void) {
      document.getElementById('x-reply-gen-picker')?.remove();

      const rect = anchorEl.getBoundingClientRect();
      const top = Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 340));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 380));

      const picker = document.createElement('div');
      picker.id = 'x-reply-gen-picker';
      picker.style.cssText = `
        position: fixed;
        top: ${top}px;
        left: ${left}px;
        z-index: 999998;
        background: #ffffff;
        border: 1px solid #eff3f4;
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 12px 40px rgba(15, 20, 25, 0.18);
        width: 360px;
        max-height: 320px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f1419;
      `;

      const title = document.createElement('div');
      title.textContent = t('content.picker.title');
      title.style.cssText = 'font-size: 11px; font-weight: 700; color: #536471; text-transform: uppercase; letter-spacing: 0.4px; padding: 6px 10px 8px;';
      picker.appendChild(title);

      let resolved = false;
      function outsideHandler(e: MouseEvent) {
        if (!picker.contains(e.target as Node)) finish(null);
      }
      const finish = (reply: string | null) => {
        if (resolved) return;
        resolved = true;
        picker.remove();
        document.removeEventListener('mousedown', outsideHandler, true);
        onPick(reply);
      };

      replies.forEach((reply) => {
        const item = document.createElement('div');
        item.textContent = reply;
        item.style.cssText = `
          padding: 10px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          line-height: 1.45;
          margin-bottom: 4px;
          white-space: pre-wrap;
          word-wrap: break-word;
          background: #f7f9fa;
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s;
          color: #0f1419;
        `;
        item.addEventListener('mouseenter', () => {
          item.style.background = 'rgba(29, 155, 240, 0.08)';
          item.style.borderColor = '#1d9bf0';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '#f7f9fa';
          item.style.borderColor = 'transparent';
        });
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          finish(reply);
        });
        picker.appendChild(item);
      });

      setTimeout(() => document.addEventListener('mousedown', outsideHandler, true), 100);
      document.body.appendChild(picker);
    }

    function findXParentText(postEl: HTMLElement): string | undefined {
      if (!location.pathname.includes('/status/')) return undefined;
      const all = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
      const idx = all.indexOf(postEl);
      if (idx <= 0) return undefined;
      const { text } = extractPostData(all[idx - 1], 'x');
      return text || undefined;
    }

    function extractImageUrls(postEl: HTMLElement, platform: 'x' | 'facebook'): string[] {
      const urls: string[] = [];
      const seen = new Set<string>();
      const imgs = postEl.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src;
        if (!src || src.startsWith('data:')) continue;
        if (img.width > 0 && img.width < 80) continue;
        if (img.height > 0 && img.height < 80) continue;
        let isContent = false;
        if (platform === 'x') {
          isContent = src.includes('pbs.twimg.com/media/') || src.includes('twimg.com/media/');
        } else {
          isContent = src.includes('fbcdn.net') && !src.includes('emoji');
        }
        if (!isContent) continue;
        if (seen.has(src)) continue;
        seen.add(src);
        urls.push(src);
      }
      return urls.slice(0, 4);
    }

    interface RegenContext {
      text: string;
      parentText?: string;
      images: string[];
      platform: 'x' | 'facebook';
      postEl?: HTMLElement;
      useStreaming: boolean;
      useVariations: boolean;
    }

    const composerRegenContext = new WeakMap<HTMLElement, RegenContext>();

    function showRegenerateButton(composer: HTMLElement, context: RegenContext) {
      composerRegenContext.set(composer, context);
      if (context.platform === 'facebook') {
        showRegenerateToolbarButton(composer, context);
        return;
      }
      const container = composer.closest('form, div[role="presentation"], [data-testid="tweetTextarea_0"]') || composer.parentElement;
      if (!container) return;
      container.querySelector('[data-x-reply-gen="regen-btn"]')?.remove();
      const btn = document.createElement('button');
      btn.setAttribute('data-x-reply-gen', 'regen-btn');
      btn.setAttribute('aria-label', 'Regenerate reply');
      btn.textContent = '↻ Regenerate';
      btn.style.cssText = 'position:absolute;bottom:4px;right:4px;z-index:10;padding:4px 10px;border-radius:999px;border:1px solid #1d9bf0;background:#fff;color:#1d9bf0;font-size:12px;font-weight:600;cursor:pointer;';
      (container as HTMLElement).style.position = 'relative';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.5';
        try {
          let reply: string;
          if (context.useStreaming) {
            reply = await streamReply(context.text, context.parentText, btn, context.images);
          } else {
            const result = await generateReply(context.text, context.parentText, context.images);
            if (Array.isArray(result)) {
              const picked = await new Promise<string | null>((resolve) => {
                showVariationsPicker(result, btn, resolve);
              });
              if (!picked) { btn.style.opacity = '1'; return; }
              reply = picked;
            } else {
              reply = result;
            }
          }
          await fillComposer(reply, context.platform, context.postEl, context);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Regeneration failed', true);
        } finally {
          btn.style.opacity = '1';
        }
      });
      container.appendChild(btn);
      setTimeout(() => btn.remove(), 10000);
      const onBlur = () => {
        setTimeout(() => {
          if (document.activeElement !== composer && !composer.contains(document.activeElement)) {
            btn.remove();
            composer.removeEventListener('blur', onBlur);
          }
        }, 100);
      };
      composer.addEventListener('blur', onBlur);
    }

    function showRegenerateToolbarButton(editor: HTMLElement, context: RegenContext) {
      let toolbarList = editor.closest('form')?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || editor.closest('div[role="presentation"]')?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || editor.closest('form')?.querySelector('ul[data-id="focused-state-actions-list"]')
        || editor.closest('div[role="presentation"]')?.querySelector('ul[data-id="focused-state-actions-list"]')
        || editor.parentElement?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || editor.parentElement?.parentElement?.querySelector('ul[data-id="unfocused-state-actions-list"]');

      if (!toolbarList) return;

      // Remove existing to reset timer, then add fresh
      toolbarList.querySelector('[data-x-reply-gen="regen-btn"]')?.remove();

      const li = document.createElement('li');
      li.setAttribute('data-x-reply-gen', 'regen-btn');
      li.style.cssText = 'display: inline-flex; align-items: center; margin-left: 4px;';

      const btn = document.createElement('div');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Regenerate reply');
      btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; background: #ffffff; color: #1877f2; border: 1px solid #1877f2; font-family: system-ui, sans-serif; user-select: none; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: background 0.15s, border-color 0.15s;';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>';

      btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f7ff'; btn.style.borderColor = '#1877f2'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; btn.style.borderColor = '#1877f2'; });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.5';
        try {
          let reply: string;
          if (context.useStreaming) {
            reply = await streamReply(context.text, context.parentText, btn, context.images);
          } else {
            const result = await generateReply(context.text, context.parentText, context.images);
            if (Array.isArray(result)) {
              const picked = await new Promise<string | null>((resolve) => {
                showVariationsPicker(result, btn, resolve);
              });
              if (!picked) { btn.style.opacity = '1'; return; }
              reply = picked;
            } else {
              reply = result;
            }
          }
          await fillComposer(reply, context.platform, context.postEl, context);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Regeneration failed', true);
        } finally {
          btn.style.opacity = '1';
        }
      });

      li.appendChild(btn);

      const aiBtn = toolbarList.querySelector('[data-x-reply-gen="composer-btn"]');
      if (aiBtn && aiBtn.parentElement) {
        aiBtn.parentElement.after(li);
      } else {
        toolbarList.appendChild(li);
      }

      const removeTimer = window.setTimeout(() => li.remove(), 15000);
      const onBlur = () => {
        setTimeout(() => {
          if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
            li.remove();
            window.clearTimeout(removeTimer);
            editor.removeEventListener('blur', onBlur);
          }
        }, 100);
      };
      editor.addEventListener('blur', onBlur);
    }

    async function fillComposer(replyText: string, platform: 'x' | 'facebook', postEl?: HTMLElement, context?: RegenContext) {
      if (platform === 'x') {
        const selectors = [
          '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
          '[data-testid="tweetTextarea_0_richTextInputContainer"] [contenteditable="true"]',
          '[contenteditable="true"][role="textbox"]',
          '[data-testid="tweetTextarea_0"] div[contenteditable]',
          'div[contenteditable="true"]',
        ];

        let editor: Element | null = null;
        for (const sel of selectors) {
          editor = document.querySelector(sel);
          if (editor) break;
        }

        if (!editor) {
          showToast(t('content.toast.couldNotFindReplyBox'), true);
          return false;
        }

        const editable = editor as HTMLElement;

        // Method 1: paste simulation (works best on modern React editors)
        editable.focus();
        await new Promise((r) => setTimeout(r, 80));
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', replyText);
        dataTransfer.setData('text/html', replyText);
        const pasteEvent = new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dataTransfer,
        });
        editable.dispatchEvent(pasteEvent);
        await new Promise((r) => setTimeout(r, 150));

        if (editable.textContent?.includes(replyText.slice(0, 20))) {
          showToast(t('content.toast.replyFilled'));
          if (context) showRegenerateButton(editable, context);
          return true;
        }

        // Method 2: execCommand fallback
        console.log('[X Reply Gen] Paste failed, trying execCommand...');
        document.execCommand('selectAll', false);
        await new Promise((r) => setTimeout(r, 50));
        document.execCommand('insertText', false, replyText);
        await new Promise((r) => setTimeout(r, 100));

        if (editable.textContent?.includes(replyText.slice(0, 20))) {
          showToast(t('content.toast.replyFilled'));
          if (context) showRegenerateButton(editable, context);
          return true;
        }

        // Method 3: direct DOM manipulation
        console.log('[X Reply Gen] execCommand failed, trying direct DOM...');
        editable.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editable);
        sel?.removeAllRanges();
        sel?.addRange(range);
        range.deleteContents();
        const p = editable.querySelector('p');
        if (p) {
          p.innerHTML = '';
          p.appendChild(document.createTextNode(replyText));
        } else {
          editable.appendChild(document.createTextNode(replyText));
        }
        editable.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, inputType: 'insertText', data: replyText }));
        await new Promise((r) => setTimeout(r, 150));

        if (editable.textContent?.includes(replyText.slice(0, 20))) {
          showToast(t('content.toast.replyFilled'));
          if (context) showRegenerateButton(editable, context);
          return true;
        }

        showToast(t('content.toast.couldNotFillReplyBox'), true);
        return false;
      }

      // Facebook - poll for composer up to 5 seconds
      const fbSelectors = [
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]',
        'div[data-lexical-editor="true"]',
        'textarea[placeholder*="Write a comment" i]',
        'textarea[placeholder*="Comment" i]',
        'textarea[placeholder*="Write" i]',
        'input[placeholder*="Write a comment" i]',
        'input[placeholder*="Comment" i]',
        'div[aria-label*="Write a comment" i]',
        'div[aria-label*="Write a reply" i]',
        'div[aria-label*="Answer" i]',
        'div[aria-label*="comment" i]',
        'div[aria-label*="reply" i]',
      ];

      // Helper to query through shadow DOMs (depth-limited to avoid expensive traversals)
      function queryDeep(root: Document | Element | ShadowRoot, selector: string, maxDepth = 2): Element[] {
        const results: Element[] = [];
        try {
          results.push(...Array.from(root.querySelectorAll(selector)));
        } catch { /* ignore */ }
        if (maxDepth <= 0) return results;
        // Search inside shadow roots
        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
          if (el.shadowRoot) {
            results.push(...queryDeep(el.shadowRoot, selector, maxDepth - 1));
          }
        }
        return results;
      }

      for (let attempt = 0; attempt < 20; attempt++) {
        let candidates: Element[] = [];

        // Gather from all scopes + shadow DOMs
        const scopes: (Element | Document | null | undefined)[] = [
          postEl,
          postEl?.nextElementSibling,
          postEl?.parentElement,
          postEl?.parentElement?.nextElementSibling,
          postEl?.parentElement?.parentElement,
          document,
        ];

        for (const scope of scopes) {
          if (!scope) continue;
          for (const sel of fbSelectors) {
            if (scope instanceof Document || scope instanceof Element) {
              candidates.push(...queryDeep(scope, sel));
            }
          }
        }

        // Also check document.activeElement — if it's a contenteditable, that's likely our target
        const active = document.activeElement;
        if (active && active !== document.body) {
          const activeEl = active as HTMLElement;
          if (activeEl.isContentEditable || activeEl.getAttribute('contenteditable') === 'true' || activeEl.getAttribute('data-lexical-editor')) {
            candidates.push(activeEl);
          }
          // Also check if active element is inside a shadow DOM
          if (activeEl.shadowRoot) {
            for (const sel of fbSelectors) {
              candidates.push(...queryDeep(activeEl.shadowRoot, sel));
            }
          }
        }

        // Deduplicate and filter for visible elements
        const seen = new Set<Element>();
        let editor: Element | null = null;
        for (const candidate of candidates) {
          if (seen.has(candidate)) continue;
          seen.add(candidate);
          const el = candidate as HTMLElement;
          const rect = el.getBoundingClientRect();
          if (rect.width > 10 && rect.height > 10) {
            editor = candidate;
            console.log('[X Reply Gen] Found Facebook composer:', el.tagName, el.getAttribute('aria-label')?.slice(0, 40), 'class:', el.className?.slice(0, 40));
            break;
          }
        }

        if (editor) {
          if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            editor.focus();
            editor.value = replyText;
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            showToast(t('content.toast.replyFilled'));
            if (context) showRegenerateButton(editor as HTMLElement, context);
            return true;
          }

          const editable = editor as HTMLElement;

          // Method 1: paste simulation (works on Lexical and React editors)
          editable.focus();
          await new Promise((r) => setTimeout(r, 100));
          const dataTransfer = new DataTransfer();
          dataTransfer.setData('text/plain', replyText);
          dataTransfer.setData('text/html', replyText);
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer,
          });
          editable.dispatchEvent(pasteEvent);
          await new Promise((r) => setTimeout(r, 200));

          if (editable.textContent?.includes(replyText.slice(0, 20))) {
            showToast(t('content.toast.replyFilled'));
            if (context) showRegenerateButton(editable, context);
            return true;
          }

          // Method 2: execCommand fallback
          console.log('[X Reply Gen] Paste failed, trying execCommand...');
          editable.focus();
          await new Promise((r) => setTimeout(r, 100));
          document.execCommand('selectAll', false);
          await new Promise((r) => setTimeout(r, 50));
          document.execCommand('insertText', false, replyText);
          await new Promise((r) => setTimeout(r, 100));

          if (editable.textContent?.includes(replyText.slice(0, 20))) {
            showToast(t('content.toast.replyFilled'));
            if (context) showRegenerateButton(editable, context);
            return true;
          }

          // Method 3: direct DOM manipulation with InputEvent
          console.log('[X Reply Gen] Paste simulation failed, trying direct DOM...');
          editable.focus();
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editable);
          sel?.removeAllRanges();
          sel?.addRange(range);
          range.deleteContents();

          // For Lexical, try to find the <p> inside and set its text
          const p = editable.querySelector('p');
          if (p) {
            p.innerHTML = '';
            p.appendChild(document.createTextNode(replyText));
          } else {
            editable.appendChild(document.createTextNode(replyText));
          }

          // Dispatch events Lexical listens to
          editable.dispatchEvent(new InputEvent('beforeinput', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: replyText,
          }));
          editable.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: false,
            inputType: 'insertText',
            data: replyText,
          }));
          await new Promise((r) => setTimeout(r, 200));

          if (editable.textContent?.includes(replyText.slice(0, 20))) {
            showToast(t('content.toast.replyFilled'));
            if (context) showRegenerateButton(editable, context);
            return true;
          }

          console.log('[X Reply Gen] All insertion methods failed');
          showToast(t('content.toast.couldNotFillCommentBox'), true);
          return false;
        }

        await new Promise((r) => setTimeout(r, 250));
      }

      showToast(t('content.toast.couldNotFindCommentBox'), true);
      return false;
    }

    function injectComposerButton(composer: HTMLElement) {
      // Find the toolbar list — search inside composer and nearby ancestors
      let toolbarList = composer.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || composer.querySelector('ul[data-id="focused-state-actions-list"]')
        || composer.closest('form')?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || composer.closest('div[role="presentation"]')?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || composer.parentElement?.querySelector('ul[data-id="unfocused-state-actions-list"]')
        || composer.parentElement?.parentElement?.querySelector('ul[data-id="unfocused-state-actions-list"]');

      if (!toolbarList) {
        console.log('[X Reply Gen] No toolbar list found in composer');
        return;
      }

      // Check if our button already exists in this toolbar (avoid duplicates)
      if (toolbarList.querySelector('[data-x-reply-gen="composer-btn"]')) {
        return;
      }

      // Find the associated post by walking up and extracting text from the container
      // Strategy: find the ancestor container, then get text from div[dir="auto"]/span[dir="auto"]
      // that are NOT inside [role="article"] (those are comments)
      let targetEl: Element | null = null;
      let ancestor: HTMLElement | null = composer.parentElement;
      while (ancestor && ancestor !== document.body) {
        // Find all text elements in this container
        const textEls = ancestor.querySelectorAll('div[dir="auto"], span[dir="auto"]');
        let bestText = '';
        for (const el of textEls) {
          // Skip elements inside comment articles
          if (el.closest('[role="article"]')) continue;
          const text = el.textContent?.trim() ?? '';
          if (text.length > bestText.length && text.length > 10) {
            bestText = text;
          }
        }
        if (bestText) {
          // Create a temporary element to hold the text for extractPostData
          targetEl = ancestor;
          console.log('[X Reply Gen] Post text found in ancestor, length:', bestText.length);
          break;
        }
        ancestor = ancestor.parentElement;
      }

      // Fallback: find the nearest article (for reply-to-comment composers)
      if (!targetEl) {
        targetEl = composer.closest('[role="article"]');
      }
      if (!targetEl) {
        console.log('[X Reply Gen] No post or article found for composer');
        return;
      }

      // Create a toolbar item that matches Facebook's style
      const li = document.createElement('li');
      li.className = 'x1rg5ohu xdzw4kq xbelrpt';
      li.style.cssText = 'display: inline-flex; align-items: center; margin-left: 4px;';
      li.setAttribute('data-x-reply-gen', 'composer-btn');

      const wrapperSpan = document.createElement('span');
      wrapperSpan.className = 'html-span xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x1hl2dhg x16tdsg8 x1vvkbs x4k7w5x x1h91t0o x1h9r5lt x1jfb8zj xv2umb2 x1beo9mf xaigb6o x12ejxvf x3igimt xarpa2k xedcshv x1lytzrv x1t2pt76 x7ja8zs x1qrby5j';

      const btn = document.createElement('div');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Generate AI reply');
      btn.className = 'x1i10hfl x1qjc9v5 xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x9f619 x1ypdohk xdl72j9 x2lah0s x3ct3a4 x2lwn1j xeuugli x16tdsg8 x1hl2dhg xggy1nq x1ja2u2z x1t137rt x1fmog5m xu25z0z x140muxe xo1y3bh x1q0g3np x87ps6o x1lku1pv x1a2a7pz xjyslct xjbqb8w x13fuv20 x18b5jzi x1q0q8m5 x1t7ytsu x972fbf x10w94by x1qhh985 x14e42zd x3nfvp2 xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x1n2onr6 x3ajldb xrw4ojt xg6frx5 xw872ko xhgbb2x x1xhcax0 x1s928wv x1o8326s x56lyyc x1j6awrg x1tfg27r xitxdhh';
      btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; background: #1877f2; color: #fff; font-family: system-ui, sans-serif; user-select: none; box-shadow: 0 1px 3px rgba(0,0,0,0.15);';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z"/></svg>';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.5';

        try {
          const { text } = extractPostData(targetEl as HTMLElement, 'facebook');
          console.log('[X Reply Gen] Extracted text for reply:', text.slice(0, 100));
          if (!text) {
            showToast(t('content.toast.couldNotReadPost'), true);
            return;
          }
          const images = extractImageUrls(targetEl as HTMLElement, 'facebook');
          const flags = await browser.storage.local.get(['variations', 'streaming']);
          const useStreaming = !!flags.streaming && !flags.variations;

          let reply: string;
          if (useStreaming) {
            btn.style.opacity = '1';
            reply = await streamReply(text, undefined, btn, images);
            btn.style.opacity = '0.5';
          } else {
            const result = await generateReply(text, undefined, images);
            if (Array.isArray(result)) {
              btn.style.opacity = '1';
              const picked = await new Promise<string | null>((resolve) => {
                showVariationsPicker(result, btn, resolve);
              });
              if (!picked) return;
              reply = picked;
              btn.style.opacity = '0.5';
            } else {
              reply = result;
            }
          }

          const context: RegenContext = {
            text,
            images,
            platform: 'facebook',
            postEl: composer,
            useStreaming,
            useVariations: !!flags.variations,
          };
          const filled = await fillComposer(reply, 'facebook', composer, context);
          if (!filled) {
            showToast(t('content.toast.couldNotFillCommentBox'), true);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : t('content.toast.failedToGenerate');
          console.error('[X Reply Gen] Error:', message);
          showToast(message, true);
        } finally {
          btn.style.opacity = '1';
        }
      });

      wrapperSpan.appendChild(btn);
      li.appendChild(wrapperSpan);
      toolbarList.appendChild(li);
      console.log('[X Reply Gen] Composer button injected into toolbar');
    }

    function injectFactCheckFloating(article: HTMLElement, platformKind: 'x' | 'facebook') {
      if (article.querySelector('[data-x-reply-gen="fact-btn"]')) return;
      const computed = getComputedStyle(article);
      if (computed.position === 'static') {
        article.style.position = 'relative';
      }

      const btn = document.createElement('div');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', t('factCheck.btnLabel'));
      btn.setAttribute('title', t('factCheck.btnLabel'));
      btn.setAttribute('data-x-reply-gen', 'fact-btn');
      btn.style.cssText = 'position: absolute; top: 10px; right: 56px; width: 32px; height: 32px; border-radius: 50%; background: #ffffff; color: #1d9bf0; border: 1px solid #cfd9de; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(15,20,25,0.12); z-index: 5; transition: background 0.15s, border-color 0.15s;';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.5" y2="16.5"/></svg>';

      btn.addEventListener('mouseenter', () => { btn.style.background = '#f7f9fa'; btn.style.borderColor = '#1d9bf0'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; btn.style.borderColor = '#cfd9de'; });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { text: postText } = extractPostData(article, platformKind);
        if (!postText) {
          showToast(t('content.toast.couldNotReadPost'), true);
          return;
        }
        showFactCheckPopover(btn, postText, article);
      });

      article.appendChild(btn);

      injectOsintRow(article, platformKind, { floatingTopOffset: 50, anchor: 'absolute' });
    }

    function buildArchiveAndReverseRow(postEl: HTMLElement, platformKind: 'x' | 'facebook'): HTMLElement | null {
      const images = extractImageUrls(postEl, platformKind);
      const permalink = findPostPermalink(postEl, platformKind);

      const row = document.createElement('div');
      row.setAttribute('data-x-reply-gen', 'osint-row');
      row.style.cssText = 'display: inline-flex; align-items: center; gap: 4px;';

      row.appendChild(buildIntelButton(postEl, platformKind));
      if (permalink) row.appendChild(buildArchiveButton(permalink));
      if (images.length > 0) row.appendChild(buildReverseImageMenu(images));

      return row.children.length > 0 ? row : null;
    }

    function buildIntelButton(postEl: HTMLElement, platformKind: 'x' | 'facebook'): HTMLDivElement {
      const btn = buildIconButton(
        t('osint.intel.label'),
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>',
        '#7a5af8',
      );
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { text } = extractPostData(postEl, platformKind);
        if (!text) {
          showToast(t('content.toast.couldNotReadPost'), true);
          return;
        }
        const target: PanelTarget = {
          platform: platformKind as Platform,
          postElement: postEl,
          text,
          author: extractAuthor(postEl, platformKind)?.name,
          authorHandle: extractAuthor(postEl, platformKind)?.handle,
          permalink: findPostPermalink(postEl, platformKind) || undefined,
          images: extractImageUrls(postEl, platformKind),
        };
        intelPanel.open(target, 'claims');
      });
      return btn;
    }

    function extractAuthor(postEl: HTMLElement, platformKind: 'x' | 'facebook'): { name?: string; handle?: string } | undefined {
      if (platformKind === 'x') {
        const userNameEl = postEl.querySelector('[data-testid="User-Name"]');
        if (!userNameEl) return undefined;
        const spans = userNameEl.querySelectorAll('span');
        let name: string | undefined;
        let handle: string | undefined;
        for (const sp of spans) {
          const text = sp.textContent?.trim() ?? '';
          if (!text) continue;
          if (text.startsWith('@')) handle = text.slice(1);
          else if (!name && !text.includes('·') && text.length < 60) name = text;
        }
        return { name, handle };
      }
      const link = postEl.querySelector('h2 a, h3 a, h4 a, strong a');
      const name = link?.textContent?.trim() || undefined;
      return { name };
    }

    function injectOsintRow(article: HTMLElement, platformKind: 'x' | 'facebook', opts: { floatingTopOffset?: number; anchor?: 'absolute' | 'inline' } = {}) {
      if (article.querySelector('[data-x-reply-gen="osint-row"]')) return;
      const row = buildArchiveAndReverseRow(article, platformKind);
      if (!row) return;

      if (opts.anchor === 'absolute') {
        row.style.cssText += `;position:absolute;top:${opts.floatingTopOffset ?? 50}px;right:10px;background:#ffffff;border:1px solid #cfd9de;border-radius:999px;padding:3px 6px;box-shadow:0 1px 3px rgba(15,20,25,0.12);z-index:5;`;
        article.appendChild(row);
      } else {
        article.appendChild(row);
      }
    }

    function findPostPermalink(postEl: HTMLElement, platformKind: 'x' | 'facebook'): string | null {
      if (platformKind === 'x') {
        const link = postEl.querySelector<HTMLAnchorElement>('a[href*="/status/"] time')?.parentElement as HTMLAnchorElement | null;
        if (link?.href) return link.href;
        const any = postEl.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
        return any?.href ?? null;
      }
      const a = postEl.querySelector<HTMLAnchorElement>('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/photo/"], a[href*="/videos/"], a[href*="story_fbid="]');
      return a?.href ?? null;
    }

    function buildIconButton(label: string, svg: string, color = '#1d9bf0'): HTMLDivElement {
      const b = document.createElement('div');
      b.setAttribute('role', 'button');
      b.setAttribute('tabindex', '0');
      b.setAttribute('aria-label', label);
      b.setAttribute('title', label);
      b.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;cursor:pointer;background:#ffffff;color:${color};border:1px solid #cfd9de;user-select:none;flex-shrink:0;transition:background 0.15s, border-color 0.15s;`;
      b.innerHTML = svg;
      b.addEventListener('mouseenter', () => { b.style.background = '#f7f9fa'; b.style.borderColor = color; });
      b.addEventListener('mouseleave', () => { b.style.background = '#ffffff'; b.style.borderColor = '#cfd9de'; });
      return b;
    }

    function buildArchiveButton(permalink: string): HTMLDivElement {
      const btn = buildIconButton(
        t('osint.archive.label'),
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>',
      );
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.5';
        showToast(t('osint.archive.starting'));
        try {
          const resp = await browser.runtime.sendMessage({ type: 'ARCHIVE_URL', url: permalink });
          if (resp?.success && resp.wayback) {
            try { await navigator.clipboard.writeText(resp.wayback); } catch { /* ignore */ }
            showToast(t('osint.archive.done'));
          } else if (resp?.archiveToday) {
            window.open(resp.archiveToday, '_blank', 'noopener,noreferrer');
            showToast(t('osint.archive.fallback'));
          } else {
            showToast(resp?.error || t('osint.archive.failed'), true);
          }
        } catch (err) {
          showToast(err instanceof Error ? err.message : t('osint.archive.failed'), true);
        } finally {
          btn.style.opacity = '1';
        }
      });
      return btn;
    }

    function buildReverseImageMenu(images: string[]): HTMLDivElement {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;display:inline-flex;';
      const btn = buildIconButton(
        t('osint.reverseImage.label'),
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-9 9"/></svg>',
        '#ff7a00',
      );
      let menu: HTMLDivElement | null = null;
      const closeMenu = () => { menu?.remove(); menu = null; document.removeEventListener('mousedown', onOutside, true); };
      function onOutside(e: MouseEvent) {
        if (menu && !menu.contains(e.target as Node) && e.target !== btn) closeMenu();
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menu) { closeMenu(); return; }
        const rect = btn.getBoundingClientRect();
        menu = document.createElement('div');
        menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${Math.max(8, rect.left - 60)}px;z-index:999999;background:#ffffff;border:1px solid #cfd9de;border-radius:10px;padding:4px;box-shadow:0 8px 24px rgba(15,20,25,0.18);font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;min-width:180px;`;
        const engines: Array<{ name: string; build: (u: string) => string }> = [
          { name: 'Google Lens', build: (u) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}` },
          { name: 'Yandex', build: (u) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}` },
          { name: 'TinEye', build: (u) => `https://www.tineye.com/search?url=${encodeURIComponent(u)}` },
          { name: 'Bing', build: (u) => `https://www.bing.com/images/search?q=imgurl:${encodeURIComponent(u)}&view=detailv2&iss=sbi` },
        ];
        const renderRow = (label: string, urls: string[]) => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:6px 10px;color:#0f1419;font-weight:600;border-bottom:1px solid #eff3f4;';
          row.textContent = label;
          menu!.appendChild(row);
          urls.forEach((url, idx) => {
            engines.forEach((eng) => {
              const item = document.createElement('a');
              item.href = eng.build(url);
              item.target = '_blank';
              item.rel = 'noopener noreferrer';
              item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;color:#0f1419;text-decoration:none;border-radius:6px;cursor:pointer;';
              item.innerHTML = `<span>${eng.name}${images.length > 1 ? ` <span style="color:#71767b;font-size:11px;">img ${idx + 1}</span>` : ''}</span><span style="color:#71767b;font-size:11px;">↗</span>`;
              item.addEventListener('mouseenter', () => { item.style.background = '#f7f9fa'; });
              item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
              item.addEventListener('click', () => closeMenu());
              menu!.appendChild(item);
            });
          });
        };
        renderRow(t('osint.reverseImage.menuTitle'), images.slice(0, 4));
        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener('mousedown', onOutside, true), 50);
      });
      wrap.appendChild(btn);
      return wrap;
    }

    function injectFactCheckButton(postEl: HTMLElement, actionBar: Element) {
      if (postEl.querySelector('[data-x-reply-gen="fact-btn"]')) return;

      const btn = document.createElement('div');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', t('factCheck.btnLabel'));
      btn.setAttribute('title', t('factCheck.btnLabel'));
      btn.setAttribute('data-x-reply-gen', 'fact-btn');
      btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; background: #ffffff; color: #1d9bf0; border: 1px solid #cfd9de; font-family: system-ui, sans-serif; user-select: none; margin-left: 6px; flex-shrink: 0; box-shadow: 0 1px 2px rgba(15,20,25,0.08); transition: background 0.15s, border-color 0.15s;';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.5" y2="16.5"/></svg>';

      btn.addEventListener('mouseenter', () => { btn.style.background = '#f7f9fa'; btn.style.borderColor = '#1d9bf0'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#ffffff'; btn.style.borderColor = '#cfd9de'; });

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const { text: postText } = extractPostData(postEl, 'x');
        if (!postText) {
          showToast(t('content.toast.couldNotReadPost'), true);
          return;
        }
        showFactCheckPopover(btn, postText, postEl);
      });

      actionBar.appendChild(btn);

      const osintRow = buildArchiveAndReverseRow(postEl, 'x');
      if (osintRow) {
        osintRow.style.cssText += ';margin-left:6px;';
        actionBar.appendChild(osintRow);
      }
    }

    function injectXPostButton(postEl: HTMLElement, actionBar: Element) {
      if (postEl.querySelector('[data-x-reply-gen="x-post-btn"]')) return;

      const btn = document.createElement('div');
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      btn.setAttribute('aria-label', 'Generate AI reply');
      btn.setAttribute('data-x-reply-gen', 'x-post-btn');
      btn.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; background: #1d9bf0; color: #fff; font-family: system-ui, sans-serif; user-select: none; margin-left: 8px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.15);';
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L13.5 10.5L22 12L13.5 13.5L12 22L10.5 13.5L2 12L10.5 10.5Z"/></svg>';

      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.style.opacity = '0.5';

        try {
          const { text } = extractPostData(postEl, 'x');
          if (!text) {
            showToast(t('content.toast.couldNotReadPost'), true);
            return;
          }
          const parentText = findXParentText(postEl);
          const images = extractImageUrls(postEl, 'x');
          const flags = await browser.storage.local.get(['variations', 'streaming']);
          const useStreaming = !!flags.streaming && !flags.variations;

          let reply: string;
          if (useStreaming) {
            btn.style.opacity = '1';
            reply = await streamReply(text, parentText, btn, images);
            btn.style.opacity = '0.5';
          } else {
            const result = await generateReply(text, parentText, images);
            if (Array.isArray(result)) {
              btn.style.opacity = '1';
              const picked = await new Promise<string | null>((resolve) => {
                showVariationsPicker(result, btn, resolve);
              });
              if (!picked) return;
              reply = picked;
              btn.style.opacity = '0.5';
            } else {
              reply = result;
            }
          }

          const replyBtn = postEl.querySelector('[data-testid="reply"]') as HTMLElement | null;
          if (replyBtn) {
            replyBtn.click();
            await new Promise((r) => setTimeout(r, 600));
          }

          const context: RegenContext = {
            text,
            parentText,
            images,
            platform: 'x',
            postEl,
            useStreaming,
            useVariations: !!flags.variations,
          };
          const filled = await fillComposer(reply, 'x', postEl, context);
          if (!filled) {
            showToast(t('content.toast.couldNotFillReplyBox'), true);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : t('content.toast.failedToGenerate');
          showToast(message, true);
        } finally {
          btn.style.opacity = '1';
        }
      });

      actionBar.appendChild(btn);
    }

    function processXPost(postEl: HTMLElement) {
      const rect = postEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const actionBar = postEl.querySelector('[role="group"]');
      if (!actionBar) return;
      injectFactCheckButton(postEl, actionBar);
      injectXPostButton(postEl, actionBar);
      monitorPost(postEl, 'x');
      const { text } = extractPostData(postEl, 'x');
      if (text) renderFactCheckBadgeIfCached(postEl, text);
    }

    function processFBPost(article: HTMLElement) {
      const rect = article.getBoundingClientRect();
      if (rect.height < 120) return;
      injectFactCheckFloating(article, 'facebook');
      monitorPost(article, 'facebook');
      const { text } = extractPostData(article, 'facebook');
      if (text) renderFactCheckBadgeIfCached(article, text);
    }

    function scanForFBComposers() {
      if (fbComposerScanTimer !== null) return;
      fbComposerScanTimer = window.setTimeout(() => {
        fbComposerScanTimer = null;
        const composerSelectors = [
          'form[role="presentation"]',
          'div[role="presentation"]',
          '[data-lexical-editor="true"]',
        ];
        const allComposers = new Set<HTMLElement>();
        for (const sel of composerSelectors) {
          document.querySelectorAll<HTMLElement>(sel).forEach((el) => allComposers.add(el));
        }
        allComposers.forEach((el) => {
          const hasToolbar = el.querySelector('ul[data-id="unfocused-state-actions-list"]')
            || el.querySelector('ul[data-id="focused-state-actions-list"]')
            || el.closest('form')?.querySelector('ul[data-id="unfocused-state-actions-list"]')
            || el.closest('div[role="presentation"]')?.querySelector('ul[data-id="unfocused-state-actions-list"]');
          if (hasToolbar) {
            injectComposerButton(el);
          }
        });
      }, 300);
    }

    function scanForNewElements() {
      if (platform === 'x') {
        document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach((el) => {
          if (!ioObserved.has(el)) {
            ioObserved.add(el);
            postIo.observe(el);
          }
        });
      } else {
        document.querySelectorAll<HTMLElement>('[role="article"]').forEach((el) => {
          if (el.parentElement?.closest('[role="article"]')) return;
          if (!ioObserved.has(el)) {
            ioObserved.add(el);
            postIo.observe(el);
          }
        });
        scanForFBComposers();
      }
    }

    function triggerForFocusedPost() {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const composer = active.closest('[contenteditable="true"], [data-lexical-editor="true"], textarea') as HTMLElement | null;
        if (composer) {
          const regen = composer.closest('form, div[role="presentation"], [data-testid="tweetTextarea_0"]')?.querySelector('[data-x-reply-gen="regen-btn"]') as HTMLElement | null;
          if (regen) {
            regen.click();
            return;
          }
        }

        let target: HTMLElement | null = null;
        if (platform === 'x') {
          target = active.closest('article[data-testid="tweet"]');
        } else {
          target = active.closest('form[role="presentation"], div[role="presentation"]');
        }
        if (target) {
          const aiBtn = target.querySelector<HTMLElement>('[data-x-reply-gen]');
          if (aiBtn) {
            aiBtn.click();
            return;
          }
        }
      }

      let target: HTMLElement | null = null;
      const articles = platform === 'x'
        ? Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
        : Array.from(document.querySelectorAll<HTMLElement>('form[role="presentation"], div[role="presentation"]'));
      for (const el of articles) {
        const rect = el.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < window.innerHeight - 100 && rect.height > 50) {
          target = el;
          break;
        }
      }
      if (!target) {
        showToast(t('content.toast.noPostFound'), true);
        return;
      }
      const aiBtn = target.querySelector<HTMLElement>('[data-x-reply-gen]');
      if (aiBtn) {
        aiBtn.click();
      } else {
        showToast(t('content.toast.btnNotReady'), true);
      }
    }

    browser.runtime.onMessage.addListener((msg: any) => {
      if (msg?.type === 'GENERATE_FOR_FOCUSED') {
        triggerForFocusedPost();
      }
    });

    scanForNewElements();

    const observer = new MutationObserver(() => {
      scanForNewElements();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Lightweight periodic check to re-inject buttons that React/Lexical may have removed
    const buttonHealthInterval = window.setInterval(() => {
      if (platform === 'x') {
        document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach((el) => {
          if (!ioVisible.has(el)) return;
          const actionBar = el.querySelector('[role="group"]');
          if (!actionBar) return;
          if (!actionBar.querySelector('[data-x-reply-gen]')) {
            injectFactCheckButton(el, actionBar);
            injectXPostButton(el, actionBar);
          }
        });
      }
    }, 3000);

    return () => {
      observer.disconnect();
      postIo.disconnect();
      window.clearInterval(buttonHealthInterval);
      if (fbComposerScanTimer !== null) window.clearTimeout(fbComposerScanTimer);
    };
  },
});
