export type ProviderId = 'anthropic' | 'openai';

export interface ModelChoice {
  provider: ProviderId;
  modelId: string;
}

export const ACTIVE_MODEL: ModelChoice = { provider: 'anthropic', modelId: 'claude-haiku-5-5' };
