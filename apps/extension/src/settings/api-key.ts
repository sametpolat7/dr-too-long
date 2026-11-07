import { isProviderId, type ProviderId } from '@dr-too-long/shared/providers';
import { storage } from 'wxt/utils/storage';
import { decrypt, encrypt, type Sealed } from './encryption.ts';

export interface ApiKey {
  provider: ProviderId;
  key: string;
}

interface StoredKey extends Sealed {
  provider: ProviderId;
}

const apiKey = storage.defineItem<StoredKey>('local:apiKey');

function isStoredKey(value: unknown): value is StoredKey {
  if (typeof value !== 'object' || value === null) return false;
  const { provider, iv, ciphertext } = value as Record<string, unknown>;
  return isProviderId(provider) && typeof iv === 'string' && typeof ciphertext === 'string';
}

// A value this build cannot use, such as the plain-text key earlier builds kept or a record naming
// a provider it no longer has, is deleted rather than left on disk.
async function readStoredKey(): Promise<StoredKey | null> {
  const stored = await apiKey.getValue();
  if (isStoredKey(stored)) return stored;
  if (stored !== null) await apiKey.removeValue();
  return null;
}

export async function readKeyProvider(): Promise<ProviderId | null> {
  return (await readStoredKey())?.provider ?? null;
}

export async function readApiKey(): Promise<ApiKey | null> {
  const stored = await readStoredKey();
  if (stored === null) return null;
  try {
    return { provider: stored.provider, key: await decrypt(stored) };
  } catch {
    return null;
  }
}

export async function writeApiKey({ provider, key }: ApiKey): Promise<void> {
  await apiKey.setValue({ provider, ...(await encrypt(key.trim())) });
}

export const removeApiKey = (): Promise<void> => apiKey.removeValue();
