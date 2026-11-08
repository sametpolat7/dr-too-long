import { PROVIDER_IDS } from '@dr-too-long/shared/providers';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readApiKey, readKeyProvider, removeApiKey, writeApiKey } from '../src/settings/api-key.ts';
import { encrypt } from '../src/settings/encryption.ts';

const stored = async () =>
  (await fakeBrowser.storage.local.get<{ apiKey: object }>('apiKey')).apiKey;
const store = (value: unknown) => fakeBrowser.storage.local.set({ apiKey: value });

describe('api key storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is empty until a key is written', async () => {
    expect(await readApiKey()).toBeNull();
    expect(await readKeyProvider()).toBeNull();
  });

  it.each(PROVIDER_IDS)('round-trips a trimmed %s key', async (provider) => {
    await writeApiKey({ provider, key: '  test-key  ' });
    expect(await readApiKey()).toEqual({ provider, key: 'test-key' });
    expect(await readKeyProvider()).toBe(provider);
  });

  it('keeps one key, so a key for another provider replaces it', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    await writeApiKey({ provider: 'google', key: 'test-gemini-key' });
    expect(await readApiKey()).toEqual({ provider: 'google', key: 'test-gemini-key' });
  });

  it('stores the key only in encrypted form', async () => {
    await writeApiKey({ provider: 'anthropic', key: 'test-claude-key' });
    const record = await stored();
    expect(record).toEqual({
      provider: 'anthropic',
      iv: expect.any(String),
      ciphertext: expect.any(String),
    });
    expect(JSON.stringify(record)).not.toContain('test-claude-key');
  });

  it.each([
    ['the plain-text key an earlier build stored', async () => 'test-plain-key'],
    [
      'a record naming a provider this build lacks',
      async () => ({ provider: 'mistral', ...(await encrypt('test-key')) }),
    ],
    ['a record with no ciphertext', async () => ({ provider: 'openai' })],
  ])('reads %s as no key and deletes it', async (_, value) => {
    await store(await value());
    expect(await readKeyProvider()).toBeNull();
    expect(await stored()).toBeUndefined();
    await store(await value());
    expect(await readApiKey()).toBeNull();
    expect(await stored()).toBeUndefined();
  });

  it('deletes a record it cannot decrypt, so no page reports it as saved', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    await store({ ...(await stored()), ciphertext: btoa('tampered') });
    expect(await readApiKey()).toBeNull();
    expect(await stored()).toBeUndefined();
    expect(await readKeyProvider()).toBeNull();
  });

  it('forgets a removed key', async () => {
    await writeApiKey({ provider: 'openai', key: 'test-openai-key' });
    await removeApiKey();
    expect(await readApiKey()).toBeNull();
    expect(await readKeyProvider()).toBeNull();
  });
});
