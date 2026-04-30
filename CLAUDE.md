# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev               # Chrome (MV3) — load .output/chrome-mv3/
npm run dev:firefox       # Firefox (MV2) — load .output/firefox-mv2/
npm run build             # Production build (Chrome)
npm run build:firefox     # Production build (Firefox)
npm run zip               # Store-ready zip
npm run zip:firefox
npm run compile           # vue-tsc --noEmit (type-check only; no test suite exists)
```

`postinstall` runs `wxt prepare` which regenerates `.wxt/` (auto-imports, tsconfig). If TypeScript starts complaining about missing `defineBackground` / `defineContentScript` / `browser` globals, run `npm run postinstall`.

There is no test runner, no linter, and no formatter. `npm run compile` is the only verification step.

## High-level architecture

A WXT + Vue 3 browser extension that augments X (Twitter) and Facebook with: AI replies, fact-checking, an "Intel" OSINT panel (claims/replies/account/captures), per-post toolbar actions (archive to Wayback, reverse-image search), watchlists, a 7-day narrative-hit timeline, and a Markdown evidence packager.

### Entrypoints (under `entrypoints/`)

- **`background.ts`** — service worker / event page. Single point of contact for: LLM APIs (`@ai-sdk/openai-compatible` for both built-in providers and the synthetic `custom` / `ollama` ones), IDB writes (via `utils/db.ts`), Wayback save submits, source labeling, web search, badge counts, context-menu fact-check.
- **`content.ts`** — content script matched on x.com / twitter.com / facebook.com. Detects posts via `MutationObserver` + 2-second `setInterval` fallback, injects buttons into per-post action bars, drives composer fill via `contenteditable` + `execCommand` + `InputEvent` (X and FB both ignore plain `value` mutations under React/Lexical), runs the **monitor sweep** (see below), and mounts the **intel panel** once via `mountIntelPanel(...)` from `utils/intel-panel.ts`.
- **`popup/`** and **`options/`** — Vue 3 SFCs (`main.ts` → `App.vue`). Both read/write the same `browser.storage.local` keys; `storage.onChanged` keeps surfaces in sync. Options has six tabs: **Provider · Voice · Behavior · Personas · Monitor · Captures**. The tab strip is `flex-wrap: nowrap` with tight padding/font so all six fit in one row at the page width — labels ellipsize before they wrap.

### Shared utilities (under `utils/`)

- **`db.ts`** — typed IndexedDB wrapper around `idb` (`x-reply-gen`, version 1). Four stores: `captures`, `narrativeHits`, `watchlists`, `watchlistHits` — each with `by-ts` and purpose-specific indexes. Helpers: `addCapture` / `listCaptures`, `addNarrativeHit` / `listNarrativeHits`, `addWatchlist` / `addWatchlistHit` / `markWatchlistRead` / `totalUnreadHits`. **Adding a store** = bump `DB_VERSION` and reset; there are no migrations during alpha.
- **`intel-panel.ts`** — exports `mountIntelPanel({ scrapeReplies, scrapeAuthorFeatures, showFactCheckPopover })`. Renders a draggable, shadow-DOM panel with four tabs (Claims / Replies / Account / Captures) and three footer actions (Save / Fact-check / Refresh). Per-tab cache keeps re-tabs from re-fetching. **Deps are injected from `content.ts`** because the panel can't know about per-platform DOM (`article[data-testid="tweet"]` vs `[role="article"]`).
- **`source-reputation.ts`** — ~150 hand-curated domains → `{ kind, lean?, notes? }`. `kind` enum: `news`, `state-affiliated`, `fact-check`, `wiki`, `academic`, `official`, `social`, `forum`, `blog`, `unknown`. `labelSource(url)` falls back to `.gov` / `.edu` / `.wikipedia.org` heuristics for unknowns. The chip palette is duplicated in three places (this file, `background.ts`'s `injectFactCheckPopoverFn`, and `content.ts`'s `renderSourceChip`) because the background-injected popover runs in the page world with no module access — keep them in sync.
- **`search.ts`** — Brave / Tavily wrapper, called from `background.ts` fact-check flow.
- **`i18n.ts`** — hand-rolled, two locales (`en` / `ar`), reactive Vue `ref` for `locale`. Used in both Vue components and the background script (which uses `vue` only for reactivity primitives).

### Persistence model

Two stores with a clear split:

- **`browser.storage.local`** — scalars and small lists. Settings (`apiProvider`, `apiKeys`, `tone`, `accent`, …), feature flags (`variations`, `streaming`, `monitorMode`, `keywords`, `platformX`, `platformFacebook`), search settings, `personas`, badge counters (`tokensToday` / `tokensDate`).
- **IndexedDB** (via `utils/db.ts`) — anything list-shaped that grows: captures, narrative hits, watchlists, watchlist hits.

There's one **denormalized cache** crossing the boundary: `storage.local.watchlistsCache` is a `[{ id, kind, value }]` mirror of the `watchlists` store, written by the background after every WATCHLIST_ADD/DELETE/HIT/READ and on service-worker startup (`syncWatchlistsCache()`). The content script reads this cheaply on every scan tick instead of querying IDB. **Any future watchlist mutation must call `syncWatchlistsCache()`** or the content-side matcher will go stale.

### Message protocol

All `runtime.onMessage` handlers live in `background.ts`. Return shape is `{ success, ...data, error? }`.

| Type | Purpose |
|---|---|
| `TEST_CONNECTION` | One-token ping to the active provider |
| `GENERATE_REPLY` | Reply generation (variations supported) |
| `FACT_CHECK_POST` | Fact-check with optional web search tool use; sources come back labeled |
| `EXTRACT_CLAIMS` | LLM splits a post into `[{ text, type: factual\|opinion, confidence }]` |
| `ANALYZE_REPLIES` | LLM sentiment (`positive/negative/neutral/hostile`) + topic clusters |
| `BOT_SCORE` | Pure heuristic — no LLM. Input: `{ defaultAvatar, handleEntropy, accountAgeDays, ... }` → `{ score, signals }` |
| `LABEL_SOURCES` | Bulk URL → `{ kind, lean?, notes? }` lookup |
| `ARCHIVE_URL` | Wayback `save/<url>` submit + archive.today fallback |
| `CAPTURE_*` | `_SAVE` / `_LIST` / `_DELETE` / `_WIPE` |
| `WATCHLIST_*` | `_LIST` / `_ADD` / `_DELETE` / `_HIT` / `_READ` / `_HITS` (all sync the cache + refresh badge) |
| `NARRATIVE_HIT` / `NARRATIVE_LIST` | Append-only log + range query |
| `UPDATE_BADGE` | Manual badge override (legacy; prefer `refreshUnreadBadge()` indirectly) |
| `GENERATE_FOR_FOCUSED` | Sent **to** the active tab, not to the background — triggered by the `Alt+Shift+R` command |

Streaming reply uses a separate `runtime.connect({ name: 'generate-stream' })` port with `delta` / `done` / `error` messages.

### Monitor sweep

Inside `content.ts`, `scanForPosts` walks each post element through `monitorPost()`. A `WeakSet<HTMLElement>` (`monitorSeen`) prevents double-logging on repeat scan ticks. For each newly-seen post:

1. **Narrative tracker** — if `monitorState.enabled` (i.e. `monitorMode` flag) and any `monitorState.keywords` substring-match the text: yellow outline, compute `quickSentiment` (lexicon-based, EN+AR positive/negative markers, neutral default), send one `NARRATIVE_HIT` per matched keyword.
2. **Watchlists** — if any cached watchlist matches (account = handle/name, keyword = text), send `WATCHLIST_HIT`. Hits update the toolbar badge count via `refreshUnreadBadge()` → `totalUnreadHits()`.

`monitorState` is mutable and a `storage.onChanged` listener hot-reloads the three relevant fields (`monitorMode`, `keywords`, `watchlistsCache`) so users don't need to refresh the page after editing watchlists/keywords in the options page.

### OSINT toolbar (per-post)

`buildArchiveAndReverseRow(postEl, platform)` produces three icon buttons:

- **Intel** (purple) — opens the intel panel targeting this post.
- **Archive** (blue) — `ARCHIVE_URL` to Wayback; copies snapshot URL to clipboard. Falls back to opening archive.today's submit URL in a new tab.
- **Reverse-image menu** (orange) — only present when `extractImageUrls()` returned ≥1 image. Dropdown with Google Lens / Yandex / TinEye / Bing per image (up to 4).

The row is appended to the post's action bar (X) or floats absolute next to the fact-check button (FB).

### Provider abstraction

`PROVIDERS` in `background.ts` is a hard-coded map of built-in providers (kimi, grok, openai, deepseek, google), each `{ baseUrl, model, supportsVision }` fed into `createOpenAICompatible`. Two synthetic providers are handled separately in `getProvider()`:

- `'custom'` — user-supplied `customBaseUrl` + `customModel` + `customSupportsVision`.
- `'ollama'` — local; if no key is set, the SDK still requires a non-empty string, so we substitute `'ollama'`.

**The provider list is duplicated** in `background.ts` (`PROVIDERS`), `options/App.vue` (`providers` computed), and `popup/App.vue` (`providerLabel`). Adding a provider means touching all three plus `wxt.config.ts` `host_permissions`.

### Tone / accent system

`toneMap` and `accentMap` (bottom of `background.ts`) are natural-language instructions inlined into the system prompt by `buildSystemPrompt`. The Arabic dialect entries (saudi / emirati / kuwaiti / qatari / bahraini / omani / egyptian / levantine / libyan / algerian / maghrebi / iraqi / formalArabic) are deliberately fine-grained — **don't collapse them into a generic "arabic"**; the per-dialect markers are the whole point. Same for `ethiopian` (Amharic, must use Ge'ez script, never Latin transliteration). Adding a tone or accent requires updating: the maps in `background.ts`, the `tone.<id>` / `accent.<id>` keys in both locales of `utils/i18n.ts`, and the dropdown groups in `popup/App.vue` and `options/App.vue`.

### Fact-check pipeline

`handleFactCheck` uses AI SDK tool-calling: when search is enabled, it passes a `web_search` tool (Brave or Tavily) with `stopWhen: stepCountIs(5)`. Without search, the system prompt biases toward `"unverifiable"` for recent claims. The model must return JSON in its final message — regex-extracted via `text.match(/\{[\s\S]*\}/)`; verdict and confidence are validated against fixed enums. Sources come back annotated with `{ kind, lean, notes }` from `labelSource()`. Both popover renderers (`background.ts/injectFactCheckPopoverFn` and `content.ts/renderFactCheckResult`) display colored kind/lean chips per source — keep their palettes in sync.

### Evidence packager

In `options/App.vue`, the Captures tab's "Export brief" generates a Markdown file in-browser:

- Cover sheet: ISO timestamp, item count, ISO date range
- Per-item: platform · ts header, author, permalink, **SHA-256 of the captured text** (chain-of-custody for text-only captures), block-quoted text, optional notes
- Download via `Blob` + `URL.createObjectURL` + synthetic `<a>.click()`

Captures are currently **text-only** — no screenshots. Adding `html2canvas` to capture the post's rendered DOM is a ~30-line change but was deferred to keep the bundle slim.

### Manifest / WXT config

`wxt.config.ts` declares `host_permissions` for every API host the extension calls — providers, search, archive services. Adding a feature that hits a new domain requires adding the host or it fails CORS in MV3. `optional_host_permissions: ['https://*/*']` exists for the fact-check page reader. Firefox build is MV2 (output checked into `firefox-mv2/`); Chrome is MV3 (built into `.output/chrome-mv3/`, gitignored).

### Things that look weird but are intentional

- **Inline styles in `content.ts` and the background-injected popover** — the popover from the background runs in the page's world and cannot rely on closures, imported modules, or extension stylesheets. All strings/styles are passed as JSON-serializable args.
- **Shadow DOM for the intel panel** — Twitter/Facebook's CSS is aggressive enough that even high-specificity selectors leak in; a closed world is the only reliable isolation.
- **Dual post-detection (MutationObserver + 2s interval)** — X/FB re-render aggressively; the interval is a safety net for cases where the observer misses a mutation batch.
- **`document.execCommand('selectAll')`** for filling the composer — both X (React) and FB (Lexical) ignore plain `value` mutations; `execCommand` + `InputEvent` is the only reliable insertion path.
- **Watchlists cache duplicated between IDB and `storage.local`** — IDB queries are async + slower; the content script needs synchronous-ish matching on every scan. The cache is the read path; IDB is the write path of record.
- **`scrapeReplies` / `scrapeAuthorFeatures` injected into the panel** rather than imported — keeps `intel-panel.ts` platform-agnostic and avoids a circular import (panel ↔ content).
- **`text-overflow: ellipsis` and `min-width: 0` everywhere on the options page** — Vue/HTML form controls have aggressive intrinsic sizing; flex children need `min-width: 0` to shrink, and the form-control globals (`width: 100%`, `padding: 10px 12px`) override anything that doesn't explicitly opt out (e.g., `.watch-kind` needs `width: auto`).
