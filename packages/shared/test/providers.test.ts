import { describe, expect, it } from 'vitest';
import { isProviderId, PROVIDER_IDS } from '../src/providers/index.ts';

describe('providers', () => {
  it('lists OpenAI, Claude and Gemini in that order', () => {
    expect(PROVIDER_IDS).toEqual(['openai', 'anthropic', 'google']);
  });

  it.each([
    ['openai', true],
    ['google', true],
    ['mistral', false],
    ['toString', false],
    [undefined, false],
  ])('isProviderId(%j) is %s', (value, expected) => {
    expect(isProviderId(value)).toBe(expected);
  });
});
