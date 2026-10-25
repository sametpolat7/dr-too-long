import { MAX_SELECTION_CHARS } from '@dr-too-long/shared/limits';
import { describe, expect, it } from 'vitest';
import { loadCorpus, parseItem, requestFor } from '../src/corpus.ts';
import { corpusFile, corpusItem } from './fixtures.ts';

describe('parseItem', () => {
  it('reads the header and segments the text', () => {
    const item = corpusItem('en-99-sample', 'One sentence here. Another one follows.');
    expect(item).toMatchObject({
      id: 'en-99-sample',
      title: 'Sample',
      language: 'en',
      genre: 'test',
      source: 'https://example.com/sample',
      license: 'CC0',
      text: 'One sentence here. Another one follows.',
    });
    expect(item.sentences).toHaveLength(2);
  });

  it('rejects a file without a header', () => {
    expect(() => parseItem('x', 'Just text.')).toThrow('x: expected a header');
  });

  it('rejects a header without a license', () => {
    const header = 'title: T\nlanguage: en\ngenre: g\nsource: https://example.com';
    expect(() => parseItem('x', corpusFile('Text.', header))).toThrow('license');
  });

  it('rejects a language outside the corpus languages', () => {
    const header = 'title: T\nlanguage: de\ngenre: g\nsource: https://example.com\nlicense: CC0';
    expect(() => parseItem('x', corpusFile('Text.', header))).toThrow('language');
  });

  it('rejects a text beyond the selection limit', () => {
    expect(() => corpusItem('x', 'x'.repeat(MAX_SELECTION_CHARS + 1))).toThrow('too long');
  });
});

describe('requestFor', () => {
  it('builds a request for a preset and an output language', () => {
    const item = corpusItem('x', 'One. Two.');
    expect(requestFor(item, 'bulleted-list', 'tr')).toEqual({
      v: 1,
      preset: 'bulleted-list',
      outputLanguage: 'tr',
      sentences: item.sentences,
    });
  });
});

describe('loadCorpus', () => {
  it('loads every committed text in both languages', () => {
    const corpus = loadCorpus();
    const languages = new Set(corpus.map((item) => item.language));
    expect(corpus.length).toBeGreaterThanOrEqual(10);
    expect([...languages].sort()).toEqual(['en', 'tr']);
    for (const item of corpus) expect(item.sentences.length).toBeGreaterThanOrEqual(5);
  });
});
