/**
 * Best-effort encryption for API keys stored in browser.storage.local.
 * Uses PBKDF2 + AES-GCM with a device-derived salt.
 * Not military-grade, but prevents casual plaintext inspection.
 */

const SALT_KEY = 'xrg-crypto-salt-v1';
const ITERATIONS = 100_000;

async function getOrCreateSalt(): Promise<Uint8Array> {
  const stored = await browser.storage.local.get([SALT_KEY]);
  const existing = stored[SALT_KEY];
  if (existing && typeof existing === 'string') {
    const buf = Uint8Array.from(atob(existing), (c) => c.charCodeAt(0));
    if (buf.length === 16) return buf;
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  await browser.storage.local.set({ [SALT_KEY]: btoa(String.fromCharCode(...salt)) });
  return salt;
}

function getDeviceMaterial(): string {
  // Combine extension ID + user agent for a semi-stable device fingerprint.
  // If the extension is reinstalled, the ID changes and decryption will fail
  // gracefully (user is prompted to re-enter keys).
  return `${browser.runtime.id ?? ''}:${navigator.userAgent ?? ''}`;
}

async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(getDeviceMaterial()),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptApiKeys(keys: Record<string, string>): Promise<string> {
  const salt = await getOrCreateSalt();
  const key = await deriveKey(salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(keys))
  );
  // Format: base64(salt) + ':' + base64(iv) + ':' + base64(ciphertext)
  const parts = [
    btoa(String.fromCharCode(...salt)),
    btoa(String.fromCharCode(...iv)),
    btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  ];
  return parts.join(':');
}

export async function decryptApiKeys(ciphertext: string): Promise<Record<string, string>> {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const salt = Uint8Array.from(atob(parts[0]), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const key = await deriveKey(salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted)) as Record<string, string>;
}

/**
 * Try to read API keys from storage.
 * If the value is plaintext (Record), encrypt it and rewrite.
 * If encrypted, decrypt it.
 * Returns empty object on failure.
 */
export async function loadApiKeys(): Promise<{
  keys: Record<string, string>;
  encrypted: boolean;
  migrated: boolean;
  error?: string;
}> {
  try {
    const stored = await browser.storage.local.get(['apiKeys']);
    const raw = stored.apiKeys;
    if (!raw) return { keys: {}, encrypted: false, migrated: false };

    // Already encrypted (string with colons)
    if (typeof raw === 'string' && raw.includes(':')) {
      try {
        const keys = await decryptApiKeys(raw);
        return { keys, encrypted: true, migrated: false };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Decryption failed';
        return { keys: {}, encrypted: true, migrated: false, error: msg };
      }
    }

    // Plaintext object — migrate to encrypted
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const keys = raw as Record<string, string>;
      const encrypted = await encryptApiKeys(keys);
      await browser.storage.local.set({ apiKeys: encrypted });
      return { keys, encrypted: true, migrated: true };
    }

    return { keys: {}, encrypted: false, migrated: false, error: 'Unexpected apiKeys format' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load keys';
    return { keys: {}, encrypted: false, migrated: false, error: msg };
  }
}

export async function saveApiKeys(keys: Record<string, string>): Promise<void> {
  const encrypted = await encryptApiKeys(keys);
  await browser.storage.local.set({ apiKeys: encrypted });
}
