import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { JSONValue, LanguageModel } from 'ai';
import type { ProviderId } from '../providers/index.ts';

type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface ModelSetup {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}

// The key authorizes each call; cookies the browser holds for the provider's domain stay out of it.
const fetchWithoutCookies: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: 'omit' });

const MODELS: Record<ProviderId, (apiKey: string) => ModelSetup> = {
  openai: (apiKey) => ({
    model: createOpenAI({ apiKey, fetch: fetchWithoutCookies })('gpt-6-luna'),
    // The Responses API otherwise keeps each response for 30 days.
    providerOptions: { openai: { reasoningEffort: 'none', store: false } },
  }),
  anthropic: (apiKey) => ({
    // Chrome sends an Origin header from the service worker, and Anthropic refuses a request
    // with an Origin unless this header is set.
    model: createAnthropic({
      apiKey,
      fetch: fetchWithoutCookies,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    })('claude-haiku-5-5'),
    // Thinking is on by default and its tokens count toward the output cap.
    providerOptions: { anthropic: { thinking: { type: 'disabled' } } },
  }),
  google: (apiKey) => ({
    model: createGoogle({ apiKey, fetch: fetchWithoutCookies })('gemini-3.5-flash-lite'),
  }),
};

export function providerModel(provider: ProviderId, apiKey: string): ModelSetup {
  return MODELS[provider](apiKey);
}
