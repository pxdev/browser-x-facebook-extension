import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'x-reply-gen';
const DB_VERSION = 2;

export type Platform = 'x' | 'facebook';

export interface CaptureRow {
  id?: number;
  ts: number;
  platform: Platform;
  postUrl?: string;
  author?: string;
  text: string;
  generatedReply?: string;
  factCheck?: {
    verdict: string;
    confidence: string;
    summary: string;
    reasoning: string;
    sources?: Array<{ title: string; url: string; kind?: string }>;
  };
  screenshotData?: string;
  screenshotSha256?: string;
  notes?: string;
}

export interface NarrativeHitRow {
  id?: number;
  ts: number;
  platform: Platform;
  keyword: string;
  text: string;
  author?: string;
  postUrl?: string;
  sentimentQuick?: 'positive' | 'negative' | 'neutral';
}

export interface WatchlistRow {
  id?: number;
  kind: 'account' | 'keyword';
  value: string;
  createdAt: number;
  unreadHits: number;
  lastHitTs?: number;
}

export interface WatchlistHitRow {
  id?: number;
  ts: number;
  watchlistId: number;
  platform: Platform;
  text: string;
  author?: string;
  postUrl?: string;
  read: boolean;
}

export interface ReplyHistoryRow {
  id?: number;
  ts: number;
  platform: Platform;
  postTextHash: string;
  reply: string;
  tone: string;
  accent: string;
  provider: string;
}

interface XrgSchema extends DBSchema {
  captures: {
    key: number;
    value: CaptureRow;
    indexes: { 'by-ts': number; 'by-platform': Platform };
  };
  narrativeHits: {
    key: number;
    value: NarrativeHitRow;
    indexes: { 'by-ts': number; 'by-keyword': string };
  };
  watchlists: {
    key: number;
    value: WatchlistRow;
    indexes: { 'by-kind': 'account' | 'keyword' };
  };
  watchlistHits: {
    key: number;
    value: WatchlistHitRow;
    indexes: { 'by-ts': number; 'by-watchlist': number; 'by-read': string };
  };
  replyHistory: {
    key: number;
    value: ReplyHistoryRow;
    indexes: { 'by-ts': number; 'by-hash': string };
  };
  schemaMeta: {
    key: string;
    value: { key: string; value: string };
  };
}

const migrations: Record<number, (db: IDBPDatabase<XrgSchema>) => void> = {
  1: (db) => {
    const captures = db.createObjectStore('captures', { keyPath: 'id', autoIncrement: true });
    captures.createIndex('by-ts', 'ts');
    captures.createIndex('by-platform', 'platform');

    const hits = db.createObjectStore('narrativeHits', { keyPath: 'id', autoIncrement: true });
    hits.createIndex('by-ts', 'ts');
    hits.createIndex('by-keyword', 'keyword');

    const watchlists = db.createObjectStore('watchlists', { keyPath: 'id', autoIncrement: true });
    watchlists.createIndex('by-kind', 'kind');

    const wlHits = db.createObjectStore('watchlistHits', { keyPath: 'id', autoIncrement: true });
    wlHits.createIndex('by-ts', 'ts');
    wlHits.createIndex('by-watchlist', 'watchlistId');
    wlHits.createIndex('by-read', 'read' as any);
  },
  2: (db) => {
    const replyHistory = db.createObjectStore('replyHistory', { keyPath: 'id', autoIncrement: true });
    replyHistory.createIndex('by-ts', 'ts');
    replyHistory.createIndex('by-hash', 'postTextHash');

    db.createObjectStore('schemaMeta', { keyPath: 'key' });
  },
};

