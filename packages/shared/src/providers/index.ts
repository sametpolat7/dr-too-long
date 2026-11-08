export const PROVIDER_IDS = ['openai', 'anthropic', 'google'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

interface Provider {
  name: string;
  apiHost: string;
  // Where the reader creates a key.
  keysUrl: string;
  // How that provider's keys begin, so a key pasted under the wrong provider can be caught.
  keyPrefixes: string[];
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  openai: {
    name: 'OpenAI',
    apiHost: 'https://api.openai.com',
    keysUrl: 'https://platform.openai.com/settings/organization/api-keys',
    keyPrefixes: ['sk-'],
  },
  anthropic: {
    name: 'Claude',
    apiHost: 'https://api.anthropic.com',
    keysUrl: 'https://platform.claude.com/settings/keys',
    keyPrefixes: ['sk-ant-'],
  },
  google: {
    name: 'Gemini',
    apiHost: 'https://generativelanguage.googleapis.com',
    keysUrl: 'https://aistudio.google.com/apikey',
    keyPrefixes: ['AIza', 'AQ.'],
  },
};

export const isProviderId = (value: unknown): value is ProviderId =>
  (PROVIDER_IDS as readonly unknown[]).includes(value);

// The provider whose longest prefix starts the key: Claude's sk-ant- wins over OpenAI's sk-.
export function providerOfKey(key: string): ProviderId | undefined {
  let match: { id: ProviderId; length: number } | undefined;
  for (const id of PROVIDER_IDS) {
    for (const prefix of PROVIDERS[id].keyPrefixes) {
      if (key.startsWith(prefix) && prefix.length > (match?.length ?? 0)) {
        match = { id, length: prefix.length };
      }
    }
  }
  return match?.id;
}
