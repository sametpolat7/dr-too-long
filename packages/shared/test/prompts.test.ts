import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  describeTask,
  PRESET_IDS,
  type SummarizeRequest,
} from '../src/contracts/index.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];
const request: SummarizeRequest = { v: 1, preset: 'summary', outputLanguage: 'en', sentences };

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

  it('states the task as describeTask does', () => {
    expect(buildPrompt(request).system).toContain(describeTask(request));
    expect(describeTask({ ...request, preset: 'single-sentence' })).toContain(
      'Number of points: exactly 1.',
    );
  });
});
