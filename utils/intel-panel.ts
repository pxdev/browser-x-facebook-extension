import { t } from './i18n';
import { escapeHtml } from './text';
import type { Platform, CaptureRow } from './db';

export interface PanelTarget {
  platform: Platform;
  postElement: HTMLElement;
  text: string;
  author?: string;
  authorHandle?: string;
  permalink?: string;
  images: string[];
}

interface AuthorFeatures {
  defaultAvatar?: boolean;
  handleEntropy?: number;
  accountAgeDays?: number;
  followerToFollowingRatio?: number;
  postsPerDay?: number;
  verifiedKind?: 'none' | 'paid' | 'legacy' | 'gov';
}

export interface PanelDeps {
  scrapeReplies: (postEl: HTMLElement, platform: Platform) => string[];
  scrapeAuthorFeatures: (postEl: HTMLElement, platform: Platform) => Promise<AuthorFeatures>;
  showFactCheckPopover: (anchor: HTMLElement, postText: string) => void;
}

type TabId = 'claims' | 'replies' | 'account' | 'captures';

interface ClaimRow { text: string; type: 'factual' | 'opinion'; confidence: 'low' | 'medium' | 'high'; }
interface SentimentResult { positive: number; negative: number; neutral: number; hostile: number; }
interface TopicRow { label: string; count: number; }

interface PerTabState {
  claims?: { loading: boolean; rows?: ClaimRow[]; error?: string };
  replies?: { loading: boolean; sentiment?: SentimentResult; topics?: TopicRow[]; sampled?: number; error?: string };
  account?: { loading: boolean; score?: number; signals?: string[]; features?: AuthorFeatures; error?: string };
  captures?: { loading: boolean; rows?: CaptureRow[]; error?: string };
}

const PANEL_ID = 'x-reply-gen-intel-panel';

