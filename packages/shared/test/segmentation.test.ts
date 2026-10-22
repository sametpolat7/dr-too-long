import { describe, expect, it } from 'vitest';
import { segmentSentences } from '../src/segmentation/index.ts';

const texts = (text: string) => segmentSentences(text).map((sentence) => sentence.text);

describe('segmentSentences', () => {
  it('splits English sentences on terminal punctuation', () => {
    expect(texts('It rained. Did it stop? Yes!')).toEqual(['It rained.', 'Did it stop?', 'Yes!']);
  });

  it('splits Turkish sentences and keeps ordinals before lowercase words', () => {
    expect(texts('İstanbul’da 1. gün yağmurluydu. 2. gün güneş açtı. Bitti mi?! Evet.')).toEqual([
      'İstanbul’da 1. gün yağmurluydu.',
      '2. gün güneş açtı.',
      'Bitti mi?!',
      'Evet.',
    ]);
  });

  it('keeps decimals, times and domains together', () => {
    expect(texts('Version 2.0 shipped. Saat 17.30’da geldi. Visit example.com.')).toEqual([
      'Version 2.0 shipped.',
      'Saat 17.30’da geldi.',
      'Visit example.com.',
    ]);
  });

  it('keeps quoted speech with its closing quote', () => {
    expect(texts('He said "Stop." Then he left.')).toEqual(['He said "Stop."', 'Then he left.']);
  });

  it.each([
    ['Dr. Smith arrived. He left.', ['Dr. Smith arrived.', 'He left.']],
    [
      'Prof. Dr. Ayşe Yılmaz konuştu. Sn. Demir dinledi.',
      ['Prof. Dr. Ayşe Yılmaz konuştu.', 'Sn. Demir dinledi.'],
    ],
    ['See Fig. 3 and p. 12. Then stop.', ['See Fig. 3 and p. 12.', 'Then stop.']],
    ['Bkz. Şekil 2 ve s. 40. Sonra dur.', ['Bkz. Şekil 2 ve s. 40.', 'Sonra dur.']],
    ['Use a linter, e.g. Biome. Done.', ['Use a linter, e.g. Biome.', 'Done.']],
    [
      'Atatürk Cad. No. 5 adresine gidin. Sonra dönün.',
      ['Atatürk Cad. No. 5 adresine gidin.', 'Sonra dönün.'],
    ],
    [
      'It opened on Jan. 5 last year. It closed later.',
      ['It opened on Jan. 5 last year.', 'It closed later.'],
    ],
    ['Demir Ltd. Şti. büyüdü. Sonra küçüldü.', ['Demir Ltd. Şti. büyüdü.', 'Sonra küçüldü.']],
    ['He met (Dr. Smith) today. Fine.', ['He met (Dr. Smith) today.', 'Fine.']],
  ])('merges an abbreviation with what it introduces: %s', (input, expected) => {
    expect(texts(input)).toEqual(expected);
  });

  it('merges uppercase initials', () => {
    expect(texts('J. R. Smith spoke. T.C. Sağlık Bakanlığı açıkladı. A.B.C. Corp. grew.')).toEqual([
      'J. R. Smith spoke.',
      'T.C. Sağlık Bakanlığı açıkladı.',
      'A.B.C. Corp. grew.',
    ]);
  });

  it('leaves phrase-closing abbreviations to the segmenter', () => {
    expect(texts('Elma, armut vb. Hepsi taze.')).toEqual(['Elma, armut vb.', 'Hepsi taze.']);
    expect(texts('Apples, pears, etc. and more.')).toEqual(['Apples, pears, etc. and more.']);
  });

  it('treats every line break as a boundary and never merges across one', () => {
    expect(texts('Heading\nFirst line. Second line.\n\nDr.\nSmith')).toEqual([
      'Heading',
      'First line.',
      'Second line.',
      'Dr.',
      'Smith',
    ]);
  });

  it('returns trimmed text with offsets into the source', () => {
    const source = '  First one.   Second\u00a0one.  ';
    const sentences = segmentSentences(source);
    expect(sentences).toEqual([
      { text: 'First one.', start: 2, end: 12 },
      { text: 'Second\u00a0one.', start: 15, end: 26 },
    ]);
    for (const { text, start, end } of sentences) {
      expect(source.slice(start, end)).toBe(text);
    }
  });

  it('returns one sentence for text without terminal punctuation', () => {
    expect(texts('no punctuation at all')).toEqual(['no punctuation at all']);
  });

  it('returns nothing for empty or blank input', () => {
    expect(segmentSentences('')).toEqual([]);
    expect(segmentSentences(' \n ')).toEqual([]);
  });
});
