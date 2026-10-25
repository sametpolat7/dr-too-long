import { describe, expect, it } from 'vitest';
import { CANDIDATES, costUsd, JUDGE } from '../src/models.ts';

describe('models', () => {
  it('carry a price and the name of their key', () => {
    for (const model of [...CANDIDATES, JUDGE]) {
      expect(model.pricing.input).toBeGreaterThan(0);
      expect(model.pricing.output).toBeGreaterThan(0);
      expect(model.keyVariable).toMatch(/^[A-Z]+_API_KEY$/);
      expect(model.setup('test-key').model).toBeDefined();
    }
  });
});

describe('costUsd', () => {
  it('prices tokens at list price per million', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 500_000 };
    expect(costUsd(usage, { input: 0.1, output: 0.5 })).toBeCloseTo(0.35);
  });
});
