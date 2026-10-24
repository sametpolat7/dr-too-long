import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { readApiKey, removeApiKey, writeApiKey } from '../src/settings/api-key.ts';

describe('api key storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('is empty until a key is written', async () => {
    expect(await readApiKey()).toBeNull();
  });

  it('round-trips a trimmed key', async () => {
    await writeApiKey('  secret-key  ');
    expect(await readApiKey()).toBe('secret-key');
  });

  it('forgets a removed key', async () => {
    await writeApiKey('secret-key');
    await removeApiKey();
    expect(await readApiKey()).toBeNull();
  });
});
