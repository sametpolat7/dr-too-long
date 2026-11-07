export interface Sealed {
  iv: string;
  ciphertext: string;
}

// chrome.storage holds only JSON, which a CryptoKey is not, so the key lives in IndexedDB.
const DATABASE = 'dr-too-long';
const STORE = 'keys';
const ENTRY = 'api-key';

let cachedKey: Promise<CryptoKey> | undefined;

export async function encrypt(text: string): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await loadKey(),
    new TextEncoder().encode(text),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decrypt({ iv, ciphertext }: Sealed): Promise<string> {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    await loadKey(),
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(bytes);
}

function loadKey(): Promise<CryptoKey> {
  cachedKey ??= readOrCreateKey().catch((error: unknown) => {
    cachedKey = undefined;
    throw error;
  });
  return cachedKey;
}

async function readOrCreateKey(): Promise<CryptoKey> {
  const database = await openDatabase();
  try {
    const stored = await settle<CryptoKey | undefined>(
      database.transaction(STORE).objectStore(STORE).get(ENTRY),
    );
    if (stored) return stored;
    // Non-extractable keeps the key's bytes from every script, though someone with the Chrome
    // profile on disk can still recover them.
    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    return await storeUnlessPresent(database, created);
  } finally {
    database.close();
  }
}

// The options page and the worker may both create a key at once.
function storeUnlessPresent(database: IDBDatabase, created: CryptoKey): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const existing = store.get(ENTRY);
    let kept = created;
    existing.onsuccess = () => {
      if (existing.result) kept = existing.result;
      else store.put(created, ENTRY);
    };
    transaction.oncomplete = () => resolve(kept);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE);
  return settle(request);
}

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
