import { PRESET_IDS } from '@dr-too-long/shared/contracts';
import { describe, expect, it } from 'vitest';
import { buildPromptV1 } from '../src/prompt-v1.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];

describe('buildPromptV1', () => {
  it.each(PRESET_IDS)('stays as shipped for the %s preset', (preset) => {
    expect(buildPromptV1({ v: 1, preset, outputLanguage: 'tr', sentences })).toMatchSnapshot();
  });
});
