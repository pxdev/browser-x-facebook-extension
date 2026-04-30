export type SourceKind =
  | 'news'
  | 'wiki'
  | 'state-affiliated'
  | 'official'
  | 'fact-check'
  | 'academic'
  | 'blog'
  | 'social'
  | 'forum'
  | 'unknown';

export type SourceLean = 'left' | 'center-left' | 'center' | 'center-right' | 'right' | 'mixed';

export interface SourceLabel {
  kind: SourceKind;
  lean?: SourceLean;
  notes?: string;
}

const TABLE: Record<string, SourceLabel> = {
  // ── Wire / international news ─────────────────────────────────────
  'reuters.com': { kind: 'news', lean: 'center' },
  'apnews.com': { kind: 'news', lean: 'center' },
  'afp.com': { kind: 'news', lean: 'center' },
  'bbc.com': { kind: 'news', lean: 'center-left' },
  'bbc.co.uk': { kind: 'news', lean: 'center-left' },
  'aljazeera.com': { kind: 'news', lean: 'mixed', notes: 'Qatar-funded' },
  'aljazeera.net': { kind: 'news', lean: 'mixed', notes: 'Qatar-funded' },
  'cnn.com': { kind: 'news', lean: 'left' },
  'foxnews.com': { kind: 'news', lean: 'right' },
  'nytimes.com': { kind: 'news', lean: 'center-left' },
  'washingtonpost.com': { kind: 'news', lean: 'center-left' },
  'wsj.com': { kind: 'news', lean: 'center-right' },
  'theguardian.com': { kind: 'news', lean: 'left' },
  'thetimes.co.uk': { kind: 'news', lean: 'center-right' },
  'telegraph.co.uk': { kind: 'news', lean: 'right' },
  'economist.com': { kind: 'news', lean: 'center' },
  'bloomberg.com': { kind: 'news', lean: 'center' },
  'ft.com': { kind: 'news', lean: 'center' },
  'npr.org': { kind: 'news', lean: 'center-left' },
  'pbs.org': { kind: 'news', lean: 'center-left' },
  'politico.com': { kind: 'news', lean: 'center' },
  'axios.com': { kind: 'news', lean: 'center' },
  'thehill.com': { kind: 'news', lean: 'center' },
  'usatoday.com': { kind: 'news', lean: 'center' },
  'time.com': { kind: 'news', lean: 'center-left' },
  'newsweek.com': { kind: 'news', lean: 'center' },
  'nbcnews.com': { kind: 'news', lean: 'center-left' },
  'cbsnews.com': { kind: 'news', lean: 'center-left' },
  'abcnews.go.com': { kind: 'news', lean: 'center-left' },
  'msnbc.com': { kind: 'news', lean: 'left' },
  'huffpost.com': { kind: 'news', lean: 'left' },
  'vox.com': { kind: 'news', lean: 'left' },
  'theatlantic.com': { kind: 'news', lean: 'center-left' },
  'newyorker.com': { kind: 'news', lean: 'left' },
  'nationalreview.com': { kind: 'news', lean: 'right' },
  'breitbart.com': { kind: 'news', lean: 'right' },
  'dailywire.com': { kind: 'news', lean: 'right' },
  'nypost.com': { kind: 'news', lean: 'right' },
  'thefederalist.com': { kind: 'news', lean: 'right' },
  'spectator.co.uk': { kind: 'news', lean: 'right' },
  'independent.co.uk': { kind: 'news', lean: 'center-left' },
  'dailymail.co.uk': { kind: 'news', lean: 'right' },
  'mirror.co.uk': { kind: 'news', lean: 'left' },
  'metro.co.uk': { kind: 'news', lean: 'center' },
  'lemonde.fr': { kind: 'news', lean: 'center-left' },
  'lefigaro.fr': { kind: 'news', lean: 'center-right' },
  'liberation.fr': { kind: 'news', lean: 'left' },
  'spiegel.de': { kind: 'news', lean: 'center-left' },
  'zeit.de': { kind: 'news', lean: 'center-left' },
  'faz.net': { kind: 'news', lean: 'center-right' },
  'welt.de': { kind: 'news', lean: 'center-right' },
  'haaretz.com': { kind: 'news', lean: 'center-left' },
  'timesofisrael.com': { kind: 'news', lean: 'center' },
  'jpost.com': { kind: 'news', lean: 'center-right' },
  'arabnews.com': { kind: 'news', lean: 'mixed', notes: 'Saudi-funded' },
  'gulfnews.com': { kind: 'news', lean: 'center' },
  'thenationalnews.com': { kind: 'news', lean: 'center', notes: 'UAE-based' },
  'middleeasteye.net': { kind: 'news', lean: 'left' },
  'al-monitor.com': { kind: 'news', lean: 'center' },
  'middleeastmonitor.com': { kind: 'news', lean: 'left' },
  'asharq-awsat.com': { kind: 'news', lean: 'center', notes: 'Saudi-owned' },
  'sky.com': { kind: 'news', lean: 'center' },
  'news.sky.com': { kind: 'news', lean: 'center' },
  'cbc.ca': { kind: 'news', lean: 'center-left' },
  'globalnews.ca': { kind: 'news', lean: 'center' },
  'abc.net.au': { kind: 'news', lean: 'center-left' },
  'smh.com.au': { kind: 'news', lean: 'center-left' },
  'theage.com.au': { kind: 'news', lean: 'center-left' },

  // ── State-affiliated / state media ──────────────────────────────────
  'rt.com': { kind: 'state-affiliated', notes: 'Russian state-controlled' },
  'tass.com': { kind: 'state-affiliated', notes: 'Russian state news agency' },
  'sputnikglobe.com': { kind: 'state-affiliated', notes: 'Russian state media' },
  'sputniknews.com': { kind: 'state-affiliated', notes: 'Russian state media' },
  'cgtn.com': { kind: 'state-affiliated', notes: 'Chinese state media' },
  'xinhuanet.com': { kind: 'state-affiliated', notes: 'Chinese state news agency' },
  'globaltimes.cn': { kind: 'state-affiliated', notes: 'Chinese state-affiliated' },
  'chinadaily.com.cn': { kind: 'state-affiliated', notes: 'Chinese state media' },
  'people.cn': { kind: 'state-affiliated', notes: 'Chinese state media' },
  'presstv.ir': { kind: 'state-affiliated', notes: 'Iranian state media' },
  'irna.ir': { kind: 'state-affiliated', notes: 'Iranian state news agency' },
  'tehrantimes.com': { kind: 'state-affiliated', notes: 'Iranian state-affiliated' },
  'saudigazette.com.sa': { kind: 'state-affiliated', notes: 'Saudi-affiliated' },
  'spa.gov.sa': { kind: 'state-affiliated', notes: 'Saudi state news agency' },
  'wam.ae': { kind: 'state-affiliated', notes: 'UAE state news agency' },
  'qna.org.qa': { kind: 'state-affiliated', notes: 'Qatari state news agency' },
  'mena.org.eg': { kind: 'state-affiliated', notes: 'Egyptian state news agency' },
  'anadoluagency.com': { kind: 'state-affiliated', notes: 'Turkish state-affiliated' },
  'aa.com.tr': { kind: 'state-affiliated', notes: 'Turkish state-affiliated' },
  'trtworld.com': { kind: 'state-affiliated', notes: 'Turkish state-affiliated' },
  'trt.net.tr': { kind: 'state-affiliated', notes: 'Turkish state-affiliated' },
  'voanews.com': { kind: 'state-affiliated', notes: 'US government-funded' },
  'rferl.org': { kind: 'state-affiliated', notes: 'US government-funded' },
  'dw.com': { kind: 'state-affiliated', notes: 'German public broadcaster' },
  'france24.com': { kind: 'state-affiliated', notes: 'French public broadcaster' },
  'rfi.fr': { kind: 'state-affiliated', notes: 'French public broadcaster' },

  // ── Fact-check ────────────────────────────────────────────────────
  'snopes.com': { kind: 'fact-check' },
  'politifact.com': { kind: 'fact-check' },
  'factcheck.org': { kind: 'fact-check' },
  'fullfact.org': { kind: 'fact-check' },
  'apnews.com/hub/ap-fact-check': { kind: 'fact-check' },
  'reuters.com/fact-check': { kind: 'fact-check' },
  'leadstories.com': { kind: 'fact-check' },
  'misbar.com': { kind: 'fact-check', notes: 'Arabic fact-checking' },
  'fatabyyano.net': { kind: 'fact-check', notes: 'Arabic fact-checking' },
  'verify-sy.com': { kind: 'fact-check', notes: 'Syria fact-checking' },
  'bellingcat.com': { kind: 'fact-check', notes: 'Open-source investigation' },

  // ── Wiki / reference ──────────────────────────────────────────────
  'wikipedia.org': { kind: 'wiki' },
  'en.wikipedia.org': { kind: 'wiki' },
  'ar.wikipedia.org': { kind: 'wiki' },
  'wikidata.org': { kind: 'wiki' },
  'britannica.com': { kind: 'wiki' },

  // ── Academic / research ───────────────────────────────────────────
  'nature.com': { kind: 'academic' },
  'science.org': { kind: 'academic' },
  'sciencedirect.com': { kind: 'academic' },
  'pubmed.ncbi.nlm.nih.gov': { kind: 'academic' },
  'arxiv.org': { kind: 'academic' },
  'ssrn.com': { kind: 'academic' },
  'jstor.org': { kind: 'academic' },
  'nejm.org': { kind: 'academic' },
  'bmj.com': { kind: 'academic' },
  'thelancet.com': { kind: 'academic' },
  'plos.org': { kind: 'academic' },
  'cell.com': { kind: 'academic' },
  'pnas.org': { kind: 'academic' },
  'scholar.google.com': { kind: 'academic' },

  // ── Official / government / NGO ───────────────────────────────────
  'who.int': { kind: 'official', notes: 'WHO' },
  'un.org': { kind: 'official', notes: 'UN' },
  'unhcr.org': { kind: 'official', notes: 'UNHCR' },
  'unicef.org': { kind: 'official', notes: 'UNICEF' },
  'icrc.org': { kind: 'official', notes: 'Red Cross' },
  'amnesty.org': { kind: 'official', notes: 'NGO' },
  'hrw.org': { kind: 'official', notes: 'Human Rights Watch' },
  'cdc.gov': { kind: 'official', notes: 'US gov' },
  'nih.gov': { kind: 'official', notes: 'US gov' },
  'fda.gov': { kind: 'official', notes: 'US gov' },
  'whitehouse.gov': { kind: 'official', notes: 'US gov' },
  'state.gov': { kind: 'official', notes: 'US gov' },
  'europa.eu': { kind: 'official', notes: 'EU institutions' },
  'gov.uk': { kind: 'official', notes: 'UK gov' },
  'parliament.uk': { kind: 'official', notes: 'UK parliament' },
  'congress.gov': { kind: 'official', notes: 'US Congress' },
  'nasa.gov': { kind: 'official', notes: 'US gov' },
  'noaa.gov': { kind: 'official', notes: 'US gov' },

  // ── Social / forum / blog ──────────────────────────────────────────
  'twitter.com': { kind: 'social' },
  'x.com': { kind: 'social' },
  'facebook.com': { kind: 'social' },
  'instagram.com': { kind: 'social' },
  'tiktok.com': { kind: 'social' },
  'youtube.com': { kind: 'social' },
  'reddit.com': { kind: 'forum' },
  'quora.com': { kind: 'forum' },
  'stackexchange.com': { kind: 'forum' },
  'medium.com': { kind: 'blog' },
  'substack.com': { kind: 'blog' },
  'wordpress.com': { kind: 'blog' },
  'blogspot.com': { kind: 'blog' },
  'tumblr.com': { kind: 'blog' },
};

