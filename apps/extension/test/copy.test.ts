import { describe, expect, it } from 'vitest';
import { copyText } from '../src/content/card/copy.ts';

const points = [
  { text: 'The keeper logged every ship.', sentences: [1] },
  { text: 'The notebooks dated the decline.', sentences: [2] },
];

describe('copyText', () => {
  it('copies a bulleted list as one "- " line per point', () => {
    expect(copyText('bulleted-list', points)).toBe(
      '- The keeper logged every ship.\n- The notebooks dated the decline.',
    );
  });

  it('copies a summary as one paragraph', () => {
    expect(copyText('summary', points)).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
  });

  it('copies a single sentence as one line', () => {
    expect(copyText('single-sentence', points.slice(0, 1))).toBe('The keeper logged every ship.');
  });
});
