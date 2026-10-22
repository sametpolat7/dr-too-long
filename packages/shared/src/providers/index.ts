export interface ModelChoice {
  provider: string;
  modelId: string;
}

export const ACTIVE_MODEL: ModelChoice = { provider: 'openai', modelId: 'gpt-6-luna' };
