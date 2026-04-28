import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'X Reply Generator',
    description: 'Detects posts on X and Facebook and generates AI replies',
    permissions: ['storage', 'activeTab'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://www.facebook.com/*',
      'https://facebook.com/*',
      'https://m.facebook.com/*',
      'https://api.openai.com/*',
      'https://api.moonshot.cn/*',
      'https://api.deepseek.com/*',
    ],
    commands: {
      'generate-reply': {
        suggested_key: {
          default: 'Ctrl+Shift+R',
          mac: 'Command+Shift+R',
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
