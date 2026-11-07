export const PROVIDER_IDS = ['openai', 'anthropic', 'google'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDERS: Record<ProviderId, { name: string; apiHost: string }> = {
  openai: { name: 'OpenAI', apiHost: 'https://api.openai.com' },
  anthropic: { name: 'Claude', apiHost: 'https://api.anthropic.com' },
  google: { name: 'Gemini', apiHost: 'https://generativelanguage.googleapis.com' },
};

export const isProviderId = (value: unknown): value is ProviderId =>
  (PROVIDER_IDS as readonly unknown[]).includes(value);
