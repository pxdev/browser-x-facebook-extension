export interface ProviderConfig {
  name: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
}

export const BUILTIN_PROVIDERS: Record<string, ProviderConfig> = {
  kimi: {
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    supportsVision: false,
  },
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-3',
    supportsVision: false,
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    supportsVision: true,
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    supportsVision: false,
  },
  google: {
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    supportsVision: true,
  },
};

export const PROVIDER_KEYS = Object.keys(BUILTIN_PROVIDERS);

export const providerLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(BUILTIN_PROVIDERS).map(([k, v]) => [k, v.name])
  ),
  ollama: 'Ollama',
  custom: 'Custom',
};

export function getProviderLabel(key: string): string {
  return providerLabels[key] || key;
}

/** Derive host_permissions entries from built-in provider baseUrls */
export function getProviderHostPermissions(): string[] {
  const hosts = new Set<string>();
  for (const config of Object.values(BUILTIN_PROVIDERS)) {
    try {
      const url = new URL(config.baseUrl);
      hosts.add(`${url.protocol}//${url.hostname}/*`);
    } catch {
      // ignore invalid URLs
    }
  }
  return Array.from(hosts);
}
