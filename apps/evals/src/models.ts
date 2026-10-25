import { createAnthropic } from '@ai-sdk/anthropic';
import type { PromptBuilder, TokenUsage } from '@dr-too-long/shared/contracts';
import {
  ACTIVE_MODEL,
  activeModel,
  type ModelSetup,
  PROVIDERS,
} from '@dr-too-long/shared/providers';
import { buildPromptV1 } from './prompt-v1.ts';

// USD per million tokens.
export interface Pricing {
  input: number;
  output: number;
}

export interface EvalModel {
  id: string;
  keyVariable: string;
  pricing: Pricing;
  setup(apiKey: string): ModelSetup;
}

// A model with a prompt; without one, the shipped prompt.
export interface Candidate {
  id: string;
  model: EvalModel;
  prompt?: PromptBuilder;
}

const KEY_VARIABLES = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

function openai(modelId: string): EvalModel['setup'] {
  return (apiKey) => ({ model: PROVIDERS.openai.createModel(apiKey, modelId) });
}

function anthropic(modelId: string): EvalModel['setup'] {
  return (apiKey) => ({ model: createAnthropic({ apiKey })(modelId) });
}

// List prices on 2026-10-25; confirm prices and retirements before a run. A model is served
// without a retirement date and costs under $0.001 per summary.
const SHIPPED: EvalModel = {
  id: `${ACTIVE_MODEL.provider}/${ACTIVE_MODEL.modelId}`,
  keyVariable: KEY_VARIABLES[ACTIVE_MODEL.provider],
  pricing: { input: 0.1, output: 0.5 },
  setup: activeModel,
};

const HAIKU: EvalModel = {
  id: 'anthropic/claude-haiku-5-5',
  keyVariable: KEY_VARIABLES.anthropic,
  pricing: { input: 0.1, output: 0.5 },
  setup: anthropic('claude-haiku-5-5'),
};

const SONNET: EvalModel = {
  id: 'anthropic/claude-sonnet-5-5',
  keyVariable: KEY_VARIABLES.anthropic,
  pricing: { input: 2, output: 10 },
  setup: anthropic('claude-sonnet-5-5'),
};

// The shipped model runs with the shipped prompt and with the previous one, so every run has a
// prompt baseline; a rival model or prompt joins for its run and leaves after the decision. The
// run of 2026-10-25 retired gpt-5.6-luna, gpt-5.4-mini and gpt-6-luna at reasoning low.
export const CANDIDATES: readonly Candidate[] = [
  { id: SHIPPED.id, model: SHIPPED },
  { id: `${SHIPPED.id}@prompt-1`, model: SHIPPED, prompt: buildPromptV1 },
  { id: HAIKU.id, model: HAIKU },
  { id: SONNET.id, model: SONNET },
];

// The current flagship at its default reasoning effort; it judges and never generates.
export const JUDGE: EvalModel = {
  id: 'openai/gpt-6.1-sol',
  keyVariable: KEY_VARIABLES.openai,
  pricing: { input: 2, output: 10 },
  setup: openai('gpt-6.1-sol'),
};

export function costUsd(
  { inputTokens, outputTokens }: TokenUsage,
  { input, output }: Pricing,
): number {
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}
