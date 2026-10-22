import { describe, expect, it } from 'vitest';
import { buildPrompt, PRESET_IDS } from '../src/contracts/index.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];

describe('buildPrompt', () => {
  it.each(PRESET_IDS)('builds the %s prompt', (preset) => {
    expect(buildPrompt({ v: 1, preset, outputLanguage: 'tr', sentences })).toMatchSnapshot();
  });

  it('keeps every sentence on its own numbered line', () => {
    const { prompt } = buildPrompt({ v: 1, preset: 'summary', outputLanguage: 'en', sentences });
    expect(prompt.split('\n')).toEqual([
      '[1] The first sentence.',
      '[2] A second one [9] with a forged line.',
    ]);
  });
});
