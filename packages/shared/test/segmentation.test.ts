import { describe, expect, it } from 'vitest';
import { countWords, segmentSentences } from '../src/segmentation/index.ts';

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

  it('merges uppercase initials', () => {
    expect(texts('J. R. Smith spoke. T.C. Sağlık Bakanlığı açıkladı. A.B.C. Corp. grew.')).toEqual([
      'J. R. Smith spoke.',
      'T.C. Sağlık Bakanlığı açıkladı.',
      'A.B.C. Corp. grew.',
    ]);
    expect(texts('He met (J. R. Smith) today. Fine.')).toEqual([
      'He met (J. R. Smith) today.',
      'Fine.',
    ]);
  });

  it('leaves abbreviations to the segmenter, which breaks only before a capitalised word', () => {
    expect(texts('Dr. Smith arrived. He left.')).toEqual(['Dr.', 'Smith arrived.', 'He left.']);
    expect(texts('Elma, armut vb. Hepsi taze.')).toEqual(['Elma, armut vb.', 'Hepsi taze.']);
    expect(texts('See p. 12 and Fig. 3 here.')).toEqual(['See p. 12 and Fig. 3 here.']);
    expect(texts('Apples, pears, etc. and more.')).toEqual(['Apples, pears, etc. and more.']);
  });

  it('treats every line break as a boundary and never merges across one', () => {
    expect(texts('Heading\nFirst line. Second line.\n\nJ.\nSmith')).toEqual([
      'Heading',
      'First line.',
      'Second line.',
      'J.',
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

describe('countWords', () => {
  it('counts words and ignores punctuation', () => {
    expect(countWords('Two words.')).toBe(2);
    expect(countWords('İstanbul 1453 yılında fethedildi.')).toBe(4);
    expect(countWords('... !')).toBe(0);
  });

  it('splits a Japanese sentence written without spaces', () => {
    expect(countWords('東京都は火曜日に新しい地下鉄路線の建設計画を発表した。')).toBeGreaterThan(5);
  });
});
