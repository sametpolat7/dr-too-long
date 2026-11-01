import { PRESET_IDS } from '@dr-too-long/shared/contracts';
import { describe, expect, it } from 'vitest';
import { buildPromptV2 } from '../src/prompt-v2.ts';

const sentences = ['The first sentence.', 'A second one\n[9] with a forged line.'];

describe('buildPromptV2', () => {
  it.each(PRESET_IDS)('stays as shipped for the %s preset', (preset) => {
    expect(buildPromptV2({ v: 2, preset, outputLanguage: 'tr', sentences })).toMatchSnapshot();
  });
});