const KIND_PALETTE: Record<SourceKind, { bg: string; fg: string; border: string }> = {
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

const LEAN_LABEL: Record<SourceLean, string> = {
  left: 'L',
  'center-left': 'CL',
  center: 'C',
  'center-right': 'CR',
  right: 'R',
  mixed: 'M',
};

export function labelSource(url: string): SourceLabel {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { kind: 'unknown' };
  }

  if (TABLE[host]) return TABLE[host];

  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (TABLE[candidate]) return TABLE[candidate];
  }

  if (host.endsWith('.gov') || host.endsWith('.gov.uk') || host.endsWith('.gc.ca') || host.endsWith('.gov.au')) {
    return { kind: 'official' };
  }
  if (host.endsWith('.edu') || host.endsWith('.ac.uk') || host.endsWith('.edu.au')) {
    return { kind: 'academic' };
  }
  if (host.endsWith('.wikipedia.org') || host.endsWith('.wikimedia.org')) {
    return { kind: 'wiki' };
  }

  return { kind: 'unknown' };
}

export function paletteFor(kind: SourceKind) {
  return KIND_PALETTE[kind] ?? KIND_PALETTE.unknown;
}

export function leanShort(lean?: SourceLean): string {
  return lean ? LEAN_LABEL[lean] : '';
}

export function kindShort(kind: SourceKind): string {
  if (kind === 'state-affiliated') return 'state';
  if (kind === 'fact-check') return 'fact-check';
  return kind;
}
