import { describe, expect, it } from 'vitest';
import { summarizeRequestSchema } from '../src/contracts/index.ts';
import { MAX_SELECTION_CHARS } from '../src/limits/index.ts';

const request = {
  shape: 'summary',
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

  it('rejects an unknown shape', () => {
    expect(summarizeRequestSchema.safeParse({ ...request, shape: 'essay' }).success).toBe(false);
  });

  it.each(['not a tag', 'en-u-ca-gregory', 'en-x-foo'])(
    'rejects %j, which the prompt cannot name as a language',
    (outputLanguage) => {
      expect(summarizeRequestSchema.safeParse({ ...request, outputLanguage }).success).toBe(false);
    },
  );

  it('rejects an empty selection', () => {
    expect(summarizeRequestSchema.safeParse({ ...request, sentences: [] }).success).toBe(false);
  });

  it('rejects a selection above the character limit', () => {
    const sentences = ['x'.repeat(MAX_SELECTION_CHARS + 1)];
    expect(summarizeRequestSchema.safeParse({ ...request, sentences }).success).toBe(false);
  });
});
