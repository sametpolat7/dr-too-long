import { describe, expect, it } from 'vitest';
import { buildPrompt, PRESET_IDS, type SummarizeRequest } from '../src/contracts/index.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];
const request: SummarizeRequest = { v: 2, preset: 'summary', outputLanguage: 'en', sentences };

describe('buildPrompt', () => {
  it.each(PRESET_IDS)('builds the %s prompt', (preset) => {
    expect(buildPrompt({ ...request, preset, outputLanguage: 'tr' })).toMatchSnapshot();
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
