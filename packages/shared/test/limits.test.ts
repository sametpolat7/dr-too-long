import { describe, expect, it } from 'vitest';
import {
  isWithinSelectionLimits,
  MAX_SELECTION_CHARS,
  MAX_SENTENCES,
} from '../src/limits/index.ts';

describe('isWithinSelectionLimits', () => {
  it('accepts a selection at both limits', () => {
    expect(isWithinSelectionLimits(MAX_SELECTION_CHARS, MAX_SENTENCES)).toBe(true);
  });

  it('refuses one character or one sentence too many', () => {
    expect(isWithinSelectionLimits(MAX_SELECTION_CHARS + 1, 1)).toBe(false);
    expect(isWithinSelectionLimits(1, MAX_SENTENCES + 1)).toBe(false);
  });
});
