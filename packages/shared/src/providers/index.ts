import { createOpenAI } from '@ai-sdk/openai';
import type { JSONValue, LanguageModel } from 'ai';

export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export interface Provider {
  apiHost: string;
  createModel(apiKey: string, modelId: string): LanguageModel;
}

export const PROVIDERS = {
  openai: {
    apiHost: 'https://api.openai.com',
    createModel: (apiKey, modelId) => createOpenAI({ apiKey })(modelId),
  },
} satisfies Record<string, Provider>;

export interface ModelChoice {
  provider: keyof typeof PROVIDERS;
  modelId: string;
  providerOptions?: ProviderOptions;
}

export interface ModelSetup {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
}

// gpt-6-luna accepts reasoning effort 'none', its lowest-latency mode.
export const ACTIVE_MODEL: ModelChoice = {
  provider: 'openai',
  modelId: 'gpt-6-luna',
  providerOptions: { openai: { reasoningEffort: 'none' } },
};

export function activeModel(apiKey: string): ModelSetup {
  const { provider, modelId, providerOptions } = ACTIVE_MODEL;
  return { model: PROVIDERS[provider].createModel(apiKey, modelId), providerOptions };
}
