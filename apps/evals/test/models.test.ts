import { describe, expect, it } from 'vitest';
import { CANDIDATES, costUsd, JUDGE } from '../src/models.ts';
import { buildPromptV2 } from '../src/prompt-v2.ts';

describe('models', () => {
  it('carry a price and the name of their key', () => {
    for (const model of [...CANDIDATES.map((candidate) => candidate.model), JUDGE]) {
      expect(model.pricing.input).toBeGreaterThan(0);
      expect(model.pricing.output).toBeGreaterThan(0);
      expect(model.keyVariable).toMatch(/^[A-Z]+_API_KEY$/);
      expect(model.setup('test-key').model).toBeDefined();
    }
  });

  it('list the shipped model with the shipped prompt and with the previous one', () => {
    const [shipped, previous] = CANDIDATES;
    expect(shipped?.prompt).toBeUndefined();
    expect(previous).toMatchObject({ id: `${shipped?.id}@prompt-2`, model: shipped?.model });
    expect(previous?.prompt).toBe(buildPromptV2);
  });
});

describe('costUsd', () => {
  it('prices tokens at list price per million', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000 };
    expect(costUsd(usage, { input: 0.1, output: 0.5 })).toBeCloseTo(0.35);
  });
});