export function mountIntelPanel(deps: PanelDeps) {
  let target: PanelTarget | null = null;
  let activeTab: TabId = 'claims';
  let perTab: PerTabState = {};
  let host: HTMLDivElement | null = null;
  let root: ShadowRoot | null = null;
  let keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  function ensureHost(): { host: HTMLDivElement; root: ShadowRoot } {
    if (host && root) return { host, root };
    host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
    root = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    return { host, root };
  }

  function close() {
    target = null;
    perTab = {};
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler, true);
      keydownHandler = null;
    }
    if (root) {
      const panel = root.querySelector('.panel');
      if (panel) (panel as HTMLElement).style.display = 'none';
    }
  }

  function open(newTarget: PanelTarget, tab: TabId = 'claims') {
    target = newTarget;
    activeTab = tab;
    perTab = {};
    render();
    autoLoadActiveTab();
    const { root: r } = ensureHost();
    const panel = r.querySelector('.panel') as HTMLElement | null;
    const closeBtn = panel?.querySelector('.close-btn') as HTMLButtonElement | null;
    closeBtn?.focus();
  }

  function setTab(tab: TabId) {
    activeTab = tab;
    render();
    autoLoadActiveTab();
  }

  function autoLoadActiveTab() {
    if (!target) return;
    if (activeTab === 'claims' && !perTab.claims) loadClaims();
    if (activeTab === 'replies' && !perTab.replies) loadReplies();
    if (activeTab === 'account' && !perTab.account) loadAccount();
    if (activeTab === 'captures' && !perTab.captures) loadCaptures();
  }

  async function loadClaims() {
    if (!target) return;
    perTab.claims = { loading: true };
    render();
    try {
      const resp = await browser.runtime.sendMessage({ type: 'EXTRACT_CLAIMS', postText: target.text });
      if (resp?.success) perTab.claims = { loading: false, rows: resp.claims || [] };
      else perTab.claims = { loading: false, error: resp?.error || 'Failed' };
    } catch (err) {
      perTab.claims = { loading: false, error: err instanceof Error ? err.message : 'Failed' };
    }
    render();
  }

  async function loadReplies() {
    if (!target) return;
    perTab.replies = { loading: true };
    render();
    try {
      const replies = deps.scrapeReplies(target.postElement, target.platform).filter((r) => r.length > 4);
      if (replies.length === 0) {
        perTab.replies = { loading: false, error: t('intel.replies.noneFound') };
        render();
        return;
      }
      const resp = await browser.runtime.sendMessage({ type: 'ANALYZE_REPLIES', replies });
      if (resp?.success) {
        perTab.replies = { loading: false, sentiment: resp.sentiment, topics: resp.topics, sampled: replies.length };
      } else {
        perTab.replies = { loading: false, error: resp?.error || 'Failed' };
      }
    } catch (err) {
      perTab.replies = { loading: false, error: err instanceof Error ? err.message : 'Failed' };
    }
    render();
  }

  async function loadAccount() {
    if (!target) return;
    perTab.account = { loading: true };
    render();
    try {
      const features = await deps.scrapeAuthorFeatures(target.postElement, target.platform);
      const resp = await browser.runtime.sendMessage({ type: 'BOT_SCORE', features });
      if (resp?.success) {
        perTab.account = { loading: false, score: resp.score, signals: resp.signals, features };
      } else {
        perTab.account = { loading: false, error: 'Failed' };
      }
    } catch (err) {
      perTab.account = { loading: false, error: err instanceof Error ? err.message : 'Failed' };
    }
    render();
  }

  async function loadCaptures() {
    perTab.captures = { loading: true };
    render();
    try {
      const resp = await browser.runtime.sendMessage({ type: 'CAPTURE_LIST', limit: 100 });
      if (resp?.success) perTab.captures = { loading: false, rows: resp.rows || [] };
      else perTab.captures = { loading: false, error: resp?.error || 'Failed' };
    } catch (err) {
      perTab.captures = { loading: false, error: err instanceof Error ? err.message : 'Failed' };
    }
    render();
  }

  async function saveCurrentAsCapture() {
    if (!target) return;
    const row: Omit<CaptureRow, 'id'> = {
      ts: Date.now(),
      platform: target.platform,
      postUrl: target.permalink,
      author: target.author,
      text: target.text,
    };
    const resp = await browser.runtime.sendMessage({ type: 'CAPTURE_SAVE', row });
    if (resp?.success) {
      perTab.captures = undefined;
      if (activeTab === 'captures') loadCaptures();
      flashStatus(t('intel.captures.saved'));
    } else {
      flashStatus(t('intel.captures.failed'), true);
    }
  }

  async function deleteCapture(id: number) {
    await browser.runtime.sendMessage({ type: 'CAPTURE_DELETE', id });
    perTab.captures = undefined;
    loadCaptures();
  }

  function flashStatus(msg: string, isError = false) {
    const { root: r } = ensureHost();
    const el = r.querySelector('.status') as HTMLDivElement | null;
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? '#f4212e' : '#00ba7c';
    el.style.opacity = '1';
    setTimeout(() => { if (el.textContent === msg) el.style.opacity = '0'; }, 2200);
  }

  function render() {
    const { root: r } = ensureHost();
    if (!target) return;

    let panel = r.querySelector('.panel') as HTMLDivElement | null;
    if (!panel) {
      r.innerHTML = `
        <style>
          :host { all: initial; }
          .panel {
            position: fixed; top: 64px; right: 16px; width: 420px; max-height: 78vh;
            background: #ffffff; border: 1px solid #cfd9de; border-radius: 14px;
            box-shadow: 0 16px 48px rgba(15,20,25,0.22);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
            color: #0f1419; font-size: 13px; line-height: 1.5;
            display: flex; flex-direction: column; pointer-events: auto;
          }
          .panel.hidden { display: none; }
          .header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 14px; border-bottom: 1px solid #eff3f4;
            cursor: move; user-select: none;
          }
          .title { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 8px; }
          .target-snippet { font-weight: 400; color: #536471; font-size: 11px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .close-btn {
            background: transparent; border: none; cursor: pointer; padding: 4px 8px;
            color: #536471; font-size: 18px; line-height: 1; border-radius: 6px;
          }
          .close-btn:hover { background: #f7f9fa; }
          .tabs { display: flex; border-bottom: 1px solid #eff3f4; padding: 0 8px; }
          .tab {
            padding: 8px 12px; cursor: pointer; font-weight: 600; font-size: 12px;
            color: #536471; border-bottom: 2px solid transparent; user-select: none;
          }
          .tab:hover { color: #0f1419; }
          .tab.active { color: #1d9bf0; border-bottom-color: #1d9bf0; }
          .body { overflow-y: auto; padding: 12px 14px; flex: 1; }
          .status {
            padding: 4px 14px; font-size: 11px; font-weight: 600;
            opacity: 0; transition: opacity 0.2s; min-height: 16px;
          }
          .actions { display: flex; gap: 6px; padding: 10px 14px; border-top: 1px solid #eff3f4; flex-wrap: wrap; }
          .btn {
            padding: 6px 10px; border-radius: 999px; border: 1px solid #cfd9de; background: #ffffff;
            cursor: pointer; font-size: 12px; font-weight: 600; color: #0f1419;
            display: inline-flex; align-items: center; gap: 4px;
          }
          .btn:hover { background: #f7f9fa; border-color: #1d9bf0; color: #1d9bf0; }
          .btn.primary { background: #1d9bf0; color: #fff; border-color: #1d9bf0; }
          .btn.primary:hover { background: #1a8cd8; color: #fff; }
          .btn.danger:hover { color: #f4212e; border-color: #f4212e; background: #fde4e6; }
          .empty { color: #536471; padding: 20px 0; text-align: center; font-size: 12px; }
          .spinner {
            display: inline-block; width: 14px; height: 14px;
            border: 2px solid #cfd9de; border-top-color: #1d9bf0; border-radius: 50%;
            animation: spin 0.8s linear infinite; vertical-align: middle;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .claim-row {
            padding: 8px 10px; border: 1px solid #eff3f4; border-radius: 8px; margin-bottom: 6px;
            display: flex; flex-direction: column; gap: 6px;
          }
          .claim-meta { display: flex; gap: 6px; align-items: center; font-size: 10px; }
          .chip {
            display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.4px; padding: 1px 6px; border-radius: 999px;
          }
          .chip.factual { background: #dceeff; color: #0a4a7a; border: 1px solid #1d9bf0; }
          .chip.opinion { background: #eff3f4; color: #536471; border: 1px solid #cfd9de; }
          .chip.conf-high { background: #d1f4e0; color: #00574a; border: 1px solid #00ba7c; }
          .chip.conf-medium { background: #fff5d6; color: #7a5500; border: 1px solid #ffb700; }
          .chip.conf-low { background: #fde4e6; color: #a01018; border: 1px solid #f4212e; }
          .donut-wrap { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
          .legend-row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
          .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
          .topic-row {
            padding: 6px 10px; border: 1px solid #eff3f4; border-radius: 8px; margin-bottom: 4px;
            display: flex; justify-content: space-between; align-items: center; font-size: 12px;
          }
          .signal-row {
            padding: 8px 10px; background: #f7f9fa; border-radius: 6px; margin-bottom: 4px;
            font-size: 12px;
          }
          .score-bar { height: 8px; background: #eff3f4; border-radius: 4px; overflow: hidden; margin: 8px 0; }
          .score-bar > div { height: 100%; background: linear-gradient(90deg, #00ba7c, #ffb700, #f4212e); }
          .capture-row {
            padding: 8px 10px; border: 1px solid #eff3f4; border-radius: 8px; margin-bottom: 6px;
          }
          .capture-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #536471; margin-bottom: 4px; }
          .capture-text { font-size: 12px; line-height: 1.4; max-height: 4.2em; overflow: hidden; text-overflow: ellipsis; }
          .capture-row .row-actions { display: flex; gap: 4px; margin-top: 6px; }
        </style>
        <div class="panel">
          <div class="header">
            <div class="title">
              <span>🔎</span>
              <span class="title-text"></span>
              <span class="target-snippet"></span>
            </div>
            <button class="close-btn" aria-label="Close">×</button>
          </div>
          <div class="tabs">
            <div class="tab" data-tab="claims"></div>
            <div class="tab" data-tab="replies"></div>
            <div class="tab" data-tab="account"></div>
            <div class="tab" data-tab="captures"></div>
          </div>
          <div class="body"></div>
          <div class="status"></div>
          <div class="actions">
            <button class="btn capture-btn"></button>
            <button class="btn fact-btn"></button>
            <button class="btn refresh-btn"></button>
          </div>
        </div>
      `;
      panel = r.querySelector('.panel') as HTMLDivElement;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', t('intel.panel.title'));

      panel.querySelector('.close-btn')?.addEventListener('click', close);
      panel.querySelector('.capture-btn')?.addEventListener('click', saveCurrentAsCapture);
      panel.querySelector('.fact-btn')?.addEventListener('click', () => {
        if (target) deps.showFactCheckPopover(panel as HTMLElement, target.text);
      });
      panel.querySelector('.refresh-btn')?.addEventListener('click', () => {
        perTab[activeTab] = undefined;
        autoLoadActiveTab();
      });
      panel.querySelectorAll<HTMLDivElement>('.tab').forEach((tabEl) => {
        tabEl.addEventListener('click', () => setTab(tabEl.dataset.tab as TabId));
      });

      const header = panel.querySelector('.header') as HTMLElement;
      let dragging = false; let startX = 0; let startY = 0; let startTop = 0; let startRight = 0;
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || !panel) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.top = Math.max(0, startTop + dy) + 'px';
        panel.style.right = Math.max(0, startRight - dx) + 'px';
      };
      const onMouseUp = () => {
        dragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      header.addEventListener('mousedown', (e) => {
        dragging = true; startX = e.clientX; startY = e.clientY;
        const rect = panel!.getBoundingClientRect();
        startTop = rect.top;
        startRight = window.innerWidth - rect.right;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      });

      if (!keydownHandler) {
        keydownHandler = (e: KeyboardEvent) => {
          if (!target) return;
          const panelEl = root?.querySelector('.panel') as HTMLElement | null;
          if (!panelEl || panelEl.style.display === 'none') return;

          if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
          }

          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const tabs = Array.from(panelEl.querySelectorAll<HTMLDivElement>('.tab'));
            const focused = root?.activeElement ?? document.activeElement;
            if (focused && tabs.includes(focused as HTMLDivElement)) {
              e.preventDefault();
              const idx = tabs.indexOf(focused as HTMLDivElement);
              const nextIdx = e.key === 'ArrowLeft'
                ? (idx - 1 + tabs.length) % tabs.length
                : (idx + 1) % tabs.length;
              tabs[nextIdx].focus();
              setTab(tabs[nextIdx].dataset.tab as TabId);
            }
          }

          if (e.key === 'Tab') {
            const focusable = panelEl.querySelectorAll<HTMLElement>(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            const focusableArray = Array.from(focusable).filter((el) => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            });
            if (focusableArray.length === 0) return;
            const first = focusableArray[0];
            const last = focusableArray[focusableArray.length - 1];
            const focused = root?.activeElement ?? document.activeElement;
            if (e.shiftKey && focused === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && focused === last) {
              e.preventDefault();
              first.focus();
            }
          }
        };
        document.addEventListener('keydown', keydownHandler, true);
      }
    }

    panel.style.display = 'flex';
    panel.classList.remove('hidden');
    (panel.querySelector('.title-text') as HTMLElement).textContent = t('intel.panel.title');
    (panel.querySelector('.target-snippet') as HTMLElement).textContent = target.text.slice(0, 60);

    const tabLabels: Record<TabId, string> = {
      claims: t('intel.tab.claims'),
      replies: t('intel.tab.replies'),
      account: t('intel.tab.account'),
      captures: t('intel.tab.captures'),
    };
    panel.querySelectorAll<HTMLDivElement>('.tab').forEach((el) => {
      const id = el.dataset.tab as TabId;
      el.textContent = tabLabels[id];
      el.classList.toggle('active', id === activeTab);
      el.setAttribute('tabindex', '0');
    });

    const captureBtn = panel.querySelector('.capture-btn') as HTMLButtonElement;
    captureBtn.textContent = '💾 ' + t('intel.actions.capture');
    const factBtn = panel.querySelector('.fact-btn') as HTMLButtonElement;
    factBtn.textContent = '✓ ' + t('intel.actions.factCheck');
    const refreshBtn = panel.querySelector('.refresh-btn') as HTMLButtonElement;
    refreshBtn.textContent = '↻ ' + t('intel.actions.refresh');

    const body = panel.querySelector('.body') as HTMLDivElement;
    body.innerHTML = '';
    if (activeTab === 'claims') renderClaims(body);
    else if (activeTab === 'replies') renderReplies(body);
    else if (activeTab === 'account') renderAccount(body);
    else if (activeTab === 'captures') renderCaptures(body);
  }

  function renderClaims(body: HTMLDivElement) {
    const s = perTab.claims;
    if (!s || s.loading) { body.innerHTML = `<div class="empty"><span class="spinner"></span> ${t('intel.loading')}</div>`; return; }
    if (s.error) { body.innerHTML = `<div class="empty" style="color:#f4212e;">${escapeHtml(s.error)}</div>`; return; }
    if (!s.rows?.length) { body.innerHTML = `<div class="empty">${t('intel.claims.empty')}</div>`; return; }
    body.innerHTML = s.rows.map((c, i) => `
      <div class="claim-row" data-i="${i}">
        <div>${escapeHtml(c.text)}</div>
        <div class="claim-meta">
          <span class="chip ${c.type}">${escapeHtml(c.type)}</span>
          <span class="chip conf-${c.confidence}">${escapeHtml(c.confidence)}</span>
          ${c.type === 'factual' ? `<button class="btn fc-btn" data-i="${i}" style="margin-left:auto;font-size:11px;padding:3px 8px;">${escapeHtml(t('intel.claims.factCheck'))}</button>` : ''}
        </div>
      </div>
    `).join('');
    body.querySelectorAll<HTMLButtonElement>('.fc-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const i = Number(b.dataset.i);
        const claim = s.rows?.[i];
        if (claim) deps.showFactCheckPopover(b, claim.text);
      });
    });
  }

  function renderReplies(body: HTMLDivElement) {
    const s = perTab.replies;
    if (!s || s.loading) { body.innerHTML = `<div class="empty"><span class="spinner"></span> ${t('intel.loading')}</div>`; return; }
    if (s.error) { body.innerHTML = `<div class="empty" style="color:#f4212e;">${escapeHtml(s.error)}</div>`; return; }
    const sent = s.sentiment;
    if (!sent) { body.innerHTML = `<div class="empty">${t('intel.replies.noData')}</div>`; return; }
    const total = sent.positive + sent.negative + sent.neutral + sent.hostile || 1;
    const seg = (n: number, color: string, label: string) => `
      <div class="legend-row">
        <span><span class="swatch" style="background:${color};"></span>${escapeHtml(label)}</span>
        <span><b>${n}</b> <span style="color:#71767b;">${Math.round((n / total) * 100)}%</span></span>
      </div>`;
    const ringStyle = `background: conic-gradient(
      #00ba7c 0 ${(sent.positive / total) * 360}deg,
      #71767b ${(sent.positive / total) * 360}deg ${((sent.positive + sent.neutral) / total) * 360}deg,
      #ffb700 ${((sent.positive + sent.neutral) / total) * 360}deg ${((sent.positive + sent.neutral + sent.negative) / total) * 360}deg,
      #f4212e ${((sent.positive + sent.neutral + sent.negative) / total) * 360}deg 360deg);`;
    const topicsHtml = (s.topics || []).map((tc) => `
      <div class="topic-row"><span>${escapeHtml(tc.label)}</span><b>${tc.count}</b></div>
    `).join('');
    body.innerHTML = `
      <div style="font-size:11px;color:#536471;margin-bottom:8px;">${escapeHtml(t('intel.replies.sampled', { n: s.sampled ?? 0 }))}</div>
      <div class="donut-wrap">
        <div style="width:96px;height:96px;border-radius:50%;${ringStyle};position:relative;">
          <div style="position:absolute;inset:18px;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#536471;font-weight:700;">${total}</div>
        </div>
        <div style="flex:1;">
          ${seg(sent.positive, '#00ba7c', t('intel.replies.positive'))}
          ${seg(sent.neutral, '#71767b', t('intel.replies.neutral'))}
          ${seg(sent.negative, '#ffb700', t('intel.replies.negative'))}
          ${seg(sent.hostile, '#f4212e', t('intel.replies.hostile'))}
        </div>
      </div>
      <div style="font-size:10px;font-weight:700;color:#536471;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;">${escapeHtml(t('intel.replies.topics'))}</div>
      ${topicsHtml || `<div class="empty">${t('intel.replies.noTopics')}</div>`}
    `;
  }

  function renderAccount(body: HTMLDivElement) {
    const s = perTab.account;
    if (!s || s.loading) { body.innerHTML = `<div class="empty"><span class="spinner"></span> ${t('intel.loading')}</div>`; return; }
    if (s.error) { body.innerHTML = `<div class="empty" style="color:#f4212e;">${escapeHtml(s.error)}</div>`; return; }
    const score = s.score ?? 0;
    const f = s.features || {};
    const facts: string[] = [];
    if (target?.author) facts.push(`<div><b>${escapeHtml(target.author)}</b>${target.authorHandle ? ` <span style="color:#71767b;">@${escapeHtml(target.authorHandle)}</span>` : ''}</div>`);
    if (f.accountAgeDays !== undefined) facts.push(`<div>${escapeHtml(t('intel.account.ageDays', { n: f.accountAgeDays }))}</div>`);
    if (f.followerToFollowingRatio !== undefined) facts.push(`<div>${escapeHtml(t('intel.account.ratio'))}: ${f.followerToFollowingRatio.toFixed(2)}</div>`);
    if (f.verifiedKind) facts.push(`<div>${escapeHtml(t('intel.account.verified'))}: ${escapeHtml(f.verifiedKind)}</div>`);
    body.innerHTML = `
      <div style="font-size:11px;color:#536471;margin-bottom:6px;">${escapeHtml(t('intel.account.disclaimer'))}</div>
      ${facts.length ? `<div style="margin-bottom:10px;font-size:12px;line-height:1.6;">${facts.join('')}</div>` : ''}
      <div style="font-size:10px;font-weight:700;color:#536471;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(t('intel.account.signalScore'))}: ${score}/100</div>
      <div class="score-bar"><div style="width:${score}%;"></div></div>
      ${(s.signals || []).length
        ? (s.signals || []).map((sig) => `<div class="signal-row">${escapeHtml(sig)}</div>`).join('')
        : `<div class="empty">${t('intel.account.noSignals')}</div>`}
    `;
  }

  function renderCaptures(body: HTMLDivElement) {
    const s = perTab.captures;
    if (!s || s.loading) { body.innerHTML = `<div class="empty"><span class="spinner"></span> ${t('intel.loading')}</div>`; return; }
    if (s.error) { body.innerHTML = `<div class="empty" style="color:#f4212e;">${escapeHtml(s.error)}</div>`; return; }
    if (!s.rows?.length) { body.innerHTML = `<div class="empty">${t('intel.captures.empty')}</div>`; return; }
    body.innerHTML = s.rows.map((row) => {
      const d = new Date(row.ts);
      const dateStr = d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
      <div class="capture-row" data-id="${row.id}">
        <div class="capture-meta">
          <span>${escapeHtml(row.platform)} · ${escapeHtml(dateStr)}${row.author ? ` · ${escapeHtml(row.author)}` : ''}</span>
        </div>
        <div class="capture-text">${escapeHtml(row.text)}</div>
        <div class="row-actions">
          ${row.postUrl ? `<a class="btn" href="${escapeHtml(row.postUrl)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">${escapeHtml(t('intel.captures.open'))}</a>` : ''}
          <button class="btn danger del-btn" data-id="${row.id}">${escapeHtml(t('intel.captures.delete'))}</button>
        </div>
      </div>`;
    }).join('');
    body.querySelectorAll<HTMLButtonElement>('.del-btn').forEach((b) => {
      b.addEventListener('click', () => deleteCapture(Number(b.dataset.id)));
    });
  }

  return { open, close, isOpen: () => target !== null };
}
