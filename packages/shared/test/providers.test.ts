import { describe, expect, it } from 'vitest';
import { isProviderId, providerOfKey } from '../src/providers/index.ts';

describe('providers', () => {
  it.each([
    ['openai', true],
    ['google', true],
    ['mistral', false],
    ['toString', false],
    [undefined, false],
  ])('isProviderId(%j) is %s', (value, expected) => {
    expect(isProviderId(value)).toBe(expected);
  });

  it.each([
    ['sk-proj-abc', 'openai'],
    ['sk-ant-api03-abc', 'anthropic'],
    ['AIzaSyAbc', 'google'],
    ['AQ.Ab8RN6abc', 'google'],
    ['gsk_abc', undefined],
  ])('tells %s apart as a key of %s', (key, provider) => {
    expect(providerOfKey(key)).toBe(provider);
  });
});
