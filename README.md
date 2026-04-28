# X Reply Generator

Browser extension that detects posts on X (Twitter) and Facebook, then generates AI-powered replies with one click. Built with [WXT](https://wxt.dev) and [Vue 3](https://vuejs.org).

## What It Does

- **Detects posts** as you scroll on X (Twitter) and Facebook
- **Injects an "AI Reply" button** on each post's action bar
- **Generates context-aware replies** using your chosen AI provider
- **Auto-fills the reply composer** so you can review, edit, and send
- **Works in your browser** — your API key stays local

## Features

- **Multi-Platform**: Supports X (Twitter) and Facebook with per-platform toggles
- **Multiple AI Providers**: Kimi (Moonshot), DeepSeek, or OpenAI
- **Tonal Control**: 19 tones — diplomatic, empathetic, satirical, aggressive, fact-checker, and more
- **Accent & Style**: American English, Gen Z slang, academic, corporate, poetic, Arabic dialects (Saudi, Egyptian, Levantine, Maghrebi, Iraqi, Fus'ha), and more
- **Reply Lengths**: Short (<100 chars), medium, or long detailed replies
- **Custom System Prompts**: Override the default prompt with your own instructions
- **Monitor Mode**: Auto-detect posts containing specific keywords and highlight them
- **Cross-Browser**: Chrome (MV3) and Firefox (MV2)

## Development

```bash
cd extension

# Chrome
npm run dev

# Firefox
npm run dev:firefox
```

Open `chrome://extensions` (Chrome) or `about:debugging` (Firefox) and load the `.output/<browser>/` directory.

## Build

```bash
# Chrome
npm run build

# Firefox
npm run build:firefox

# ZIP for stores
npm run zip
npm run zip:firefox
```

## Project Structure

| Path | Description |
|------|-------------|
| `entrypoints/background.ts` | Service worker — AI API calls |
| `entrypoints/content.ts` | Content script — detects posts, injects UI, fills composers |
| `entrypoints/popup/` | Extension popup — quick settings (Vue 3) |
| `entrypoints/options/` | Options page — full settings (Vue 3) |
| `wxt.config.ts` | WXT config, manifest, permissions |

## How to Use

1. Open the extension popup or options page
2. Enter your API key for your preferred AI provider
3. Choose tone, accent, and reply length
4. Navigate to [x.com](https://x.com) or [facebook.com](https://facebook.com)
5. Click the **AI Reply** button on any post
6. The generated reply appears in the composer — review, edit, and post

## Setup Requirements

You need an API key from one of the supported providers:
- [Kimi / Moonshot](https://platform.moonshot.cn)
- [DeepSeek](https://platform.deepseek.com)
- [OpenAI](https://platform.openai.com)

Your API key is stored locally in browser storage and is only used to call the selected provider's API.
