export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type SearchProvider = 'brave' | 'tavily' | 'none';

export interface SearchSettings {
  enabled: boolean;
  provider: SearchProvider;
  apiKey: string;
}

export async function loadSearchSettings(): Promise<SearchSettings> {
  const stored = await browser.storage.local.get(['searchEnabled', 'searchProvider', 'searchApiKey']);
  return {
    enabled: !!stored.searchEnabled,
    provider: (stored.searchProvider as SearchProvider) || 'brave',
    apiKey: ((stored.searchApiKey as string) || '').trim(),
  };
}

export async function webSearch(query: string, settings: SearchSettings, count = 5): Promise<SearchResult[]> {
  if (!settings.enabled) throw new Error('Search is disabled');
  if (!settings.apiKey) throw new Error('No search API key configured');
  const trimmed = query.trim();
  if (!trimmed) return [];

  switch (settings.provider) {
    case 'brave':
      return braveSearch(trimmed, settings.apiKey, count);
    case 'tavily':
      return tavilySearch(trimmed, settings.apiKey, count);
    case 'none':
    default:
      throw new Error(`Unsupported search provider: ${settings.provider}`);
  }
}

async function braveSearch(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const response = await fetch(url, {
    headers: {
      'X-Subscription-Token': apiKey,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Brave search failed (${response.status}): ${text.slice(0, 120)}`);
  }
  const data = await response.json();
  const results = (data?.web?.results ?? []) as Array<{ title?: string; url?: string; description?: string }>;
  return results
    .slice(0, count)
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: stripHtml(r.description || ''),
    }));
}

async function tavilySearch(query: string, apiKey: string, count: number): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: count,
      search_depth: 'basic',
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Tavily failed (${response.status}): ${text.slice(0, 120)}`);
  }
  const data = await response.json();
  const results = (data?.results ?? []) as Array<{ title?: string; url?: string; content?: string }>;
  return results
    .slice(0, count)
    .filter((r) => r.title && r.url)
    .map((r) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
    }));
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
