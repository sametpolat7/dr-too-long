import { describe, expect, it } from 'vitest';
import { providerModel } from '../src/model/index.ts';
import { PROVIDER_IDS, PROVIDERS } from '../src/providers/index.ts';
import { callProvider } from './provider-call.ts';

const serverError = () => new Response('{}', { status: 500 });

describe('providerModel', () => {
  it.each([
    ['openai', 'openai.responses', 'gpt-6-luna'],
    ['anthropic', 'anthropic.messages', 'claude-haiku-5-5'],
    ['google', 'google.generative-ai', 'gemini-3.5-flash-lite'],
  ] as const)('sets up %s as %s with %s', (provider, sdkProvider, modelId) => {
    expect(providerModel(provider, 'test-key').model).toMatchObject({
      provider: sdkProvider,
      modelId,
    });
  });

  it.each(PROVIDER_IDS)('calls %s at its listed API host', async (provider) => {
    const { url } = await callProvider(provider, serverError);
    expect(new URL(String(url)).origin).toBe(PROVIDERS[provider].apiHost);
  });

  it.each(PROVIDER_IDS)('calls %s without cookies', async (provider) => {
    const { init } = await callProvider(provider, serverError);
    expect(init?.credentials).toBe('omit');
  });

  it('marks an Anthropic call as made from the browser on purpose', async () => {
    const { init } = await callProvider('anthropic', serverError);
    expect(new Headers(init?.headers).get('anthropic-dangerous-direct-browser-access')).toBe(
      'true',
    );
  });

  it.each([
    ['openai', { store: false, reasoning: { effort: 'none' } }],
    ['anthropic', { thinking: { type: 'disabled' } }],
  ] as const)('sends %s its options', async (provider, options) => {
    const { init } = await callProvider(provider, serverError);
    expect(JSON.parse(String(init?.body))).toMatchObject(options);
  });
});
