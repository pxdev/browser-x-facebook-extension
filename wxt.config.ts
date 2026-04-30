import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'X Reply Generator',
    description: 'Detects posts on X and Facebook and generates AI replies',
    permissions: ['storage', 'activeTab', 'contextMenus', 'scripting'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://www.facebook.com/*',
      'https://facebook.com/*',
      'https://m.facebook.com/*',
      'https://api.openai.com/*',
      'https://api.moonshot.cn/*',
      'https://api.deepseek.com/*',
      'https://api.x.ai/*',
      'https://generativelanguage.googleapis.com/*',
      'https://api.search.brave.com/*',
      'https://api.tavily.com/*',
      'https://web.archive.org/*',
      'https://archive.ph/*',
      'https://archive.today/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
    optional_host_permissions: ['https://*/*'],
    commands: {
      'generate-reply': {
        suggested_key: {
          default: 'Alt+Shift+R',
          mac: 'Alt+Shift+R',
        },
        description: 'Generate AI reply for the focused post',
      },
    },
  },
  webExt: {
    startUrls: ['https://x.com'],
  },
  suppressWarnings: {
    firefoxDataCollection: true,
  },
});