let dbPromise: Promise<IDBPDatabase<XrgSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<XrgSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<XrgSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (let v = oldVersion + 1; v <= DB_VERSION; v++) {
          if (migrations[v]) {
            try {
              migrations[v](db);
            } catch (err) {
              console.error(`[X Reply Gen] DB migration ${v} failed:`, err);
              throw err;
            }
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function addCapture(row: Omit<CaptureRow, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add('captures', row as CaptureRow);
}

export async function listCaptures(limit = 200): Promise<CaptureRow[]> {
  const db = await getDb();
  const tx = db.transaction('captures', 'readonly');
  const idx = tx.store.index('by-ts');
  const out: CaptureRow[] = [];
  let cursor = await idx.openCursor(null, 'prev');
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

export async function deleteCapture(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('captures', id);
}

export async function wipeCaptures(): Promise<void> {
  const db = await getDb();
  await db.clear('captures');
}

export async function addNarrativeHit(row: Omit<NarrativeHitRow, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add('narrativeHits', row as NarrativeHitRow);
}

export async function listNarrativeHits(opts: { since?: number; keyword?: string; limit?: number } = {}): Promise<NarrativeHitRow[]> {
  const db = await getDb();
  const limit = opts.limit ?? 1000;
  const tx = db.transaction('narrativeHits', 'readonly');
  const idx = tx.store.index('by-ts');
  const out: NarrativeHitRow[] = [];
  const lower = opts.since ?? 0;
  const range = IDBKeyRange.lowerBound(lower);
  let cursor = await idx.openCursor(range, 'prev');
  while (cursor && out.length < limit) {
    if (!opts.keyword || cursor.value.keyword === opts.keyword) {
      out.push(cursor.value);
    }
    cursor = await cursor.continue();
  }
  return out;
}

export async function listWatchlists(): Promise<WatchlistRow[]> {
  const db = await getDb();
  return db.getAll('watchlists');
}

export async function addWatchlist(row: Omit<WatchlistRow, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add('watchlists', row as WatchlistRow);
}

export async function deleteWatchlist(id: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['watchlists', 'watchlistHits'], 'readwrite');
  await tx.objectStore('watchlists').delete(id);
  const hitIdx = tx.objectStore('watchlistHits').index('by-watchlist');
  let cursor = await hitIdx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function addWatchlistHit(row: Omit<WatchlistHitRow, 'id'>): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['watchlistHits', 'watchlists'], 'readwrite');
  const id = await tx.objectStore('watchlistHits').add(row as WatchlistHitRow);
  const wl = await tx.objectStore('watchlists').get(row.watchlistId);
  if (wl) {
    wl.unreadHits = (wl.unreadHits ?? 0) + (row.read ? 0 : 1);
    wl.lastHitTs = row.ts;
    await tx.objectStore('watchlists').put(wl);
  }
  await tx.done;
  return id;
}

export async function markWatchlistRead(watchlistId: number): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['watchlistHits', 'watchlists'], 'readwrite');
  const idx = tx.objectStore('watchlistHits').index('by-watchlist');
  let cursor = await idx.openCursor(IDBKeyRange.only(watchlistId));
  while (cursor) {
    if (!cursor.value.read) {
      cursor.value.read = true;
      await cursor.update(cursor.value);
    }
    cursor = await cursor.continue();
  }
  const wl = await tx.objectStore('watchlists').get(watchlistId);
  if (wl) {
    wl.unreadHits = 0;
    await tx.objectStore('watchlists').put(wl);
  }
  await tx.done;
}

export async function totalUnreadHits(): Promise<number> {
  const wls = await listWatchlists();
  return wls.reduce((sum, w) => sum + (w.unreadHits ?? 0), 0);
}

// Reply history helpers
export async function addReplyHistory(row: Omit<ReplyHistoryRow, 'id'>): Promise<number> {
  const db = await getDb();
  return db.add('replyHistory', row as ReplyHistoryRow);
}

export async function listReplyHistory(postTextHash?: string, limit = 50): Promise<ReplyHistoryRow[]> {
  const db = await getDb();
  const tx = db.transaction('replyHistory', 'readonly');
  const out: ReplyHistoryRow[] = [];
  if (postTextHash) {
    const idx = tx.store.index('by-hash');
    let cursor = await idx.openCursor(IDBKeyRange.only(postTextHash), 'prev');
    while (cursor && out.length < limit) {
      out.push(cursor.value);
      cursor = await cursor.continue();
    }
  } else {
    const idx = tx.store.index('by-ts');
    let cursor = await idx.openCursor(null, 'prev');
    while (cursor && out.length < limit) {
      out.push(cursor.value);
      cursor = await cursor.continue();
    }
  }
  return out;
}
