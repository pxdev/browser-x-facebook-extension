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

    const monitorMode = settings.monitorMode as boolean || false;
    const keywords = parseKeywords(settings.keywords as string);

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

    function scorePost(text: string): number {
      if (keywords.length === 0) return 0;
      const lower = text.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) score += 1;
      }
      return score;
    }

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
          background: #000;
          color: #e7e9ea;
          padding: 12px 20px;
          border-radius: 12px;
          border: 1px solid #333;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 14px;
          font-weight: 600;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
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

    async function generateReply(tweetText: string): Promise<string> {
      const response = await browser.runtime.sendMessage({
        type: 'GENERATE_REPLY',
        tweetText,
      });

      if (response?.success && response.reply) {
        return response.reply;
      }

      const errorMsg = response?.error || 'AI generation failed';
      throw new Error(errorMsg);
    }

    async function fillComposer(replyText: string, platform: 'x' | 'facebook', postEl?: HTMLElement) {
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
          showToast('Could not find reply box', true);
          return false;
        }

        const editable = editor as HTMLElement;
        editable.focus();
        await new Promise((r) => setTimeout(r, 100));
        document.execCommand('selectAll', false);
        await new Promise((r) => setTimeout(r, 50));
        document.execCommand('insertText', false, replyText);
        showToast('Reply filled — ready to post');
        return true;
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

      // Helper to query through shadow DOMs
      function queryDeep(root: Document | Element | ShadowRoot, selector: string): Element[] {
        const results: Element[] = [];
        try {
          results.push(...Array.from(root.querySelectorAll(selector)));
        } catch { /* ignore */ }
        // Search inside shadow roots
        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
          if (el.shadowRoot) {
            results.push(...queryDeep(el.shadowRoot, selector));
          }
        }
        return results;
      }

      for (let attempt = 0; attempt < 25; attempt++) {
        let candidates: Element[] = [];

        // Gather from all scopes + shadow DOMs
        const scopes: (Element | Document | null)[] = [
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
            showToast('Reply filled — ready to post');
            return true;
          }

          const editable = editor as HTMLElement;

          // Method 1: execCommand (works on simple contenteditables)
          editable.focus();
          await new Promise((r) => setTimeout(r, 100));
          document.execCommand('selectAll', false);
          await new Promise((r) => setTimeout(r, 50));
          document.execCommand('insertText', false, replyText);
          await new Promise((r) => setTimeout(r, 100));

          // Check if text was actually inserted
          if (editable.textContent?.includes(replyText.slice(0, 20))) {
            showToast('Reply filled — ready to post');
            return true;
          }

          // Method 2: simulate paste event (works on Lexical and React editors)
          console.log('[X Reply Gen] execCommand failed, trying paste simulation...');
          editable.focus();
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
            showToast('Reply filled — ready to post');
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
            showToast('Reply filled — ready to post');
            return true;
          }

          console.log('[X Reply Gen] All insertion methods failed');
          showToast('Could not fill comment box', true);
          return false;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      showToast('Could not find comment box', true);
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
            showToast('Could not read post text', true);
            return;
          }
          const reply = await generateReply(text);

          const filled = await fillComposer(reply, 'facebook', composer);
          if (!filled) {
            showToast('Could not fill comment box', true);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to generate reply';
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

    function injectXComposerButton() {
      // Inject a small sparkle button into each visible tweet's action bar
      const posts = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]');

      posts.forEach((postEl) => {
        const rect = postEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (postEl.querySelector('[data-x-reply-gen="x-post-btn"]')) return;

        const actionBar = postEl.querySelector('[role="group"]');
        if (!actionBar) return;

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
              showToast('Could not read post text', true);
              return;
            }
            const reply = await generateReply(text);

            // Click the reply button to open the composer
            const replyBtn = postEl.querySelector('[data-testid="reply"]') as HTMLElement | null;
            if (replyBtn) {
              replyBtn.click();
              await new Promise((r) => setTimeout(r, 600));
            }

            // Find and fill the composer
            const filled = await fillComposer(reply, 'x', postEl);
            if (!filled) {
              showToast('Could not fill reply box', true);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to generate reply';
            showToast(message, true);
          } finally {
            btn.style.opacity = '1';
          }
        });

        actionBar.appendChild(btn);
      });
    }

    function scanForPosts() {
      if (platform === 'x') {
        injectXComposerButton();
      } else {
        // Facebook — inject buttons inside visible comment composers only
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
      }
    }

    scanForPosts();

    const observer = new MutationObserver(() => {
      scanForPosts();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const interval = setInterval(scanForPosts, 2000);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  },
});
