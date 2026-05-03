import { defineConfig } from 'wxt';
import { getProviderHostPermissions } from './utils/providers';

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
      ...getProviderHostPermissions(),
      'https://api.search.brave.com/*',
      'https://api.tavily.com/*',
      'https://web.archive.org/*',
      'https://archive.ph/*',
      'https://archive.today/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
    ],
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
