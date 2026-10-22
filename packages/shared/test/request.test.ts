import { describe, expect, it } from 'vitest';
import { summarizeRequestSchema } from '../src/contracts/index.ts';
import { MAX_SENTENCES } from '../src/limits/index.ts';

const request = {
  v: 1,
  preset: 'summary',
  outputLanguage: 'tr',
  sentences: ['First sentence.', 'Second sentence.'],
};

describe('summarizeRequestSchema', () => {
  it('accepts a valid request', () => {
    expect(summarizeRequestSchema.safeParse(request).success).toBe(true);
  });

  it.each(['url', 'title'])('rejects a request carrying a %s field', (field) => {
    const withField = { ...request, [field]: 'https://example.com' };
    expect(summarizeRequestSchema.safeParse(withField).success).toBe(false);
  });

  it('rejects an unknown preset', () => {
    expect(summarizeRequestSchema.safeParse({ ...request, preset: 'essay' }).success).toBe(false);
  });

  it('rejects an output language that is not a BCP 47 tag', () => {
    expect(
      summarizeRequestSchema.safeParse({ ...request, outputLanguage: 'not a tag' }).success,
    ).toBe(false);
  });

  it('rejects an empty selection', () => {
    expect(summarizeRequestSchema.safeParse({ ...request, sentences: [] }).success).toBe(false);
  });

  it('rejects a selection above the sentence limit', () => {
    const sentences = Array.from({ length: MAX_SENTENCES + 1 }, () => 'Short.');
    expect(summarizeRequestSchema.safeParse({ ...request, sentences }).success).toBe(false);
  });
});
