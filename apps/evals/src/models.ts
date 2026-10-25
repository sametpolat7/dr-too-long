import { createAnthropic } from '@ai-sdk/anthropic';
import type { TokenUsage } from '@dr-too-long/shared/contracts';
import {
  ACTIVE_MODEL,
  activeModel,
  type ModelSetup,
  PROVIDERS,
} from '@dr-too-long/shared/providers';

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

const KEY_VARIABLES = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' } as const;

function openai(modelId: string): EvalModel['setup'] {
  return (apiKey) => ({ model: PROVIDERS.openai.createModel(apiKey, modelId) });
}

function anthropic(modelId: string): EvalModel['setup'] {
  return (apiKey) => ({ model: createAnthropic({ apiKey })(modelId) });
}

// List prices on 2026-10-25; confirm prices and retirements before a run. A candidate is served
// without a retirement date and costs under $0.001 per summary; a rival is listed for its run and
// removed after the decision. The run of 2026-10-25 retired gpt-5.6-luna, gpt-5.4-mini and
// gpt-6-luna at reasoning low.
export const CANDIDATES: readonly EvalModel[] = [
  // The model the extension ships, so every run measures it.
  {
    id: `${ACTIVE_MODEL.provider}/${ACTIVE_MODEL.modelId}`,
    keyVariable: KEY_VARIABLES[ACTIVE_MODEL.provider],
    pricing: { input: 0.1, output: 0.5 },
    setup: activeModel,
  },
  {
    id: 'anthropic/claude-haiku-5-5',
    keyVariable: KEY_VARIABLES.anthropic,
    pricing: { input: 0.1, output: 0.5 },
    setup: anthropic('claude-haiku-5-5'),
  },
  {
    id: 'anthropic/claude-sonnet-5-5',
    keyVariable: KEY_VARIABLES.anthropic,
    pricing: { input: 2, output: 10 },
    setup: anthropic('claude-sonnet-5-5'),
  },
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
