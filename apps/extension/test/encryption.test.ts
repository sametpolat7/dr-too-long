import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Encryption = typeof import('../src/settings/encryption.ts');

async function newContext(): Promise<Encryption> {
  vi.resetModules();
  return import('../src/settings/encryption.ts');
}

function storedKeys(): Promise<CryptoKey[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dr-too-long');
    request.onsuccess = () => {
      const database = request.result;
      const [store = ''] = database.objectStoreNames;
      const all = database.transaction(store).objectStore(store).getAll();
      all.onsuccess = () => {
        database.close();
        resolve(all.result);
      };
      all.onerror = () => reject(all.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('encryption', () => {
  beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));

  it('decrypts what it encrypted, with a fresh IV each time', async () => {
    const { encrypt, decrypt } = await newContext();
    const first = await encrypt('test-key', 'openai');
    const second = await encrypt('test-key', 'openai');
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(await decrypt(first, 'openai')).toBe('test-key');
    expect(await decrypt(second, 'openai')).toBe('test-key');
  });

  it('keeps one non-extractable AES-GCM key in IndexedDB', async () => {
    const { encrypt } = await newContext();
    await encrypt('test-key', 'openai');
    const keys = await storedKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]?.extractable).toBe(false);
    expect(keys[0]?.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  });

  it('gives two contexts that start at once the same key', async () => {
    const page = await newContext();
    const worker = await newContext();
    const [fromPage, fromWorker] = await Promise.all([
      page.encrypt('test-page-key', 'openai'),
      worker.encrypt('test-worker-key', 'openai'),
    ]);
    expect(await worker.decrypt(fromPage, 'openai')).toBe('test-page-key');
    expect(await page.decrypt(fromWorker, 'openai')).toBe('test-worker-key');
    expect(await storedKeys()).toHaveLength(1);
  });

  it('tries IndexedDB again after a failed load', async () => {
    const { encrypt, decrypt } = await newContext();
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Internal error opening backing store', 'UnknownError');
    });
    await expect(encrypt('test-key', 'openai')).rejects.toThrow('backing store');
    open.mockRestore();
    expect(await decrypt(await encrypt('test-key', 'openai'), 'openai')).toBe('test-key');
  });

  it('fails rather than waits when the key cannot be stored', async () => {
    const { encrypt } = await newContext();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    await expect(encrypt('test-key', 'openai')).rejects.toBeDefined();
  });

  it('refuses a record whose context was changed', async () => {
    const { encrypt, decrypt } = await newContext();
    const sealed = await encrypt('test-key', 'openai');
    await expect(decrypt(sealed, 'anthropic')).rejects.toMatchObject({ name: 'OperationError' });
  });

  it('decrypts in a later context what an earlier one encrypted', async () => {
    const sealed = await (await newContext()).encrypt('test-key', 'openai');
    expect(await (await newContext()).decrypt(sealed, 'openai')).toBe('test-key');
  });
});
