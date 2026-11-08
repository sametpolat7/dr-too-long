import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  isListedLanguage,
  LANGUAGE_TAGS,
  resolveLanguage,
  textDirection,
} from '../src/languages.ts';

describe('LANGUAGE_TAGS', () => {
  it('lists each language once, with no regional variant', () => {
    const locales = LANGUAGE_TAGS.map((tag) => new Intl.Locale(tag));
    expect(locales.filter((locale) => locale.region !== undefined)).toEqual([]);
    const others = locales.map((locale) => locale.language).filter((language) => language !== 'zh');
    expect(new Set(others).size).toBe(others.length);
  });

  it('leaves out Catalan, and Thai and Amharic, whose prose the segmenter cannot split', () => {
    for (const tag of ['ca', 'th', 'am']) expect(isListedLanguage(tag)).toBe(false);
  });
});

describe('resolveLanguage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    fakeBrowser.i18n.getUILanguage = () => 'en-US';
  });

  it("writes in the chosen language, or Chrome's for Auto", () => {
    expect(resolveLanguage('tr')).toBe('tr');
    expect(resolveLanguage(null)).toBe('en-US');
  });
});

describe('textDirection', () => {
  const prototype = Intl.Locale.prototype as { getTextInfo?: unknown };
  const getTextInfo = prototype.getTextInfo;
  afterEach(() => {
    prototype.getTextInfo = getTextInfo;
  });

  it.each([
    ['ar', 'rtl'],
    ['fa', 'rtl'],
    ['he', 'rtl'],
    ['en-US', 'ltr'],
    ['zh-Hant', 'ltr'],
  ])('lays out %s as %s', (tag, direction) => {
    expect(textDirection(tag)).toBe(direction);
  });

  it('reads the textInfo getter of Chrome before 130', () => {
    prototype.getTextInfo = undefined;
    expect(textDirection('ar')).toBe('rtl');
  });
});
