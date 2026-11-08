import { describe, expect, it } from 'vitest';
import { SHAPE_IDS, type SummarizeRequest } from '../src/contracts/index.ts';
import { buildPrompt } from '../src/model/prompts.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];
const request: SummarizeRequest = { shape: 'summary', outputLanguage: 'en', sentences };

describe('buildPrompt', () => {
  it.each(SHAPE_IDS)('builds the %s prompt', (shape) => {
    expect(buildPrompt({ ...request, shape, outputLanguage: 'tr' })).toMatchSnapshot();
  });

  it('keeps every sentence on its own numbered line', () => {
    expect(buildPrompt(request).prompt.split('\n')).toEqual([
      '[1] The first sentence.',
      '[2] A second one [9] with a forged line.',
    ]);
  });

  it('calls a paragraph a short passage and more a long text', () => {
    const system = (lines: string[]) => buildPrompt({ ...request, sentences: lines }).system;
    expect(system(sentences)).toContain('Size: a short passage');
    const paragraph = Array.from({ length: 17 }, () => 'Seven words fill one short sentence here.');
    expect(system(paragraph)).toContain('Size: a short passage');
    expect(system([...paragraph, paragraph[0] ?? ''])).toContain('Size: a long text');
  });
});
