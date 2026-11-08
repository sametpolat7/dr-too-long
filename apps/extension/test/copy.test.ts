import { describe, expect, it } from 'vitest';
import { copyText } from '../src/content/card/copy.ts';

const points = [
  { text: 'The keeper logged every ship.', sentences: [1] },
  { text: 'The notebooks dated the decline.', sentences: [2] },
];

describe('copyText', () => {
  it('copies key points as one "- " line per point', () => {
    expect(copyText('key-points', points)).toBe(
      '- The keeper logged every ship.\n- The notebooks dated the decline.',
    );
  });

  it('copies a summary as one paragraph', () => {
    expect(copyText('summary', points)).toBe(
      'The keeper logged every ship. The notebooks dated the decline.',
    );
  });

  it('puts no space after a full-width sentence mark, even inside closing quotes', () => {
    const texts = ['灯台守は四十年間記録した。', '「記録は残った。」', '博物館が保管している。'];
    expect(
      copyText(
        'summary',
        texts.map((text) => ({ text, sentences: [1] })),
      ),
    ).toBe('灯台守は四十年間記録した。「記録は残った。」博物館が保管している。');
  });
});
